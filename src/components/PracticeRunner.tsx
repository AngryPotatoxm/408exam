/**
 * PracticeRunner —— 做题流程（随机练习 / 智能复习 / 知识点练习共用）
 * 作答后立即显示对错与解析，自动记录结果（对错、用时、日期），
 * 答错自动入错题本；复习模式下同时推进遗忘曲线阶段。
 */
import { useMemo, useRef, useState } from 'react';
import { DIFFICULTY_MAP, QUESTION_TYPE_MAP, SUBJECT_MAP } from '../constants';
import { decodeNote, isAnswerCorrect, normalizeAnswer } from '../lib/engine';
import { useStore } from '../lib/store';
import type { PracticeMode, Question } from '../types';
import { Badge, Button, Card, Empty } from './ui';

export function PracticeRunner({
  questions,
  mode,
  title,
  wrongIdMap,
  onClose,
}: {
  questions: Question[];
  mode: PracticeMode;
  title: string;
  /** 复习模式：questionId -> wrongQuestion.id */
  wrongIdMap?: Record<string, string>;
  onClose: () => void;
}) {
  const { recordAnswer, manualAddWrong, wrongs, setNote, kps } = useStore();
  const [idx, setIdx] = useState(0);
  const [picks, setPicks] = useState<string[]>([]);
  const [textAnswer, setTextAnswer] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [selfJudge, setSelfJudge] = useState<boolean | null>(null);
  const [results, setResults] = useState<{ id: string; correct: boolean; costMs: number }[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const startRef = useRef(Date.now());

  const q = questions[idx];
  const finished = idx >= questions.length;
  const multi = q?.type === 'multi';
  const objective = q?.type === 'single' || q?.type === 'multi' || q?.type === 'judge';
  const userAnswerStr = useMemo(() => {
    if (q?.type === 'judge') return picks[0] ?? '';
    if (objective) return picks.slice().sort().join('');
    return textAnswer;
  }, [picks, textAnswer, objective, q]);

  if (!questions.length) return <Empty title="没有可练习的题目" hint="请先导入题目" action={<Button onClick={onClose}>返回</Button>} />;
  if (finished) return <ResultView results={results} questions={questions} onClose={onClose} title={title} />;

  const togglePick = (v: string) => {
    if (revealed) return;
    if (q.type === 'single' || q.type === 'judge') {
      setPicks([v]);
      judge([v]);
    } else {
      setPicks((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v].sort()));
    }
  };

  /** 客观题：选定即判（多选需点确认） */
  const judge = (override?: string[]) => {
    const ans = (override ?? picks).slice().sort().join('');
    if (!ans.length) return;
    commit(isAnswerCorrect(q, ans));
  };

  /** 仅展示参考答案（填空/解答题自评前） */
  const showReference = () => {
    if (!textAnswer.trim()) return;
    setRevealed(true);
    setNoteDraft(decodeNote(q.note));
  };

  /** 提交判定并记录（每道题只记录一次） */
  const commit = (correct: boolean) => {
    if (results.some((r) => r.id === q.id)) return;
    const costMs = Date.now() - startRef.current;
    setRevealed(true);
    setSelfJudge(correct);
    setResults((r) => [...r, { id: q.id, correct, costMs }]);
    recordAnswer({ questionId: q.id, correct, costMs, mode });
    if (!noteDraft) setNoteDraft(decodeNote(q.note));
  };

  const next = () => {
    setIdx((i) => i + 1);
    setPicks([]);
    setTextAnswer('');
    setRevealed(false);
    setSelfJudge(null);
    setNoteDraft('');
    startRef.current = Date.now();
  };

  const inWrong = wrongs.some((w) => w.questionId === q.id && !w.resolved);
  const optClass = (letter: string) => {
    if (!revealed) return `opt-line ${picks.includes(letter) ? 'selected' : ''}`;
    const correctLetters = normalizeAnswer(q.answer, q.type).split('');
    if (correctLetters.includes(letter)) return 'opt-line correct';
    if (picks.includes(letter)) return 'opt-line wrong-pick';
    return 'opt-line';
  };

  return (
    <div>
      <div className="row-between mb12">
        <div className="row">
          <strong>{title}</strong>
          <Badge tone="blue">{SUBJECT_MAP[q.subject].short}</Badge>
          <Badge>{QUESTION_TYPE_MAP[q.type]}</Badge>
          <Badge tone="amber">{DIFFICULTY_MAP[q.difficulty].name}</Badge>
          {q.year ? <Badge>{q.year}</Badge> : null}
          <span className="muted">
            第 {idx + 1} / {questions.length} 题
          </span>
        </div>
        <Button size="sm" onClick={onClose}>
          退出练习
        </Button>
      </div>
      <div className="progress mb12">
        <i style={{ width: `${(idx / questions.length) * 100}%` }} />
      </div>
      <div className="card">
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, whiteSpace: 'pre-wrap' }}>{q.question}</div>
        {(q.type === 'single' || q.type === 'multi') && (
          <div>
            {q.options?.map((opt, i) => {
              const letter = String.fromCharCode(65 + i);
              return (
                <div key={i} className={optClass(letter)} onClick={() => togglePick(letter)}>
                  {letter}. {opt}
                </div>
              );
            })}
            {multi && !revealed && (
              <Button variant="primary" size="sm" onClick={() => judge()} disabled={picks.length === 0}>
                提交答案
              </Button>
            )}
          </div>
        )}
        {q.type === 'judge' && (
          <div className="row">
            <div className={`opt-line ${picks.includes('T') ? 'selected' : ''}`} style={{ padding: '10px 26px' }} onClick={() => togglePick('T')}>
              ✓ 正确
            </div>
            <div className={`opt-line ${picks.includes('F') ? 'selected' : ''}`} style={{ padding: '10px 26px' }} onClick={() => togglePick('F')}>
              ✗ 错误
            </div>
          </div>
        )}
        {(q.type === 'fill' || q.type === 'essay') && !revealed && (
          <div>
            <textarea rows={3} value={textAnswer} onChange={(e) => setTextAnswer(e.target.value)} placeholder="输入你的答案" />
            <div className="row mt8">
              <Button size="sm" onClick={showReference} disabled={!textAnswer.trim()}>
                查看参考答案
              </Button>
            </div>
          </div>
        )}
        {revealed && (
          <div className="mt12">
            {q.type === 'fill' || q.type === 'essay' ? (
              <div className="row mb12">
                <span className="muted">对照参考答案，请自评（点击后记录）：</span>
                <Button size="sm" variant="success" disabled={selfJudge !== null} onClick={() => commit(true)}>
                  我答对了
                </Button>
                <Button size="sm" variant="danger" disabled={selfJudge !== null} onClick={() => commit(false)}>
                  我答错了
                </Button>
              </div>
            ) : null}
            <div style={{ color: selfJudge ? 'var(--success)' : selfJudge === false ? 'var(--danger)' : 'var(--text-2)', fontWeight: 700, fontSize: 15 }}>
              {selfJudge === null ? '请在下方自评本题' : selfJudge ? '✓ 回答正确' : '✗ 回答错误'}
              <span className="muted" style={{ fontWeight: 400, marginLeft: 10 }}>
                参考答案：{q.answer}
              </span>
            </div>
            <div className="mt8">
              <strong>解析：</strong>
              <span style={{ whiteSpace: 'pre-wrap' }}>{q.analysis || '暂无解析'}</span>
            </div>
            {q.kpIds.length > 0 && (
              <div className="mt8 muted">关联知识点：{q.kpIds.map((id) => kps.find((k) => k.id === id)?.name).filter(Boolean).join('、')}</div>
            )}
            <div className="field mt12">
              <label>我的笔记</label>
              <textarea rows={2} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="记录解题思路..." />
            </div>
            <div className="row-between mt8">
              <div className="row">
                {!inWrong && (
                  <Button size="sm" onClick={() => manualAddWrong(q.id)}>
                    手动加入错题本
                  </Button>
                )}
                <Button size="sm" onClick={() => { setNote(q.id, noteDraft); }}>
                  保存笔记
                </Button>
              </div>
              {idx + 1 < questions.length ? (
                <Button variant="primary" onClick={next} disabled={selfJudge === null}>
                  下一题 →
                </Button>
              ) : (
                <Button variant="primary" onClick={next} disabled={selfJudge === null}>
                  查看结果
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultView({
  results,
  questions,
  onClose,
  title,
}: {
  results: { id: string; correct: boolean; costMs: number }[];
  questions: Question[];
  onClose: () => void;
  title: string;
}) {
  const correct = results.filter((r) => r.correct).length;
  const total = results.length;
  const acc = total ? Math.round((correct / total) * 100) : 0;
  const totalSec = Math.round(results.reduce((s, r) => s + r.costMs, 0) / 1000);
  return (
    <Card>
      <h3>{title} · 练习完成</h3>
      <div className="grid grid-4 mt12">
        <div>
          <div className="stat-num">{total}</div>
          <div className="stat-label">做题数</div>
        </div>
        <div>
          <div className="stat-num" style={{ color: 'var(--success)' }}>{correct}</div>
          <div className="stat-label">答对</div>
        </div>
        <div>
          <div className="stat-num" style={{ color: 'var(--danger)' }}>{total - correct}</div>
          <div className="stat-label">答错</div>
        </div>
        <div>
          <div className="stat-num">{acc}%</div>
          <div className="stat-label">正确率 · 用时 {Math.floor(totalSec / 60)}分{totalSec % 60}秒</div>
        </div>
      </div>
      <div className="mt16">
        <table className="data">
          <thead>
            <tr><th>#</th><th>题干</th><th>结果</th><th>用时</th></tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={r.id}>
                <td>{i + 1}</td>
                <td style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {questions.find((q) => q.id === r.id)?.question}
                </td>
                <td>{r.correct ? <Badge tone="green">正确</Badge> : <Badge tone="red">错误</Badge>}</td>
                <td>{(r.costMs / 1000).toFixed(1)}s</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt16 row">
        <Button variant="primary" onClick={onClose}>
          返回题库
        </Button>
      </div>
    </Card>
  );
}
