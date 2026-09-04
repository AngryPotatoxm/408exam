/**
 * WrongBookPage —— 错题本（按科目区分）
 * - 顶部展示各科错题数量并可按科目筛选
 * - 智能复习：按遗忘曲线到期优先排序；随机复习：错题随机顺序
 * - 每道错题可标记错误原因、掌握程度，可删除/归档
 * - 支持打印版导出（按科目排版）与 JSON/CSV 导出
 */
import { useMemo, useState } from 'react';
import { PracticeRunner } from '../components/PracticeRunner';
import { Badge, Button, Card, Empty, Tabs } from '../components/ui';
import { MASTERY_MAP, SUBJECTS, WRONG_REASONS, WRONG_REASON_MAP } from '../constants';
import { isDue, sortByReviewPriority } from '../lib/engine';
import { printWrongQuestions, exportQuestionsJSON, exportQuestionsCSV } from '../lib/exportUtils';
import { useStore } from '../lib/store';
import type { MasteryLevel, Question, SubjectId, WrongQuestion, WrongReason } from '../types';

type SubjectFilter = SubjectId | 'all';

export function WrongBookPage() {
  const { wrongs, questions, updateWrong, removeWrong } = useStore();
  const [subject, setSubject] = useState<SubjectFilter>('all');
  const [reason, setReason] = useState('');
  const [onlyDue, setOnlyDue] = useState(false);
  const [session, setSession] = useState<{ list: Question[]; title: string } | null>(null);

  const active = useMemo(() => wrongs.filter((w) => !w.resolved), [wrongs]);
  const qMap = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const filtered = useMemo(() => {
    let list = active;
    if (subject !== 'all') list = list.filter((w) => w.subject === subject);
    if (reason) list = list.filter((w) => w.reason === reason);
    if (onlyDue) list = list.filter((w) => isDue(w));
    return sortByReviewPriority(list);
  }, [active, subject, reason, onlyDue]);

  const countOf = (s: SubjectFilter) =>
    active.filter((w) => (s === 'all' ? true : w.subject === s)).length;
  const dueCount = active.filter((w) => isDue(w)).length;

  const startReview = (smart: boolean) => {
    const base = filtered.length ? filtered : sortByReviewPriority(active.filter((w) => (subject === 'all' ? true : w.subject === subject)));
    const list = (smart ? base : [...base].sort(() => Math.random() - 0.5))
      .map((w) => qMap.get(w.questionId))
      .filter((q): q is Question => !!q);
    if (!list.length) return;
    setSession({ list, title: smart ? '智能复习（遗忘曲线）' : '错题随机复习' });
  };

  if (session) {
    return <PracticeRunner questions={session.list} mode="review" title={session.title} onClose={() => setSession(null)} />;
  }

  const joined = filtered.map((w) => ({ w, q: qMap.get(w.questionId) })).filter((x) => x.q);
  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">错题本</h1>
        <Tabs
          value={subject}
          onChange={(v) => setSubject(v)}
          options={[{ id: 'all', name: `全部(${countOf('all')})` }, ...SUBJECTS.map((s) => ({ id: s.id, name: `${s.short}(${countOf(s.id)})` }))]}
        />
      </div>
      <Card className="mb12">
        <div className="row-between">
          <div className="row">
            <Badge tone={dueCount ? 'red' : 'green'}>今日到期 {dueCount} 题</Badge>
            <label className="row muted" style={{ gap: 4 }}>
              <input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} /> 只看到期
            </label>
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">全部错误原因</option>
              {WRONG_REASONS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="row">
            <Button variant="primary" onClick={() => startReview(true)} disabled={!active.length}>🧠 智能复习</Button>
            <Button onClick={() => startReview(false)} disabled={!active.length}>🎲 随机复习</Button>
            <Button onClick={() => printWrongQuestions(joined.map(({ w, q }) => ({ ...w, question: q })))} disabled={!joined.length}>🖨️ 打印版</Button>
            <Button size="sm" onClick={() => {
              const qs = joined.map((x) => x.q!);
              exportQuestionsJSON(qs, '错题本导出.json');
            }} disabled={!joined.length}>导出JSON</Button>
            <Button size="sm" onClick={() => {
              const qs = joined.map((x) => x.q!);
              exportQuestionsCSV(qs, '错题本导出.csv');
            }} disabled={!joined.length}>导出CSV</Button>
          </div>
        </div>
      </Card>
      {!active.length ? (
        <Empty title="错题本是空的" hint="练习中答错的题目会自动收录，也可以在题库手动加入错题本" />
      ) : joined.length === 0 ? (
        <Empty title="当前筛选下没有错题" hint="试试切换科目或清除筛选条件" />
      ) : (
        joined.map(({ w, q }) => <WrongRow key={w.id} w={w} q={q!} onChange={updateWrong} onDelete={removeWrong} />)
      )}
    </div>
  );
}

function WrongRow({
  w,
  q,
  onChange,
  onDelete,
}: {
  w: WrongQuestion;
  q: Question;
  onChange: (id: string, patch: Partial<WrongQuestion>) => void;
  onDelete: (id: string) => void;
}) {
  const due = isDue(w);
  const fmt = (ts: number) => new Date(ts).toLocaleDateString();
  return (
    <div className="q-item">
      <div className="row-between">
        <div style={{ flex: 1 }}>
          <div className="row">
            <strong>{q.question}</strong>
            {due && <Badge tone="red">待复习</Badge>}
            <Badge tone="amber">错 {w.wrongCount} 次</Badge>
            <Badge>阶段 {w.stage}/5</Badge>
          </div>
          <div className="muted mt8">
            答案：{q.answer} ｜ 下次复习：{fmt(w.nextReviewAt)} ｜ {w.lastReviewAt ? `上次复习：${fmt(w.lastReviewAt)}` : '尚未复习'}
          </div>
        </div>
        <div className="row">
          <Button size="sm" variant={w.resolved ? undefined : 'success'} onClick={() => onChange(w.id, { resolved: !w.resolved, mastery: 'mastered' })}>
            {w.resolved ? '取消归档' : '已掌握·归档'}
          </Button>
          <Button size="sm" variant="danger" onClick={() => confirm('确定从错题本删除该题？') && onDelete(w.id)}>删除</Button>
        </div>
      </div>
      <div className="row mt8">
        <span className="muted">错误原因：</span>
        <select value={w.reason} onChange={(e) => onChange(w.id, { reason: e.target.value as WrongReason })} style={{ width: 130 }}>
          <option value="">未分类</option>
          {WRONG_REASONS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <span className="muted">掌握程度：</span>
        {(Object.keys(MASTERY_MAP) as MasteryLevel[]).filter((m) => m !== 'unset').map((m) => (
          <button key={m} className={`btn sm ${w.mastery === m ? 'primary' : ''}`} onClick={() => onChange(w.id, { mastery: m })}>
            {MASTERY_MAP[m].name}
          </button>
        ))}
        {w.reason && <Badge tone="blue">{WRONG_REASON_MAP[w.reason]}</Badge>}
      </div>
    </div>
  );
}
