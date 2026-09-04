/**
 * KnowledgePage —— 知识点管理 & 题目双向关联
 * 知识点按科目+章节分组；点击知识点查看关联题目，可按掌握状态筛选、
 * 直接对该知识点发起随机练习；可一键进入该科目闪卡背诵。
 */
import { useEffect, useMemo, useState } from 'react';
import { PracticeRunner } from '../components/PracticeRunner';
import { Badge, Button, Card, Empty, Field, Modal, Tabs } from '../components/ui';
import { DIFFICULTY_MAP, SUBJECTS } from '../constants';
import { shuffle, uid } from '../lib/engine';
import { useStore } from '../lib/store';
import type { KnowledgePoint, Question, SubjectId } from '../types';

export function KnowledgePage({ go }: { go: (p: string, params?: Record<string, string>) => void }) {
  const { kps, questions, upsertKp, deleteKp } = useStore();
  const [subject, setSubject] = useState<SubjectId>('408');
  const [selected, setSelected] = useState<string>('');
  const [editor, setEditor] = useState<KnowledgePoint | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [masteryFilter, setMasteryFilter] = useState('');
  const [practice, setPractice] = useState<Question[] | null>(null);

  const subjectKps = useMemo(() => kps.filter((k) => k.subject === subject), [kps, subject]);
  const grouped = useMemo(() => {
    const m = new Map<string, KnowledgePoint[]>();
    subjectKps.forEach((k) => {
      const arr = m.get(k.chapter || '未分类') ?? [];
      arr.push(k);
      m.set(k.chapter || '未分类', arr);
    });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [subjectKps]);

  const currentKp = subjectKps.find((k) => k.id === selected);
  const related = useMemo(() => {
    if (!currentKp) return [];
    return questions.filter((q) => q.kpIds.includes(currentKp.id));
  }, [questions, currentKp]);
  const shownRelated = masteryFilter === 'done' ? related.filter((q) => q.done) : masteryFilter === 'undone' ? related.filter((q) => !q.done) : related;

  if (practice) {
    return (
      <PracticeRunner
        questions={practice}
        mode="practice"
        title={`知识点专练 · ${currentKp?.name ?? ''}`}
        onClose={() => setPractice(null)}
      />
    );
  }

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">知识点</h1>
        <Tabs value={subject} onChange={setSubject} options={SUBJECTS.map((s) => ({ id: s.id, name: s.short }))} />
      </div>
      <div className="grid" style={{ gridTemplateColumns: '340px 1fr', alignItems: 'start' }}>
        <Card>
          <div className="row-between mb12">
            <strong>章节 / 知识点（{subjectKps.length}）</strong>
            <Button size="sm" variant="primary" onClick={() => { setEditor(null); setEditorOpen(true); }}>+ 新增</Button>
          </div>
          {grouped.length === 0 && <Empty title="暂无知识点" hint="新增知识点后可在题目中关联，也会作为闪卡背诵" />}
          {grouped.map(([chapter, list]) => (
            <div key={chapter} className="mb12">
              <div className="muted" style={{ fontWeight: 600 }}>{chapter}</div>
              {list.map((k) => (
                <div
                  key={k.id}
                  className="row-between"
                  style={{
                    padding: '7px 9px', borderRadius: 8, cursor: 'pointer',
                    background: selected === k.id ? 'var(--primary-weak)' : undefined,
                  }}
                  onClick={() => setSelected(k.id)}
                >
                  <span>{k.name}</span>
                  <span className="muted">{questions.filter((q) => q.kpIds.includes(k.id)).length}题</span>
                </div>
              ))}
            </div>
          ))}
          <Button size="sm" onClick={() => go('flashcard', { subject })}>🗂️ 进入该科目闪卡背诵</Button>
        </Card>
        <Card>
          {!currentKp ? (
            <Empty title="选择左侧知识点查看详情" hint="可查看关联题目、发起专练或编辑闪卡内容" />
          ) : (
            <div>
              <div className="row-between">
                <h3 style={{ margin: 0 }}>{currentKp.name}</h3>
                <div className="row">
                  <Button size="sm" onClick={() => { setEditor(currentKp); setEditorOpen(true); }}>编辑</Button>
                  <Button size="sm" variant="danger" onClick={() => { if (confirm('删除该知识点？关联题目的关联关系会一并解除。')) { deleteKp(currentKp.id); setSelected(''); } }}>删除</Button>
                </div>
              </div>
              <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{currentKp.content || '（暂无详细内容，编辑后会作为闪卡背面展示）'}</p>
              <div className="row-between mt12">
                <div className="row">
                  <strong>关联题目（{related.length}）</strong>
                  <Tabs
                    value={masteryFilter}
                    onChange={setMasteryFilter}
                    options={[{ id: '', name: '全部' }, { id: 'undone', name: '未掌握' }, { id: 'done', name: '已掌握' }]}
                  />
                </div>
                <Button variant="primary" size="sm" disabled={!related.length} onClick={() => setPractice(shuffle(related))}>
                  🎲 练习该知识点
                </Button>
              </div>
              {shownRelated.length === 0 ? (
                <Empty title="该知识点下没有题目" hint="在题库编辑题目时关联本知识点即可" />
              ) : (
                shownRelated.map((q) => (
                  <div className="q-item" key={q.id}>
                    <div className="row">
                      <strong style={{ flex: 1 }}>{q.question}</strong>
                      <Badge>{DIFFICULTY_MAP[q.difficulty].name}</Badge>
                      {q.done ? <Badge tone="green">已掌握</Badge> : <Badge tone="amber">未掌握</Badge>}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </Card>
      </div>
      <KpEditor open={editorOpen} onClose={() => setEditorOpen(false)} subject={subject} editing={editor} onSave={upsertKp} />
    </div>
  );
}

function KpEditor({
  open,
  onClose,
  subject,
  editing,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  subject: SubjectId;
  editing: KnowledgePoint | null;
  onSave: (k: KnowledgePoint) => void;
}) {
  const [chapter, setChapter] = useState('');
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  useEffect(() => {
    if (open) {
      setChapter(editing?.chapter ?? '');
      setName(editing?.name ?? '');
      setContent(editing?.content ?? '');
    }
  }, [open, editing]);
  const save = () => {
    if (!name.trim() || !chapter.trim()) return;
    onSave({
      id: editing?.id ?? uid('kp_'),
      subject,
      chapter: chapter.trim(),
      name: name.trim(),
      content,
      mastery: editing?.mastery ?? 'unset',
      nextReviewAt: editing?.nextReviewAt,
      createdAt: editing?.createdAt ?? Date.now(),
    });
    onClose();
  };
  return (
    <Modal open={open} title={editing ? '编辑知识点' : '新增知识点'} onClose={onClose}
      footer={<>
        <Button onClick={onClose}>取消</Button>
        <Button variant="primary" onClick={save}>保存</Button>
      </>}>
      <Field label="所属章节"><input value={chapter} onChange={(e) => setChapter(e.target.value)} placeholder="如：计算机组成原理-存储系统" /></Field>
      <Field label="知识点名称（闪卡正面）"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="详细内容（闪卡背面，便于背诵）"><textarea rows={6} value={content} onChange={(e) => setContent(e.target.value)} /></Field>
    </Modal>
  );
}
