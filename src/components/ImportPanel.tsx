/** 批量导入面板：支持 JSON / CSV / Excel，格式与 408 题库一致，可下载模板 */
import { useRef, useState } from 'react';
import { QUESTION_CSV_HEADERS, toCSV } from '../lib/engine';
import { downloadText, parseQuestionFile } from '../lib/exportUtils';
import { useStore } from '../lib/store';
import type { BankKind, SubjectId } from '../types';
import { Button, Field, Modal } from './ui';

const SAMPLE = [
  {
    id: 'demo-001',
    subject: '408',
    bank: 'real',
    year: 2024,
    type: 'single',
    chapter: '数据结构-线性表',
    source: '历年真题',
    question: '下列关于线性表的叙述中，正确的是（ ）',
    options: '["顺序存储适合随机访问","链式存储密度更高","顺序表插入无需移动元素","链表支持下标访问"]',
    answer: 'A',
    analysis: '顺序表支持 O(1) 随机访问；链表插入删除无需移动元素但不支持下标随机访问。',
    kpIds: '',
    tags: '重点',
    difficulty: 2,
    done: 0,
    correctCount: 0,
    wrongCount: 0,
    note: '',
  },
];

export function ImportPanel({
  open,
  onClose,
  subject,
  bank,
}: {
  open: boolean;
  onClose: () => void;
  subject: SubjectId;
  bank: BankKind;
}) {
  const { bulkImportQuestions, toast } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const downloadTemplate = (kind: 'csv' | 'json') => {
    if (kind === 'csv') {
      const sampleRow = SAMPLE[0] as Record<string, unknown>;
      const rows = [QUESTION_CSV_HEADERS, QUESTION_CSV_HEADERS.map((h) => String(sampleRow[h] ?? ''))];
      downloadText(`题库导入模板_${subject}_${bank}.csv`, '﻿' + toCSV(rows), 'text/csv;charset=utf-8');
    } else {
      downloadText(`题库导入模板_${subject}_${bank}.json`, JSON.stringify([{ ...SAMPLE[0], subject, bank }], null, 2));
    }
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const rows = await parseQuestionFile(file);
      const { added, updated } = bulkImportQuestions(rows, subject, bank);
      toast(`导入完成：新增 ${added} 题，更新 ${updated} 题`, 'success');
      onClose();
    } catch (e) {
      toast('导入失败：' + (e as Error).message, 'error');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`批量导入题目（当前：${subject} / ${bank === 'real' ? '真题库' : '练习题题库'}）`}
      footer={<Button onClick={onClose}>关闭</Button>}>
      <div className="row mb12">
        <Button size="sm" onClick={() => downloadTemplate('csv')}>
          下载 CSV 模板
        </Button>
        <Button size="sm" onClick={() => downloadTemplate('json')}>
          下载 JSON 模板
        </Button>
      </div>
      <Field label="选择文件（.json / .csv / .xlsx / .xls；首行为字段名，字段与模板一致）">
        <input
          ref={fileRef}
          type="file"
          accept=".json,.csv,.txt,.xlsx,.xls"
          onChange={(e) => onFile(e.target.files?.[0])}
          disabled={busy}
        />
      </Field>
      <div className="muted">
        说明：① 未填 subject 时自动归入当前科目；未填 bank 时按当前题库归类；② 旧 408 数据缺少新字段也可直接导入，会自动补默认值；③
        相同 id 的题目会被更新而非重复新增；④ options 字段在 CSV 中写 JSON 数组字符串，或用 | 分隔选项文本。
      </div>
    </Modal>
  );
}
