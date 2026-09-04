/**
 * App —— 应用骨架：页面导航、布局、番茄钟悬浮窗、新手引导、全局提醒/快捷键/Toast
 */
import { useCallback, useEffect, useState } from 'react';
import { StoreProvider, useStore } from './lib/store';
import { usePomodoro } from './hooks/usePomodoro';
import { useReminder } from './hooks/useReminder';
import { useShortcuts } from './hooks/useShortcuts';
import { exportBundle } from './lib/db';
import { downloadText } from './lib/exportUtils';
import { dayKey } from './lib/engine';
import { Button, Modal } from './components/ui';
import { HomePage } from './pages/HomePage';
import { BankPage } from './pages/BankPage';
import { WrongBookPage } from './pages/WrongBookPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { FlashcardPage } from './pages/FlashcardPage';
import { StatsPage } from './pages/StatsPage';
import { PlanPage } from './pages/PlanPage';
import { SettingsPage } from './pages/SettingsPage';
import type { SubjectId } from './types';

const NAV = [
  { id: 'home', name: '学习概览', icon: '🏠' },
  { id: 'bank', name: '题库刷题', icon: '📚' },
  { id: 'wrong', name: '错题本', icon: '❌' },
  { id: 'knowledge', name: '知识点', icon: '🧩' },
  { id: 'flashcard', name: '闪卡背诵', icon: '🗂️' },
  { id: 'stats', name: '学习统计', icon: '📊' },
  { id: 'plan', name: '计划/成就', icon: '🎯' },
  { id: 'settings', name: '设置', icon: '⚙️' },
];

