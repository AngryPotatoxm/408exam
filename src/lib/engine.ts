/**
 * engine.ts —— 纯业务逻辑层（无 React、无 DOM 依赖，可直接单测）
 * 包含：随机抽题算法、判分、遗忘曲线调度、统计、打卡、成就、模考评分、
 *       CSV/JSON 导入归一化（旧数据兼容）、XSS 转义、防抖节流、笔记 Base64、成绩预测
 */
import { EB_INTERVAL_DAYS } from '../constants';
import type {
  CheckinDay,
  Difficulty,
  ExamRecord,
  PickOptions,
  PracticeRecord,
  Question,
  QuestionType,
  SubjectId,
  WrongQuestion,
} from '../types';

/* ---------------- 基础工具 ---------------- */
export function uid(prefix = ''): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/** Fisher–Yates 洗牌（不修改原数组） */
export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function dayKey(ts: number | Date = Date.now()): string {
  const d = typeof ts === 'number' ? new Date(ts) : ts;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfDay(ts = Date.now()): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 统计范围起点时间戳 */
export function rangeStart(range: 'day' | 'week' | 'month' | 'all', now = Date.now()): number {
  if (range === 'all') return 0;
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (range === 'week') d.setDate(d.getDate() - 6); // 近 7 天
  if (range === 'month') d.setMonth(d.getMonth() - 1);
  return d.getTime();
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait = 300) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function throttle<A extends unknown[]>(fn: (...args: A) => void, wait = 200) {
  let last = 0;
  return (...args: A) => {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn(...args);
    }
  };
}

/** XSS：所有用户输入在插入 innerHTML / 打印视图前必须先转义（React 文本节点默认安全，双保险） */
export function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 笔记简单加密 Base64（需求第十三条；非强加密，仅避免明文直读） */
export function encodeNote(text: string): string {
  if (!text) return '';
  try {
    return 'b64:' + btoa(unescape(encodeURIComponent(text)));
  } catch {
    return '';
  }
}
export function decodeNote(stored?: string): string {
  if (!stored) return '';
  if (!stored.startsWith('b64:')) return stored; // 兼容历史明文
  try {
    return decodeURIComponent(escape(atob(stored.slice(4))));
  } catch {
    return '';
  }
}

/* ---------------- 判分 ---------------- */
export function normalizeAnswer(raw: string, type: QuestionType): string {
  let v = String(raw ?? '').trim().toUpperCase().replace(/[\s,，、]/g, '');
  if (type === 'judge') {
    if (['T', 'TRUE', '对', '正确', '√', 'Y', '是'].includes(v)) return 'T';
    if (['F', 'FALSE', '错', '错误', '×', 'N', '否'].includes(v)) return 'F';
  }
  if (type === 'multi') v = v.split('').sort().join('');
  return v;
}

export function isAnswerCorrect(q: Pick<Question, 'answer' | 'type'>, userAnswer: string): boolean {
  return normalizeAnswer(q.answer, q.type) === normalizeAnswer(userAnswer, q.type);
}

/* ---------------- 随机抽题算法 ---------------- */
/**
 * 从题库随机抽题
 * @param pool 某科目+某题库的全部题目
 * @param opts.count 数量；excludeDone 跳过 done=true；
 *        difficultyMode: mixed 完全随机 / ratio 按难度比例 / fixed 仅指定难度
 */
