/**
 * BankPage —— 真题库 / 练习题题库
 * 科目（408/数二/英二/政治）× 题库（真题/练习题）双维度切换；
 * 筛选（年份/题型/章节/标签/难度/资料分类/关键词，Ctrl+F 聚焦搜索）；
 * 手动添加、批量导入、随机练习（数量可配、做过的不重复、完成提醒、重置进度）、
 * 模拟考试（仅真题库）、按科目题库导出 JSON/CSV/Excel。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QuestionEditor } from '../components/QuestionEditor';
import { ImportPanel } from '../components/ImportPanel';
import { PracticeRunner } from '../components/PracticeRunner';
import { ExamRunner } from '../components/ExamRunner';
import { Badge, Button, Card, Empty, Modal, Tabs } from '../components/ui';
import {
  BANK_LABEL,
  DIFFICULTY_MAP,
  QUICK_TAGS,
  QUESTION_TYPES,
  SUBJECTS,
} from '../constants';
import {
  decodeNote,
  debounce,
  pickQuestions,
  remainingCount,
} from '../lib/engine';
import {
  exportQuestionsCSV,
  exportQuestionsJSON,
  exportQuestionsXLSX,
} from '../lib/exportUtils';
import { useStore } from '../lib/store';
import type { BankKind, Difficulty, PickOptions, Question, SubjectId } from '../types';

type View = 'list' | 'practice' | 'exam';
const RENDER_STEP = 80;

export function BankPage() {
  const store = useStore();
  const { questions, kps } = store;
  const [subject, setSubject] = useState<SubjectId>('408');
  const [bank, setBank] = useState<BankKind>('real');
  const [view, setView] = useState<View>('list');
  const [editorOpen, setEditorOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [practiceCfgOpen, setPracticeCfgOpen] = useState(false);
  const [completeDialog, setCompleteDialog] = useState(false);
  const [editing, setEditing] = useState<Question | null>(null);
  const [picked, setPicked] = useState<Question[]>([]);
  const [renderLimit, setRenderLimit] = useState(RENDER_STEP);
  const searchRef = useRef<HTMLInputElement>(null);
  // 筛选条件
  const [keyword, setKeyword] = useState('');
  const [debouncedKw, setDebouncedKw] = useState('');
  const [year, setYear] = useState('');
  const [type, setType] = useState('');
  const [chapter, setChapter] = useState('');
  const [tag, setTag] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [source, setSource] = useState('');
  // 随机练习配置
  const [pickCount, setPickCount] = useState(10);
  const [diffMode, setDiffMode] = useState<PickOptions['difficultyMode']>('mixed');
  const [ratio, setRatio] = useState<[number, number, number]>([30, 50, 20]);
  const [fixedDiff, setFixedDiff] = useState<Difficulty>(2);

  const setKwDebounced = useMemo(() => debounce((v: string) => setDebouncedKw(v), 250), []);
  useEffect(() => {
    const focus = () => searchRef.current?.focus();
    window.addEventListener('app:focus-search', focus);
    return () => window.removeEventListener('app:focus-search', focus);
  }, []);

  const scoped = useMemo(
    () => questions.filter((q) => q.subject === subject && q.bank === bank),
    [questions, subject, bank],
  );
  const years = useMemo(() => [...new Set(scoped.map((q) => q.year).filter(Boolean))].sort((a, b) => Number(b) - Number(a)), [scoped]);
  const chapters = useMemo(() => [...new Set(scoped.map((q) => q.chapter).filter(Boolean))].sort(), [scoped]);
  const sources = useMemo(() => [...new Set(scoped.map((q) => q.source).filter(Boolean))].sort(), [scoped]);

  const filtered = useMemo(() => {
    const kw = debouncedKw.trim().toLowerCase();
    return scoped.filter((q) => {
      if (year && String(q.year) !== year) return false;
      if (type && q.type !== type) return false;
      if (chapter && q.chapter !== chapter) return false;
      if (tag && !q.tags.includes(tag)) return false;
      if (difficulty && q.difficulty !== Number(difficulty)) return false;
      if (source && q.source !== source) return false;
      if (kw && !`${q.question}${q.analysis ?? ''}${(q.options ?? []).join('')}`.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [scoped, debouncedKw, year, type, chapter, tag, difficulty, source]);

  const remain = remainingCount(scoped);

  const startPractice = () => {
    const opts: PickOptions = {
      count: pickCount,
      excludeDone: true,
      difficultyMode: diffMode,
      ratio,
      fixedDifficulty: fixedDiff,
    };
    const list = pickQuestions(scoped, opts);
    if (!list.length) {
      setCompleteDialog(true);
      return;
    }
    setPicked(list);
    setPracticeCfgOpen(false);
    setView('practice');
  };

  const resetFilters = () => {
    setKeyword(''); setDebouncedKw(''); setYear(''); setType(''); setChapter(''); setTag(''); setDifficulty(''); setSource('');
  };

  const exportCurrent = (kind: 'json' | 'csv' | 'xlsx') => {
    const name = `${subject}_${bank === 'real' ? '真题库' : '练习题题库'}_${scoped.length}题`;
    if (kind === 'json') exportQuestionsJSON(scoped, `${name}.json`);
    if (kind === 'csv') exportQuestionsCSV(scoped, `${name}.csv`);
    if (kind === 'xlsx') exportQuestionsXLSX(scoped, `${name}.xlsx`);
    store.toast('已开始导出', 'success');
  };

  if (view === 'practice') {
    return (
      <PracticeRunner
        questions={picked}
        mode="practice"
        title={`${SUBJECTS.find((s) => s.id === subject)?.short} · ${BANK_LABEL[bank]}随机练习`}
        onClose={() => setView('list')}
      />
    );
  }
  if (view === 'exam') {
    return <ExamRunner subject={subject} pool={scoped.filter((q) => q.bank === 'real' && q.type !== 'essay')} onClose={() => setView('list')} />;
  }

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">题库</h1>
        <Tabs
          value={subject}
          onChange={(v) => { setSubject(v); resetFilters(); setRenderLimit(RENDER_STEP); }}
          options={SUBJECTS.map((s) => ({ id: s.id, name: s.short }))}
        />
        <Tabs
          value={bank}
          onChange={(v) => { setBank(v); resetFilters(); setRenderLimit(RENDER_STEP); }}
          options={[{ id: 'real', name: '真题库' }, { id: 'practice', name: '练习题题库' }]}
        />
      </div>

      <Card className="mb12">
        <div className="row-between">
          <div className="muted">
            共 {scoped.length} 题 · 未做 {remain} 题 · 已做 {scoped.length - remain} 题
          </div>
          <div className="row">
            <Button variant="primary" onClick={() => setPracticeCfgOpen(true)}>🎲 随机练习</Button>
            {bank === 'real' && <Button onClick={() => setView('exam')}>📝 模拟考试</Button>}
            <Button onClick={() => { setEditing(null); setEditorOpen(true); }}>+ 手动添加</Button>
            <Button onClick={() => setImportOpen(true)}>📥 批量导入</Button>
          </div>
        </div>
      </Card>

      <Card className="mb12">
        <div className="filter-bar">
          <input
            ref={searchRef}
            placeholder="搜索题干/解析（Ctrl+F）"
            value={keyword}
            style={{ width: 220 }}
            onChange={(e) => { setKeyword(e.target.value); setKwDebounced(e.target.value); }}
          />
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">全部年份</option>
            {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">全部题型</option>
            {QUESTION_TYPES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={chapter} onChange={(e) => setChapter(e.target.value)}>
            <option value="">全部章节</option>
            {chapters.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">全部标签</option>
            {QUICK_TAGS.map((t) => <option key={t.id} value={t}>{t}</option>)}
          </select>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="">全部难度</option>
            <option value="1">简单</option><option value="2">中等</option><option value="3">困难</option>
          </select>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">全部资料分类</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <Button size="sm" onClick={resetFilters}>重置筛选</Button>
          <span style={{ flex: 1 }} />
          <Button size="sm" onClick={() => exportCurrent('json')}>导出JSON</Button>
          <Button size="sm" onClick={() => exportCurrent('csv')}>导出CSV</Button>
          <Button size="sm" onClick={() => exportCurrent('xlsx')}>导出Excel</Button>
          <Button size="sm" variant="danger" onClick={() => {
            if (confirm(`确定重置「${SUBJECTS.find((s) => s.id === subject)?.short} · ${BANK_LABEL[bank]}」的全部做题进度吗？题目本身保留。`)) {
              store.resetProgress(subject, bank);
            }
          }}>重置进度</Button>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Empty
          title={scoped.length === 0 ? '该题库还是空的' : '没有符合筛选条件的题目'}
          hint={scoped.length === 0 ? '点击「批量导入」上传 JSON/CSV/Excel，或「手动添加」第一道题' : '试试调整筛选条件'}
          action={scoped.length === 0 ? <Button variant="primary" onClick={() => setImportOpen(true)}>点击此处上传题目</Button> : undefined}
        />
      ) : (
        <div>
          {filtered.slice(0, renderLimit).map((q) => (
            <QuestionRow key={q.id} q={q} onEdit={() => { setEditing(q); setEditorOpen(true); }} />
          ))}
          {filtered.length > renderLimit && (
            <div className="empty" onClick={() => setRenderLimit((n) => n + RENDER_STEP)} style={{ cursor: 'pointer' }}>
              还有 {filtered.length - renderLimit} 题，点击加载更多（性能保护，每次 {RENDER_STEP} 题）
            </div>
          )}
        </div>
      )}

      <QuestionEditor open={editorOpen} onClose={() => setEditorOpen(false)} subject={subject} bank={bank} editing={editing} />
      <ImportPanel open={importOpen} onClose={() => setImportOpen(false)} subject={subject} bank={bank} />

      {/* 随机练习配置 */}
      <Modal open={practiceCfgOpen} title="随机练习配置" onClose={() => setPracticeCfgOpen(false)}
        footer={<>
          <Button onClick={() => setPracticeCfgOpen(false)}>取消</Button>
          <Button variant="primary" onClick={startPractice}>开始练习</Button>
        </>}>
        <div className="field">
          <label>抽题数量（未做题 {remain} 道，已做过的题不会重复抽取）</label>
          <div className="row">
            {[10, 20, 50].map((n) => (
              <button key={n} className={`btn sm ${pickCount === n ? 'primary' : ''}`} onClick={() => setPickCount(n)}>{n} 题</button>
            ))}
            <input type="number" min={1} style={{ width: 110 }} value={pickCount} onChange={(e) => setPickCount(Number(e.target.value))} />
          </div>
        </div>
        <div className="field">
          <label>难度策略</label>
          <div className="row">
            <button className={`btn sm ${diffMode === 'mixed' ? 'primary' : ''}`} onClick={() => setDiffMode('mixed')}>完全随机</button>
            <button className={`btn sm ${diffMode === 'ratio' ? 'primary' : ''}`} onClick={() => setDiffMode('ratio')}>按难度比例</button>
            <button className={`btn sm ${diffMode === 'fixed' ? 'primary' : ''}`} onClick={() => setDiffMode('fixed')}>只抽指定难度</button>
          </div>
        </div>
        {diffMode === 'ratio' && (
          <div className="grid grid-3">
            {(['简单', '中等', '困难'] as const).map((name, i) => (
              <div className="field" key={name}>
                <label>{name}占比 %</label>
                <input type="number" min={0} max={100} value={ratio[i]} onChange={(e) => {
                  const next = [...ratio] as [number, number, number];
                  next[i] = Number(e.target.value);
                  setRatio(next);
                }} />
              </div>
            ))}
          </div>
        )}
        {diffMode === 'fixed' && (
          <div className="field">
            <label>指定难度</label>
            <select value={fixedDiff} onChange={(e) => setFixedDiff(Number(e.target.value) as Difficulty)}>
              <option value={1}>简单</option><option value={2}>中等</option><option value={3}>困难</option>
            </select>
          </div>
        )}
        <div className="muted">所有题目做完后会提示重置进度或去复习错题。</div>
      </Modal>

      {/* 全部完成提醒 */}
      <Modal open={completeDialog} title="🎉 题库已完成" onClose={() => setCompleteDialog(false)}
        footer={<Button variant="primary" onClick={() => setCompleteDialog(false)}>知道了</Button>}>
        <p>该科目{bank === 'real' ? '真题' : '练习题'}库中所有题目都已完成，是否重置进度或复习错题？</p>
        <div className="row">
          <Button onClick={() => { store.resetProgress(subject, bank); setCompleteDialog(false); }}>重置做题进度</Button>
          <Button variant="primary" onClick={() => { setCompleteDialog(false); window.dispatchEvent(new CustomEvent('app:navigate', { detail: 'wrong' })); }}>去错题本复习</Button>
        </div>
      </Modal>
    </div>
  );
}