function Shell() {
  const store = useStore();
  const [page, setPage] = useState('home');
  const [flashSubject, setFlashSubject] = useState<SubjectId | undefined>();
  useShortcuts();

  const go = useCallback((p: string, params?: Record<string, string>) => {
    setPage(p);
    if (p === 'flashcard' && params?.subject) setFlashSubject(params.subject as SubjectId);
  }, []);

  useEffect(() => {
    const nav = (e: Event) => setPage((e as CustomEvent).detail);
    window.addEventListener('app:navigate', nav);
    return () => window.removeEventListener('app:navigate', nav);
  }, []);

  // 每日学习提醒
  useReminder(store.settings.reminderEnabled, store.settings.reminderTime, store.settings.reminderText, (t) =>
    store.toast(t, 'info'),
  );

  // Ctrl+S 立即备份
  useEffect(() => {
    const backup = async () => {
      const b = await exportBundle();
      downloadText(`手动备份_${dayKey()}.json`, JSON.stringify(b, null, 2));
      store.toast('已立即备份并下载', 'success');
    };
    const h = () => backup();
    window.addEventListener('app:backup', h);
    return () => window.removeEventListener('app:backup', h);
  }, [store]);

  const [onboarding, setOnboarding] = useState(false);
  useEffect(() => {
    if (store.ready && !store.settings.onboarded) setOnboarding(true);
  }, [store.ready, store.settings.onboarded]);
  const closeOnboarding = () => {
    store.finishOnboarding();
    setOnboarding(false);
  };

  const pomo = usePomodoro((ms) => {
    store.addPomodoro(ms);
    store.toast('专注番茄完成，已记录专注时长 🍅', 'success');
  });
  const [pomoOpen, setPomoOpen] = useState(false);

  if (!store.ready) {
    return <div style={{ padding: 60, textAlign: 'center', color: '#6b7280' }}>正在加载你的学习数据…</div>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">🎓 考研备考助手</div>
        {NAV.map((n) => (
          <button key={n.id} className={`nav-item ${page === n.id ? 'active' : ''}`} onClick={() => setPage(n.id)}>
            <span>{n.icon}</span>
            <span>{n.name}</span>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div className="muted" style={{ padding: '0 10px', fontSize: 12 }}>
          数据本地存储，注意定期备份
        </div>
      </aside>
      <main className="main">
        {page === 'home' && <HomePage go={go} />}
        {page === 'bank' && <BankPage />}
        {page === 'wrong' && <WrongBookPage />}
        {page === 'knowledge' && <KnowledgePage go={go} />}
        {page === 'flashcard' && <FlashcardPage initialSubject={flashSubject} />}
        {page === 'stats' && <StatsPage />}
        {page === 'plan' && <PlanPage />}
        {page === 'settings' && <SettingsPage replayOnboarding={() => setOnboarding(true)} />}
      </main>

      {/* 番茄钟悬浮窗 */}
      <div className="pomo-fab">
        <div className="row-between" style={{ cursor: 'pointer' }} onClick={() => setPomoOpen((o) => !o)}>
          <strong>🍅 番茄钟</strong>
          <span className="muted">{pomoOpen ? '▾' : '▸'}</span>
        </div>
        <div style={{ textAlign: 'center', fontSize: 22, fontWeight: 700, margin: '6px 0', color: pomo.phase === 'break' ? 'var(--success)' : 'var(--primary)' }}>
          {fmt(pomo.remainSec)}
        </div>
        {pomoOpen && (
          <div>
            <div className="row" style={{ justifyContent: 'center', marginBottom: 6 }}>
              <label className="muted">专注<input type="number" min={5} style={{ width: 56 }} value={pomo.focusMin} onChange={(e) => pomo.setFocusMin(Number(e.target.value))} />分</label>
              <label className="muted">休息<input type="number" min={1} style={{ width: 56 }} value={pomo.breakMin} onChange={(e) => pomo.setBreakMin(Number(e.target.value))} />分</label>
            </div>
            <div className="row" style={{ justifyContent: 'center' }}>
              {pomo.running ? <Button size="sm" onClick={pomo.pause}>暂停</Button> : <Button size="sm" variant="primary" onClick={pomo.start}>开始</Button>}
              <Button size="sm" onClick={pomo.reset}>重置</Button>
            </div>
            <div className="progress mt8"><i style={{ width: `${pomo.progress * 100}%` }} /></div>
            <div className="muted" style={{ textAlign: 'center', fontSize: 12 }}>
              {pomo.phase === 'focus' ? '专注中…' : pomo.phase === 'break' ? '休息中…' : '待开始'}
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      <div className="toast-wrap">
        {store.toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`} onClick={() => store.dismissToast(t.id)}>
            {t.text}
          </div>
        ))}
      </div>

      <Onboarding open={onboarding} onClose={closeOnboarding} />
    </div>
  );
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function Onboarding({ open, onClose }: { open: boolean; onClose: () => void }) {
  const step = [
    { t: '欢迎使用考研备考助手', d: '覆盖 408、数学二、英语二、政治四个科目，每个科目都有真题库和练习题题库。' },
    { t: '导入你的第一批题', d: '在「题库刷题」页可手动添加，或批量导入 JSON/CSV/Excel（模板可在导入弹窗下载）。旧 408 数据可直接导入，自动补全新字段。' },
    { t: '随机练习 & 模拟考试', d: '随机练习自动跳过做过的题，做完会提醒重置；真题库还支持限时模考，自动评分、错题自动入错题本。' },
    { t: '错题本 + 遗忘曲线', d: '错题按 0/1/3/7/15/30 天间隔安排智能复习，可标注错误原因与掌握程度，支持打印版导出。' },
    { t: '统计、打卡与更多', d: '学习统计、每日目标与连续打卡、闪卡背诵、番茄钟、成就徽章、全库备份都在左侧导航。数据保存在本机，记得定期备份。' },
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    if (open) setI(0);
  }, [open]);
  return (
    <Modal
      open={open}
      title={`新手引导 ${i + 1}/${step.length} · ${step[i].t}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>跳过</Button>
          {i < step.length - 1 ? (
            <Button variant="primary" onClick={() => setI((x) => x + 1)}>下一步</Button>
          ) : (
            <Button variant="primary" onClick={onClose}>开始使用</Button>
          )}
        </>
      }
    >
      <p style={{ fontSize: 15, lineHeight: 2 }}>{step[i].d}</p>
    </Modal>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