export function pickQuestions(pool: Question[], opts: PickOptions): Question[] {
  let candidates = pool.slice();
  if (opts.excludeDone) candidates = candidates.filter((q) => !q.done);
  if (opts.difficultyMode === 'fixed' && opts.fixedDifficulty) {
    const only = candidates.filter((q) => q.difficulty === opts.fixedDifficulty);
    // 该难度题量不足时回退为全部候选，避免无题可做
    if (only.length > 0) candidates = only;
  }
  if (opts.difficultyMode !== 'ratio' || !opts.ratio) {
    return shuffle(candidates).slice(0, opts.count);
  }
  // 按难度比例分层抽样
  const [r1, r2, r3] = opts.ratio;
  const total = r1 + r2 + r3 || 100;
  const groups: Record<Difficulty, Question[]> = {
    1: shuffle(candidates.filter((q) => q.difficulty === 1)),
    2: shuffle(candidates.filter((q) => q.difficulty === 2)),
    3: shuffle(candidates.filter((q) => q.difficulty === 3)),
  };
  const quotas: Record<Difficulty, number> = {
    1: Math.round((opts.count * r1) / total),
    2: Math.round((opts.count * r2) / total),
    3: opts.count - Math.round((opts.count * r1) / total) - Math.round((opts.count * r2) / total),
  };
  const picked: Question[] = [];
  (Object.keys(groups) as unknown as Difficulty[]).forEach((d) => {
    picked.push(...groups[d].splice(0, Math.max(0, quotas[d])));
  });
  // 某层不足时用其余层未抽中的题补齐
  if (picked.length < opts.count) {
    const rest = shuffle(candidates.filter((q) => !picked.some((p) => p.id === q.id)));
    picked.push(...rest.slice(0, opts.count - picked.length));
  }
  return shuffle(picked).slice(0, opts.count);
}

/** 某科目+题库剩余未做题数 */
export function remainingCount(pool: Question[]): number {
  return pool.filter((q) => !q.done).length;
}

/* ---------------- 遗忘曲线调度 ---------------- */
/**
 * 根据当前阶段计算下一次复习时间
 * stage 从 0 开始：答错当天(0天) → 1 → 3 → 7 → 15 → 30 天，封顶停留在 30 天周期
 */
export function scheduleNextReview(stage: number, now = Date.now()): { stage: number; nextAt: number } {
  const nextStage = Math.min(stage + 1, EB_INTERVAL_DAYS.length - 1);
  const days = EB_INTERVAL_DAYS[nextStage];
  return { stage: nextStage, nextAt: startOfDay(now) + days * 86400000 };
}

/** 答错入错题本时的初始调度（当天需复习） */
export function initialReview(now = Date.now()): { stage: number; nextAt: number } {
  return { stage: 0, nextAt: startOfDay(now) };
}

/** 错题是否到期需要复习 */
export function isDue(w: Pick<WrongQuestion, 'nextReviewAt' | 'resolved'>, now = Date.now()): boolean {
  return !w.resolved && w.nextReviewAt <= now;
}

/** 智能复习排序：到期优先，到期越早越靠前；未到期按 nextReviewAt 升序；同时间按错误次数多者优先 */
export function sortByReviewPriority(list: WrongQuestion[]): WrongQuestion[] {
  return list.slice().sort((a, b) => {
    const dueDiff = Number(isDue(b)) - Number(isDue(a));
    if (dueDiff !== 0) return dueDiff;
    if (a.nextReviewAt !== b.nextReviewAt) return a.nextReviewAt - b.nextReviewAt;
    return b.wrongCount - a.wrongCount;
  });
}

/* ---------------- 统计 ---------------- */
export interface SubjectStat {
  subject: SubjectId;
  total: number;
  done: number;
  undone: number;
  wrongActive: number;
  answered: number; // 范围内作答次数
  correct: number;
  accuracy: number; // 0~1
  focusMs: number;
}

export function buildSubjectStats(
  subject: SubjectId,
  questions: Question[],
  records: PracticeRecord[],
  wrongs: WrongQuestion[],
  from = 0,
): SubjectStat {
  const qs = questions.filter((q) => q.subject === subject);
  const inRange = records.filter((r) => r.subject === subject && r.at >= from);
  const correct = inRange.filter((r) => r.correct).length;
  const answered = inRange.length;
  return {
    subject,
    total: qs.length,
    done: qs.filter((q) => q.done).length,
    undone: qs.filter((q) => !q.done).length,
    wrongActive: wrongs.filter((w) => w.subject === subject && !w.resolved).length,
    answered,
    correct,
    accuracy: answered ? correct / answered : 0,
    focusMs: 0,
  };
}

/** 按题型正确率 */
export function accuracyByType(records: PracticeRecord[], from = 0): Record<string, { total: number; correct: number }> {
  const out: Record<string, { total: number; correct: number }> = {};
  records
    .filter((r) => r.at >= from)
    .forEach((r) => {
      out[r.type] ??= { total: 0, correct: 0 };
      out[r.type].total += 1;
      if (r.correct) out[r.type].correct += 1;
    });
  return out;
}

