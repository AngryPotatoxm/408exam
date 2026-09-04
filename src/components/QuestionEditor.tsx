/** 题目新增/编辑弹窗（真题与练习题共用） */
import { useEffect, useState } from 'react';
import { DIFFICULTY_MAP, QUESTION_TYPES, QUICK_TAGS } from '../constants';
import { decodeNote, encodeNote, uid } from '../lib/engine';
import { useStore } from '../lib/store';
import type { BankKind, Difficulty, Question, QuestionType, SubjectId } from '../types';
import { Button, Field, Modal } from './ui';

const blank = (subject: SubjectId, bank: BankKind): Question => ({
  id: uid('q_'),
  subject,
  bank,
  type: 'single',
  question: '',
  options: ['', '', '', ''],
  answer: '',
  analysis: '',
  kpIds: [],
  tags: [],
  difficulty: 2,
  done: false,
  correctCount: 0,
  wrongCount: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

export function QuestionEditor({
  open,
  onClose,
  subject,
  bank,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  subject: SubjectId;
  bank: BankKind;
  editing?: Question | null;
}) {
  const { upsertQuestion, kps, toast } = useStore();
  const [form, setForm] = useState<Question>(blank(subject, bank));
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    if (open) {
      setForm(editing ? { ...editing } : blank(subject, bank));
      setNoteText(editing ? decodeNote(editing.note) : '');
    }
  }, [open, editing, subject, bank]);

  const set = <K extends keyof Question>(k: K, v: Question[K]) => setForm((f) => ({ ...f, [k]: v }));
  const subjectKps = kps.filter((k) => k.subject === subject);

  const save = () => {
    if (!form.question.trim()) {
      toast('请填写题干', 'error');
      return;
    }
    if (!form.answer.trim()) {
      toast('请填写答案', 'error');
      return;
    }
    const options = form.type === 'single' || form.type === 'multi' ? (form.options ?? []).filter((o) => o.trim()) : undefined;
    const payload: Question = {
      ...form,
      options,
      note: encodeNote(noteText),
      updatedAt: Date.now(),
    };
    upsertQuestion(payload);
    toast(editing ? '题目已更新' : '题目已添加', 'success');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={editing ? '编辑题目' : '手动添加题目'}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={save}>
            保存
          </Button>
        </>
      }
    >
      <div className="grid grid-2">
        <Field label="题型">
          <select value={form.type} onChange={(e) => set('type', e.target.value as QuestionType)}>
            {QUESTION_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="难度">
          <select value={form.difficulty} onChange={(e) => set('difficulty', Number(e.target.value) as Difficulty)}>
            {([1, 2, 3] as Difficulty[]).map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_MAP[d].name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="年份（真题可填，如 2024）">
          <input type="number" value={form.year ?? ''} onChange={(e) => set('year', e.target.value ? Number(e.target.value) : undefined)} />
        </Field>
        <Field label="章节">
          <input value={form.chapter ?? ''} onChange={(e) => set('chapter', e.target.value)} placeholder="如：数据结构-树与二叉树" />
        </Field>
        <Field label="资料分类（自定义，如 张宇1000题）">
          <input value={form.source ?? ''} onChange={(e) => set('source', e.target.value)} />
        </Field>
        <Field label="关联知识点（可多选）">
          <select
            multiple
            value={form.kpIds}
            onChange={(e) =>
              set(
                'kpIds',
                [...e.target.selectedOptions].map((o) => o.value),
              )
            }
          >
            {subjectKps.map((k) => (
              <option key={k.id} value={k.id}>
                {k.chapter} / {k.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="题干">
        <textarea rows={3} value={form.question} onChange={(e) => set('question', e.target.value)} />
      </Field>
      {(form.type === 'single' || form.type === 'multi') && (
        <Field label={`选项（每行一个，共 ${form.options?.length ?? 0} 个；单选答案填 A/B/C/D，多选填如 AC）`}>
          {(form.options ?? []).map((opt, i) => (
            <div className="row" key={i} style={{ marginBottom: 6 }}>
              <strong style={{ width: 22 }}>{String.fromCharCode(65 + i)}.</strong>
              <input
                style={{ flex: 1 }}
                value={opt}
                onChange={(e) => {
                  const next = [...(form.options ?? [])];
                  next[i] = e.target.value;
                  set('options', next);
                }}
              />
            </div>
          ))}
          <div className="row">
            <Button
              size="sm"
              onClick={() => set('options', [...(form.options ?? []), ''])}
              disabled={(form.options ?? []).length >= 8}
            >
              + 增加选项
            </Button>
            <Button size="sm" onClick={() => set('options', (form.options ?? []).slice(0, -1))} disabled={(form.options ?? []).length <= 2}>
              删除末项
            </Button>
          </div>
        </Field>
      )}
      <div className="grid grid-2">
        <Field label="正确答案（判断填 对/错）">
          <input value={form.answer} onChange={(e) => set('answer', e.target.value)} />
        </Field>
        <Field label="快捷标签（点击切换）">
          <div className="row">
            {QUICK_TAGS.map((t) => (
              <button
                type="button"
                key={t}
                className={`btn sm ${form.tags.includes(t) ? 'primary' : ''}`}
                onClick={() => set('tags', form.tags.includes(t) ? form.tags.filter((x) => x !== t) : [...form.tags, t])}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <Field label="解析">
        <textarea rows={3} value={form.analysis ?? ''} onChange={(e) => set('analysis', e.target.value)} />
      </Field>
      <Field label="我的笔记/解题思路（仅自己可见，存储时简单加密）">
        <textarea rows={2} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
      </Field>
    </Modal>
  );
}
