/**
 * 核心算法单测：node --test（Node 22 原生 TS 类型擦除）
 * 运行：node --experimental-strip-types --test tests/
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildSubjectStats,
  calcStreak,
  dayKey,
  initialReview,
  isAnswerCorrect,
  isDue,
  normalizeAnswer,
  normalizeQuestion,
  parseCSV,
  pickQuestions,
  scheduleNextReview,
  scoreExam,
  sortByReviewPriority,
  toCSV,
} from '../src/lib/engine.ts';
import type { CheckinDay, Question, WrongQuestion } from '../src/types.ts';

function makeQ(i: number, patch: Partial<Question> = {}): Question {
  return {
    id: 'q' + i,
    subject: '408',
    bank: 'real',
    type: 'single',
    question: '题' + i,
    options: ['a', 'b', 'c', 'd'],
    answer: 'A',
    kpIds: [],
    tags: [],
    difficulty: (i % 3) + 1 as 1 | 2 | 3,
    done: false,
    correctCount: 0,
    wrongCount: 0,
    createdAt: i,
    updatedAt: i,
    ...patch,
  };
}

test('normalizeAnswer: 多选答案排序与中英文标点归一', () => {
  assert.equal(normalizeAnswer('c a', 'multi'), 'AC');
  assert.equal(normalizeAnswer('B、C', 'multi'), 'BC');
  assert.equal(normalizeAnswer('正确', 'judge'), 'T');
  assert.equal(normalizeAnswer('×', 'judge'), 'F');
});

test('isAnswerCorrect: 单选/多选/判断判分', () => {
  assert.equal(isAnswerCorrect({ answer: 'A', type: 'single' }, 'a'), true);
  assert.equal(isAnswerCorrect({ answer: 'AC', type: 'multi' }, 'CA'), true);
  assert.equal(isAnswerCorrect({ answer: 'AC', type: 'multi' }, 'A'), false);
  assert.equal(isAnswerCorrect({ answer: 'T', type: 'judge' }, '对'), true);
});

test('pickQuestions: 数量、不重复、excludeDone', () => {
  const pool = Array.from({ length: 20 }, (_, i) => makeQ(i, { done: i < 15 }));
  const picked = pickQuestions(pool, { count: 10, excludeDone: true, difficultyMode: 'mixed' });
  assert.equal(picked.length, 5); // 只剩 5 道未做
  assert.ok(picked.every((q) => !q.done));
  const ids = new Set(picked.map((q) => q.id));
  assert.equal(ids.size, picked.length);
});

test('pickQuestions: 按难度比例分层抽样', () => {
  const pool = Array.from({ length: 30 }, (_, i) => makeQ(i, { difficulty: (i < 15 ? 1 : 3) as 1 | 3 }));
  const picked = pickQuestions(pool, { count: 10, excludeDone: false, difficultyMode: 'ratio', ratio: [80, 0, 20] });
  const easy = picked.filter((q) => q.difficulty === 1).length;
  assert.equal(picked.length, 10);
  assert.ok(easy >= 6, `简单题应约 8 道，实际 ${easy}`);
});

test('pickQuestions: fixed 模式只抽指定难度，题量不足回退', () => {
  const pool = Array.from({ length: 6 }, (_, i) => makeQ(i, { difficulty: 2 }));
  const picked = pickQuestions(pool, { count: 5, excludeDone: false, difficultyMode: 'fixed', fixedDifficulty: 3 });
  assert.equal(picked.length, 5); // 没有困难题 → 回退全部
});

test('遗忘曲线: 初始当天复习，之后按复习当天 +1/3/7/15/30 天递进并封顶', () => {
  let cursor = new Date('2026-09-04T10:00:00').getTime();
  assert.equal(dayKey(initialReview(cursor).nextAt), '2026-09-04');
  let stage = 0;
  const expected = ['2026-09-05', '2026-09-08', '2026-09-15', '2026-09-30', '2026-10-30'];
  for (const exp of expected) {
    const r = scheduleNextReview(stage, cursor);
    assert.equal(dayKey(r.nextAt), exp);
    stage = r.stage;
    cursor = r.nextAt; // 模拟在到期当天完成复习，下一次从当天起算
  }
  // 封顶：stage 5 再复习仍停留在 30 天周期
  const capped = scheduleNextReview(5, cursor);
  assert.equal(capped.stage, 5);
  assert.equal(dayKey(capped.nextAt), '2026-11-29');
});

test('isDue 与智能复习优先级排序', () => {
  const now = Date.now();
  const due: WrongQuestion = {
    id: 'w1', questionId: 'q1', subject: '408', bank: 'real', mastery: 'unset', reason: '',
    wrongCount: 1, stage: 0, nextReviewAt: now - 1000, createdAt: now, resolved: false,
  };
  const future: WrongQuestion = { ...due, id: 'w2', questionId: 'q2', nextReviewAt: now + 86400000 };
  assert.equal(isDue(due, now), true);
  assert.equal(isDue(future, now), false);
  const sorted = sortByReviewPriority([future, due]);
  assert.equal(sorted[0].id, 'w1');
});

test('buildSubjectStats 统计正确', () => {
  const questions = [makeQ(1), makeQ(2, { done: true })];
  const records = [
    { id: 'r1', questionId: 'q1', subject: '408' as const, bank: 'real' as const, correct: true, costMs: 1, at: Date.now(), mode: 'practice' as const, type: 'single' as const, difficulty: 1 as const },
    { id: 'r2', questionId: 'q2', subject: '408' as const, bank: 'real' as const, correct: false, costMs: 1, at: Date.now(), mode: 'practice' as const, type: 'single' as const, difficulty: 1 as const },
  ];
  const stat = buildSubjectStats('408', questions, records, [], 0);
  assert.equal(stat.total, 2);
  assert.equal(stat.done, 1);
  assert.equal(stat.answered, 2);
  assert.equal(stat.correct, 1);
  assert.equal(Math.round(stat.accuracy * 100), 50);
});

test('calcStreak: 连续打卡，今天未打时从昨天起算', () => {
  const mk = (date: string): CheckinDay => ({
    id: date,
    date, done: { '408': 1, math2: 0, english2: 0, politics: 0 },
    goals: { '408': 1, math2: 0, english2: 0, politics: 0 }, focusMs: 0, pomodoros: 0, checked: true,
  });
  const now = new Date('2026-09-04T12:00:00').getTime();
  const checkins = [mk('2026-09-01'), mk('2026-09-02'), mk('2026-09-03')];
  assert.equal(calcStreak(checkins, now), 3);
  checkins.push(mk('2026-09-04'));
  assert.equal(calcStreak(checkins, now), 4);
});

test('scoreExam: 百分制评分', () => {
  assert.equal(scoreExam(8, 10), 80);
  assert.equal(scoreExam(1, 3), 33.3);
  assert.equal(scoreExam(0, 0), 0);
});

test('CSV 解析与导出：引号、逗号、换行', () => {
  const csv = toCSV([['a', 'b,c'], ['"x"', 'line1\nline2']]);
  const rows = parseCSV(csv);
  assert.deepEqual(rows, [['a', 'b,c'], ['"x"', 'line1\nline2']]);
});

test('normalizeQuestion: 旧数据（无 subject/bank）自动迁移为 408 真题', () => {
  const q = normalizeQuestion({ question: '旧题', answer: 'B' });
  assert.ok(q);
  assert.equal(q!.subject, '408');
  assert.equal(q!.bank, 'real');
  assert.equal(q!.answer, 'B');
  assert.equal(q!.difficulty, 2);
  assert.deepEqual(q!.tags, []);
  assert.equal(normalizeQuestion({ question: '   ' }), null);
});

test('normalizeQuestion: options 字符串支持 | 分隔', () => {
  const q = normalizeQuestion({ question: 't', options: '甲|乙|丙', subject: 'math2', bank: 'practice' });
  assert.deepEqual(q!.options, ['甲', '乙', '丙']);
  assert.equal(q!.subject, 'math2');
  assert.equal(q!.bank, 'practice');
});