/** 每日刷题量序列（用于趋势图） */
export function dailySeries(records: PracticeRecord[], days: number, now = Date.now()) {
  const keys: string[] = [];
  const correctArr: number[] = [];
  const totalArr: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const t = startOfDay(now) - i * 86400000;
    const k = dayKey(t);
    const dayRecords = records.filter((r) => dayKey(r.at) === k);
    keys.push(k.slice(5));
    totalArr.push(dayRecords.length);
    correctArr.push(dayRecords.filter((r) => r.correct).length);
  }
  return { keys, totalArr, correctArr };
}

/** 错题新增趋势（按错题 createdAt） */
export function wrongDailySeries(wrongs: WrongQuestion[], days: number, now = Date.now()) {
  const keys: string[] = [];
  const arr: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const t = startOfDay(now) - i * 86400000;
    const k = dayKey(t);
    keys.push(k.slice(5));
    arr.push(wrongs.filter((w) => dayKey(w.createdAt) === k).length);
  }
  return { keys, arr };
}

/* ---------------- 打卡 ---------------- */
/** 连续打卡天数：从今天（或昨天）向前数 */
export function calcStreak(checkins: CheckinDay[], now = Date.now()): number {
  const map = new Map(checkins.map((c) => [c.date, c]));
  let cursor = startOfDay(now);
  // 今天尚未打卡时允许从昨天起算，避免白天显示断卡
  if (!map.get(dayKey(cursor))?.checked) cursor -= 86400000;
  let streak = 0;
  while (map.get(dayKey(cursor))?.checked) {
    streak += 1;
    cursor -= 86400000;
  }
  return streak;
}

export function totalCheckinDays(checkins: CheckinDay[]): number {
  return checkins.filter((c) => c.checked).length;
}

/** 当日各科目标是否全部完成（目标为 0 的科目视为不要求） */
export function isGoalMet(day: CheckinDay): boolean {
  const subjects = Object.keys(day.goals) as SubjectId[];
  const required = subjects.filter((s) => day.goals[s] > 0);
  if (required.length === 0) return false;
  return required.every((s) => (day.done[s] ?? 0) >= day.goals[s]);
}

/* ---------------- 成就 ---------------- */
export function evaluateAchievements(ctx: {
  records: PracticeRecord[];
  checkins: CheckinDay[];
  exams: ExamRecord[];
  wrongs: WrongQuestion[];
  pomodoros: number;
  unlocked: string[];
  now?: number;
}): string[] {
  const now = ctx.now ?? Date.now();
  const total = ctx.records.length;
  const streak = calcStreak(ctx.checkins, now);
  const newly: string[] = [];
  const has = new Set(ctx.unlocked);
  const grant = (id: string, cond: boolean) => {
    if (cond && !has.has(id)) newly.push(id);
  };
  grant('first_step', total >= 1);
  grant('checkin_3', streak >= 3);
  grant('checkin_7', streak >= 7);
  grant('checkin_30', streak >= 30);
  grant('total_100', total >= 100);
  grant('total_500', total >= 500);
  grant('total_1000', total >= 1000);
  grant('exam_pass', ctx.exams.some((e) => e.score >= 60));
  grant('exam_good', ctx.exams.some((e) => e.score >= 80));
  grant('pomodoro_10', ctx.pomodoros >= 10);
  const touched = new Set(ctx.records.map((r) => r.subject));
  grant('all_subjects', touched.size >= 4);
  // 错题清零：存在过错题、且当前无未解决错题
  grant('wrong_clear', ctx.wrongs.length > 0 && ctx.wrongs.every((w) => w.resolved));
  return newly;
}

/* ---------------- 模考 ---------------- */
/** 百分制评分（每题等分） */
export function scoreExam(correct: number, total: number): number {
  if (!total) return 0;
  return Math.round((correct / total) * 1000) / 10;
}

/** 基于最近模考的成绩预测：按时间指数加权（越近权重越高） */
export function predictScore(exams: ExamRecord[]): number | null {
  if (!exams.length) return null;
  const sorted = exams.slice().sort((a, b) => a.at - b.at).slice(-5);
  let wSum = 0;
  let sSum = 0;
  sorted.forEach((e, i) => {
    const w = Math.pow(1.4, i);
    wSum += w;
    sSum += e.score * w;
  });
  return Math.round((sSum / wSum) * 10) / 10;
}

