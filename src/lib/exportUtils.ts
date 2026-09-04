/**
 * exportUtils.ts —— 文件下载 / 上传读取 / 打印版错题导出
 * JSON、CSV（Excel 可直接打开，带 BOM）、Excel(.xlsx，借助 xlsx)、全库备份
 */
import * as XLSX from 'xlsx';
import { QUESTION_CSV_HEADERS, escapeHtml, parseCSV, questionToRow, toCSV, decodeNote } from './engine';
import { QUESTION_TYPE_MAP, SUBJECT_MAP } from '../constants';
import type { Question, WrongQuestion } from '../types';

export function downloadText(filename: string, content: string, mime = 'application/json;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  triggerDownload(URL.createObjectURL(blob), filename);
}

export function downloadBlob(filename: string, blob: Blob) {
  triggerDownload(URL.createObjectURL(blob), filename);
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'utf-8');
  });
}

/** 导出题目为 JSON */
export function exportQuestionsJSON(questions: Question[], filename: string) {
  downloadText(filename, JSON.stringify(questions, null, 2));
}

/** 导出题目为 CSV（带 UTF-8 BOM，Excel 双击不乱码） */
export function exportQuestionsCSV(questions: Question[], filename: string) {
  const rows = [QUESTION_CSV_HEADERS, ...questions.map(questionToRow)];
  downloadText(filename, '﻿' + toCSV(rows), 'text/csv;charset=utf-8');
}

/** 导出题目为 Excel xlsx */
export function exportQuestionsXLSX(questions: Question[], filename: string) {
  const data = questions.map((q) => ({
    ...q,
    options: q.options ? JSON.stringify(q.options) : '',
    kpIds: q.kpIds.join('|'),
    tags: q.tags.join('|'),
    note: decodeNote(q.note),
  }));
  const ws = XLSX.utils.json_to_sheet(data, { header: QUESTION_CSV_HEADERS as string[] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '题库');
  XLSX.writeFile(wb, filename);
}

/**
 * 解析上传文件为题目原始对象数组：支持 .json / .csv / .xlsx / .xls
 */
export async function parseQuestionFile(file: File): Promise<Record<string, unknown>[]> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'json') {
    const text = await readTextFile(file);
    const json = JSON.parse(text);
    const arr = Array.isArray(json) ? json : json.questions ?? json.data ?? [];
    if (!Array.isArray(arr)) throw new Error('JSON 格式应为数组或 { questions: [...] }');
    return arr;
  }
  if (ext === 'csv' || ext === 'txt') {
    const text = await readTextFile(file);
    return csvToObjects(text);
  }
  if (ext === 'xlsx' || ext === 'xls') {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];
  }
  throw new Error(`不支持的文件格式：${ext}（请使用 JSON / CSV / XLSX）`);
}

/** CSV 文本（首行表头）转对象数组 */
export function csvToObjects(text: string): Record<string, unknown>[] {
  const rows = parseCSV(text.replace(/^﻿/, ''));
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj: Record<string, unknown> = {};
    header.forEach((h, i) => (obj[h] = r[i] ?? ''));
    return obj;
  });
}

/* ---------------- 错题本打印版（按科目排版，适合打印/另存 PDF） ---------------- */
export function printWrongQuestions(wrongs: (WrongQuestion & { question?: Question })[], title = '错题本（打印版）') {
  const bySubject = new Map<string, (WrongQuestion & { question?: Question })[]>();
  wrongs.forEach((w) => {
    const list = bySubject.get(w.subject) ?? [];
    list.push(w);
    bySubject.set(w.subject, list);
  });
  const sections = [...bySubject.entries()]
    .map(([subject, list]) => {
      const items = list
        .map((w, idx) => {
          const q = w.question;
          if (!q) return '';
          const opts = (q.options ?? [])
            .map((o, i) => `<div class="opt">${String.fromCharCode(65 + i)}. ${escapeHtml(o)}</div>`)
            .join('');
          return `
          <div class="qblock">
            <div class="qtitle">${idx + 1}. [${escapeHtml(QUESTION_TYPE_MAP[q.type])}${q.year ? ' · ' + q.year : ''}] ${escapeHtml(q.question)}</div>
            ${opts}
            <div class="ans">【答案】${escapeHtml(q.answer)}</div>
            <div class="ana">【解析】${escapeHtml(q.analysis ?? '—')}</div>
          </div>`;
        })
        .join('');
      return `<section><h2>${escapeHtml(SUBJECT_MAP[subject as keyof typeof SUBJECT_MAP]?.name ?? subject)}（共 ${list.length} 题）</h2>${items}</section>`;
    })
    .join('');
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
  <style>
    body{font-family:"Songti SC","SimSun",serif;max-width:820px;margin:24px auto;padding:0 16px;color:#111;line-height:1.7}
    h1{text-align:center;font-size:22px} .meta{text-align:center;color:#555;margin-bottom:16px}
    h2{font-size:17px;border-left:4px solid #2563eb;padding-left:8px;margin-top:24px;page-break-after:avoid}
    .qblock{margin:12px 0;padding-bottom:10px;border-bottom:1px dashed #bbb;page-break-inside:avoid}
    .qtitle{font-weight:600;margin-bottom:4px}.opt{margin-left:12px;color:#333}
    .ans{color:#b91c1c;margin-top:4px}.ana{color:#374151;margin-top:2px}
    @media print{button{display:none}}
  </style></head><body>
  <h1>${escapeHtml(title)}</h1><div class="meta">导出时间：${new Date().toLocaleString()} · 共 ${wrongs.length} 道错题</div>
  <button onclick="window.print()" style="padding:6px 16px;margin-bottom:12px">打印 / 另存为 PDF</button>
  ${sections}
  <script>window.onload=()=>window.print()</script>
  </body></html>`;
  const win = window.open('', '_blank');
  if (!win) {
    downloadText('错题本打印版.html', html, 'text/html;charset=utf-8');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
