/**
 * ExamRunner —— 模拟考试
 * 配置题量与限时（默认 180 分钟）→ 随机组卷 → 倒计时（到点自动交卷）
 * → 总分/各题型得分/逐题解析，错题自动入错题本，模考记录保存。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { QUESTION_TYPE_MAP, SUBJECT_MAP } from '../constants';
import { isAnswerCorrect, pickQuestions, scoreExam } from '../lib/engine';
import { useStore } from '../lib/store';
import type { Question, QuestionType, SubjectId } from '../types';
import { Badge, Button, Empty } from './ui';

type Phase = 'config' | 'running' | 'result';

export function ExamRunner({ subject, pool, onClose }: { subject: SubjectId; pool: Question[]; onClose: () => void }) {
  const { saveExam, recordAnswer, exams } = useStore();
  const [phase, setPhase] = useState<Phase>('config');
  const [count, setCount] = useState(20);
  const [limitMin, setLimitMin] = useState(SUBJECT_MAP[subject].defaultExamMin);
  const [paper, setPaper] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [remainSec, setRemainSec] = useState(0);
  const [result, setResult] = useState<{ questionId: string; correct: boolean; type: Question['type'] }[]>([]);
  const [examId, setExamId] = useState<string>('');
  const submittedRef = useRef(false);
  const startRef = useRef(0);
  const subjectExams = useMemo(() => exams.filter((e) => e.subject === subject).sort((a, b) => b.at - a.at), [exams, subject]);

  useEffect(() => {
    if (phase !== 'running') return;
    const t = setInterval(() => {
      setRemainSec((r) => {
        if (r <= 1) {
          clearInterval(t);
          submit(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const start = () => {
    const picked = pickQuestions(pool, { count, excludeDone: false, difficultyMode: 'mixed' });
    if (!picked.length) return;
    setPaper(picked);
    setAnswers({});
    setResult([]);
    setCurIdx(0);
    setRemainSec(limitMin * 60);
    startRef.current = Date.now();
    submittedRef.current = false;
    setPhase('running');
  };

  const submit = (auto = false) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const costMs = Math.round((Date.now() - startRef.current) / paper.length);
    const detail = paper.map((q) => {
      const ua = answers[q.id] ?? '';
      // 主观题（填空/解答）无输入按错误计，有输入时按文本归一化比对
      const correct = ua ? isAnswerCorrect(q, ua) : false;
      recordAnswer({ questionId: q.id, correct, costMs, mode: 'exam' });
      return { questionId: q.id, correct, type: q.type };
    });
    const correctCount = detail.filter((d) => d.correct).length;
    const saved = saveExam({
      subject,
      bank: 'real',
      total: paper.length,
      correct: correctCount,
      durationMs: Date.now() - startRef.current,
      limitMin,
      detail,
    });
    setExamId(saved.id);
    setResult(detail);
    setPhase('result');
    if (auto) alert('考试时间到，已自动交卷！');
  };

  /* ---------------- 配置阶段 ---------------- */
  if (phase === 'config') {
    return (
      <div className="card">
        <h3>模拟考试 · {SUBJECT_MAP[subject].name}</h3>
        <div className="grid grid-2 mt12">
          <div className="field">
            <label>题目数量（真题库共 {pool.length} 题）</label>
            <input type="number" min={1} max={Math.max(1, pool.length)} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </div>
          <div className="field">
            <label>时间限制（分钟，到点自动交卷）</label>
            <input type="number" min={5} step={5} value={limitMin} onChange={(e) => setLimitMin(Number(e.target.value))} />
          </div>
        </div>
        <div className="muted mb12">系统将从真题库随机组卷；交卷后自动评分、解析错题，答错题目自动进入错题本。</div>
        <div className="row">
          <Button variant="primary" onClick={start} disabled={!pool.length}>
            开始考试
          </Button>
          <Button onClick={onClose}>返回</Button>
        </div>
        {subjectExams.length > 0 && (
          <div className="mt16">
            <strong>历史模考记录</strong>
            <table className="data mt8">
              <thead><tr><th>时间</th><th>题量</th><th>得分</th><th>用时</th></tr></thead>
              <tbody>
                {subjectExams.slice(0, 10).map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.at).toLocaleString()}</td>
                    <td>{e.total}</td>
                    <td style={{ color: e.score >= 60 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>{e.score}</td>
                    <td>{Math.round(e.durationMs / 60000)} 分钟</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  /* ---------------- 结果阶段 ---------------- */
  if (phase === 'result') {
    const correct = result.filter((r) => r.correct).length;
    const score = scoreExam(correct, result.length);
    const byType = QUESTION_TYPES_LIST.map((t) => {
      const items = result.filter((r) => r.type === t.id);
      return { type: t, total: items.length, correct: items.filter((i) => i.correct).length };
    }).filter((x) => x.total > 0);
    return (
      <div>
        <div className="card">
          <div className="row-between">
            <h3 style={{ margin: 0 }}>模考结果{examId ? '' : ''}</h3>
            <Button size="sm" onClick={onClose}>返回题库</Button>
          </div>
          <div className="grid grid-4 mt12">
            <div><div className="stat-num" style={{ color: score >= 60 ? 'var(--success)' : 'var(--danger)' }}>{score}</div><div className="stat-label">总分（百分制）</div></div>
            <div><div className="stat-num">{result.length}</div><div className="stat-label">总题数</div></div>
            <div><div className="stat-num" style={{ color: 'var(--success)' }}>{correct}</div><div className="stat-label">答对</div></div>
            <div><div className="stat-num" style={{ color: 'var(--danger)' }}>{result.length - correct}</div><div className="stat-label">答错（已入错题本）</div></div>
          </div>
          <table className="data mt12">
            <thead><tr><th>题型</th><th>题数</th><th>答对</th><th>得分率</th></tr></thead>
            <tbody>
              {byType.map((b) => (
                <tr key={b.type.id}>
                  <td>{b.type.name}</td><td>{b.total}</td><td>{b.correct}</td>
                  <td>{b.total ? Math.round((b.correct / b.total) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {paper.map((q, i) => {
          const r = result[i];
          return (
            <div className="q-item" key={q.id}>
              <div className="row-between">
                <strong>{i + 1}. {q.question}</strong>
                {r?.correct ? <Badge tone="green">正确</Badge> : <Badge tone="red">错误</Badge>}
              </div>
              {q.options?.map((o, oi) => (
                <div key={oi} className="muted" style={{ marginLeft: 8 }}>{String.fromCharCode(65 + oi)}. {o}</div>
              ))}
              <div className="mt8">你的答案：{answers[q.id] || '（未作答）'} ｜ 正确答案：{q.answer}</div>
              <div className="muted mt8">解析：{q.analysis || '暂无'}</div>
            </div>
          );
        })}
      </div>
    );
  }

  /* ---------------- 考试中 ---------------- */
  const [idx, setCurIdx] = useState(0);
  const q = paper[idx];
  if (!q) return <Empty title="试卷为空" action={<Button onClick={onClose}>返回</Button>} />;
  return (
    <div>
      <div className="row-between mb12 card" style={{ marginBottom: 12 }}>
        <div className="row">
          <strong>{SUBJECT_MAP[subject].short} 模考</strong>
          <Badge tone={remainSec < 300 ? 'red' : 'blue'}>剩余 {fmtTime(remainSec)}</Badge>
          <span className="muted">第 {idx + 1}/{paper.length} 题</span>
        </div>
        <div className="row">
          <Button variant="danger" onClick={() => { if (confirm('确定交卷吗？')) submit(false); }}>交卷</Button>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 200px' }}>
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 10, whiteSpace: 'pre-wrap' }}>
            {idx + 1}. [{QUESTION_TYPE_MAP[q.type]}] {q.question}
          </div>
          {renderAnswerArea(q, answers[q.id] ?? '', (v) => setAnswers((a) => ({ ...a, [q.id]: v })))}
          <div className="row-between mt12">
            <Button disabled={idx === 0} onClick={() => setCurIdx(idx - 1)}>上一题</Button>
            {idx + 1 < paper.length ? (
              <Button variant="primary" onClick={() => setCurIdx(idx + 1)}>下一题</Button>
            ) : (
              <Button variant="primary" onClick={() => submit(false)}>检查并交卷</Button>
            )}
          </div>
        </div>
        <div className="card">
          <div className="muted mb12">答题卡</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
            {paper.map((p, i) => (
              <button
                key={p.id}
                className="btn sm"
                style={{
                  padding: '4px 0',
                  background: answers[p.id] ? 'var(--primary-weak)' : undefined,
                  borderColor: i === idx ? 'var(--primary)' : undefined,
                }}
                onClick={() => setCurIdx(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div className="muted mt12">已答 {Object.keys(answers).filter((k) => answers[k]).length} / {paper.length}</div>
        </div>
      </div>
    </div>
  );
}

const QUESTION_TYPES_LIST = [
  { id: 'single', name: '单选题' },
  { id: 'multi', name: '多选题' },
  { id: 'judge', name: '判断题' },
  { id: 'fill', name: '填空题' },
  { id: 'essay', name: '解答题' },
] as const;

function fmtTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function renderAnswerArea(q: Question, value: string, set: (v: string) => void) {
  if (q.type === 'single' || q.type === 'multi') {
    return (
      <div>
        {q.options?.map((o, i) => {
          const letter = String.fromCharCode(65 + i);
          const selected = q.type === 'single' ? value === letter : value.includes(letter);
          return (
            <div key={i} className={`opt-line ${selected ? 'selected' : ''}`} onClick={() => {
              if (q.type === 'single') set(letter);
              else set(selected ? value.replace(letter, '').split('').sort().join('') : (value + letter).split('').sort().join(''));
            }}>
              {letter}. {o}
            </div>
          );
        })}
      </div>
    );
  }
  if (q.type === 'judge') {
    return (
      <div className="row">
        <div className={`opt-line ${value === 'T' ? 'selected' : ''}`} style={{ padding: '8px 24px' }} onClick={() => set('T')}>✓ 正确</div>
        <div className={`opt-line ${value === 'F' ? 'selected' : ''}`} style={{ padding: '8px 24px' }} onClick={() => set('F')}>✗ 错误</div>
      </div>
    );
  }
  return <textarea rows={4} value={value} onChange={(e) => set(e.target.value)} placeholder="输入你的答案" />;
}