/* ---------------- 导入导出：CSV + 数据归一化（兼容旧 408 数据） ---------------- */
/** 解析带引号的 CSV 为二维数组 */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',' || c === '\t') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  }
  return rows;
}

export function toCSV(rows: (string | number | undefined)[][]): string {
  const escape = (v: string | number | undefined) => {
    const s = String(v ?? '');
    return /[",\n\r\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(escape).join(',')).join('\r\n');
}

/** 导入行/对象归一化为 Question，自动补齐新字段、兼容旧数据（入参为宽松对象，逐字段归一化） */
export function normalizeQuestion(raw: Record<string, unknown>, fallbackSubject: SubjectId = '408'): Question | null {
  const questionText = String(raw.question ?? raw.title ?? raw.stem ?? '').trim();
  if (!questionText) return null;
  const now = Date.now();
  const subject = (['408', 'math2', 'english2', 'politics'].includes(String(raw.subject))
    ? raw.subject
    : fallbackSubject) as SubjectId;
  const bank = raw.bank === 'practice' ? 'practice' : 'real';
  let options: unknown = raw.options;
  if (typeof options === 'string') {
    try {
      options = JSON.parse(options);
    } catch {
      options = (options as string).split(/[|｜]/).map((s) => s.trim()).filter(Boolean);
    }
  }
  const rawTags: unknown = raw.tags;
  const tags: unknown = Array.isArray(rawTags) ? rawTags : typeof rawTags === 'string' ? rawTags.split(/[|｜,，]/).filter(Boolean) : [];
  const rawKp: unknown = raw.kpIds;
  const kpIds: unknown = Array.isArray(rawKp)
    ? rawKp
    : typeof rawKp === 'string'
      ? rawKp.split(/[|｜,，]/).filter(Boolean)
      : [];
  const difficulty = ([1, 2, 3].includes(Number(raw.difficulty)) ? Number(raw.difficulty) : 2) as Difficulty;
  return {
    id: String(raw.id ?? uid('q_')),
    subject,
    bank,
    year: raw.year ? Number(raw.year) : undefined,
    type: (['single', 'multi', 'judge', 'fill', 'essay'].includes(String(raw.type)) ? raw.type : 'single') as QuestionType,
    chapter: raw.chapter ? String(raw.chapter) : undefined,
    source: raw.source ? String(raw.source) : undefined,
    question: questionText,
    options: Array.isArray(options) ? (options as string[]) : undefined,
    answer: String(raw.answer ?? '').trim(),
    analysis: raw.analysis ? String(raw.analysis) : undefined,
    kpIds: kpIds as string[],
    tags: tags as string[],
    difficulty,
    note: raw.note ? String(raw.note) : undefined,
    done: Boolean(raw.done),
    correctCount: Number(raw.correctCount ?? 0) || 0,
    wrongCount: Number(raw.wrongCount ?? 0) || 0,
    lastPracticedAt: raw.lastPracticedAt ? Number(raw.lastPracticedAt) : undefined,
    createdAt: Number(raw.createdAt ?? now),
    updatedAt: now,
  };
}

/** 题库导出表头（JSON/CSV/Excel 统一字段，与 408 原格式一致） */
export const QUESTION_CSV_HEADERS = [
  'id', 'subject', 'bank', 'year', 'type', 'chapter', 'source',
  'question', 'options', 'answer', 'analysis', 'kpIds', 'tags',
  'difficulty', 'done', 'correctCount', 'wrongCount', 'note',
];

export function questionToRow(q: Question): (string | number | undefined)[] {
  return [
    q.id, q.subject, q.bank, q.year ?? '', q.type, q.chapter ?? '', q.source ?? '',
    q.question, q.options ? JSON.stringify(q.options) : '', q.answer, q.analysis ?? '',
    q.kpIds.join('|'), q.tags.join('|'), q.difficulty, q.done ? '1' : '0',
    q.correctCount, q.wrongCount, decodeNote(q.note),
  ];
}