/** 单题卡片：标签/难度快速标注、编辑、删除、笔记展示、手动加入错题本 */
function QuestionRow({ q, onEdit }: { q: Question; onEdit: () => void }) {
  const { toggleTag, setDifficulty, deleteQuestion, manualAddWrong, wrongs, kps } = useStore();
  const [open, setOpen] = useState(false);
  const note = decodeNote(q.note);
  const inWrong = wrongs.some((w) => w.questionId === q.id && !w.resolved);
  return (
    <div className="q-item">
      <div className="row-between">
        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setOpen((o) => !o)}>
          <strong>{q.year ? `[${q.year}] ` : ''}{q.question}</strong>
          <div className="row mt8">
            <Badge>{QUESTION_TYPES.find((t) => t.id === q.type)?.name}</Badge>
            {q.chapter && <Badge tone="blue">{q.chapter}</Badge>}
            {q.source && <Badge tone="amber">{q.source}</Badge>}
            <Badge>{DIFFICULTY_MAP[q.difficulty].name}</Badge>
            {q.done && <Badge tone="green">已做</Badge>}
            {q.tags.map((t) => <Badge key={t} tone="blue">{t}</Badge>)}
            {q.wrongCount > 0 && <Badge tone="red">错 {q.wrongCount} 次</Badge>}
          </div>
        </div>
        <div className="row">
          <Button size="sm" onClick={() => setOpen((o) => !o)}>{open ? '收起' : '详情'}</Button>
          <Button size="sm" onClick={onEdit}>编辑</Button>
          {!inWrong && <Button size="sm" onClick={() => manualAddWrong(q.id)}>加入错题本</Button>}
          <Button size="sm" variant="danger" onClick={() => confirm('确定删除该题？') && deleteQuestion(q.id)}>删除</Button>
        </div>
      </div>
      {open && (
        <div className="mt12">
          {q.options?.map((o, i) => <div key={i} className="muted">{String.fromCharCode(65 + i)}. {o}</div>)}
          <div className="mt8">✅ 答案：{q.answer}</div>
          <div className="muted mt8">📝 解析：{q.analysis || '暂无解析'}</div>
          {q.kpIds.length > 0 && <div className="muted mt8">🔗 知识点：{q.kpIds.map((id) => kps.find((k) => k.id === id)?.name).filter(Boolean).join('、')}</div>}
          {note && <div className="mt8" style={{ background: 'var(--surface-2)', padding: 8, borderRadius: 8 }}>📔 我的笔记：{note}</div>}
          <div className="row mt8">
            <span className="muted">快速标注：</span>
            {QUICK_TAGS.map((t) => (
              <button key={t} className={`btn sm ${q.tags.includes(t) ? 'primary' : ''}`} onClick={() => toggleTag(q.id, t)}>{t}</button>
            ))}
            <span className="muted">难度：</span>
            <select value={q.difficulty} onChange={(e) => setDifficulty(q.id, Number(e.target.value) as Difficulty)} style={{ width: 90 }}>
              <option value={1}>简单</option><option value={2}>中等</option><option value={3}>困难</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
