/** 首页：考研倒计时、今日目标进度、待复习错题、打卡、成就、每日一句、昨日未完成提醒 */
import { useMemo } from 'react';
import { ACHIEVEMENTS, QUOTES, SUBJECTS } from '../constants';
import { dayKey, isDue, startOfDay } from '../lib/engine';
import { useStore } from '../lib/store';
import { Badge, Card, Progress } from '../components/ui';

export function HomePage({ go }: { go: (page: string, params?: Record<string, string>) => void }) {
  const { settings, checkins, questions, wrongs, records, streak, achievements } = useStore();
  const today = checkins.find((c) => c.date === dayKey());
  const yesterdayKey = dayKey(startOfDay() - 86400000);
  const yesterday = checkins.find((c) => c.date === yesterdayKey);
  const incompleteYesterday = yesterday
    ? (Object.keys(settings.dailyGoals) as (keyof typeof settings.dailyGoals)[]).filter(
        (s) => settings.dailyGoals[s] > 0 && (yesterday.done[s] ?? 0) < settings.dailyGoals[s],
      )
    : [];
  const daysLeft = useMemo(() => {
    const t = new Date(settings.examDate + 'T00:00:00').getTime();
    return Math.ceil((t - startOfDay()) / 86400000);
  }, [settings.examDate]);
  const dueCount = wrongs.filter((w) => isDue(w)).length;
  const quote = QUOTES[new Date().getDate() % QUOTES.length];
  const totalAnswered = records.length;
  const totalCheckins = checkins.filter((c) => c.checked).length;
  const unlocked = new Set(achievements.map((a) => a.id));

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">学习概览</h1>
        <Badge tone="blue">今日 {new Date().toLocaleDateString()}</Badge>
      </div>

      {incompleteYesterday.length > 0 && (
        <Card className="mb12" >
          <span style={{ color: 'var(--warn)' }}>⚠️ 昨天有科目未完成目标：{incompleteYesterday.map((s) => SUBJECTS.find((x) => x.id === s)?.short).join('、')}，今天加油补上！</span>
        </Card>
      )}

      <div className="grid grid-4 mb12">
        <Card className="countdown-ring">
          <div className="stat-label">距离目标考试还有</div>
          <div className="num">{daysLeft >= 0 ? daysLeft : '—'}</div>
          <div className="stat-label">天（{settings.examDate}）</div>
        </Card>
        <Card>
          <div className="stat-label">连续打卡</div>
          <div className="stat-num">{streak} <span style={{ fontSize: 14 }}>天</span></div>
          <div className="stat-label">累计 {totalCheckins} 天</div>
        </Card>
        <Card>
          <div className="stat-label">累计刷题</div>
          <div className="stat-num">{totalAnswered}</div>
          <div className="stat-label">道</div>
        </Card>
        <Card onClick={() => go('wrong')} style={{ cursor: 'pointer' }}>
          <div className="stat-label">今日待复习错题</div>
          <div className="stat-num" style={{ color: dueCount ? 'var(--danger)' : undefined }}>{dueCount}</div>
          <div className="stat-label">道{dueCount ? '，点击去复习' : '，已清空 🎉'}</div>
        </Card>
      </div>

      <Card className="mb12">
        <div className="row-between mb12">
          <strong>今日目标进度</strong>
          <button className="btn sm" onClick={() => go('plan')}>调整目标</button>
        </div>
        <div className="grid grid-4">
          {SUBJECTS.map((s) => {
            const goal = settings.dailyGoals[s.id] ?? 0;
            const done = today?.done[s.id] ?? 0;
            const pct = goal ? done / goal : 0;
            return (
              <div key={s.id}>
                <div className="row-between">
                  <span>{s.short}</span>
                  <span className="muted">{done}/{goal || 0}</span>
                </div>
                <Progress value={pct} color={s.color} />
                {pct >= 1 && goal > 0 && <Badge tone="green">已达标</Badge>}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-2">
        <Card>
          <strong>成就徽章</strong>
          <div className="row mt12" style={{ gap: 12 }}>
            {ACHIEVEMENTS.map((a) => {
              const got = unlocked.has(a.id);
              return (
                <div key={a.id} title={`${a.desc}`} style={{ textAlign: 'center', opacity: got ? 1 : 0.32, width: 66 }}>
                  <div style={{ fontSize: 26 }}>{a.icon}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{a.name}</div>
                </div>
              );
            })}
          </div>
          <div className="muted mt8">已解锁 {achievements.length}/{ACHIEVEMENTS.length}</div>
        </Card>
        <Card>
          <strong>每日一句</strong>
          <p style={{ fontSize: 15, lineHeight: 1.9 }}>“{quote}”</p>
          <div className="muted">快捷入口：</div>
          <div className="row mt8">
            <button className="btn sm" onClick={() => go('bank')}>去刷题</button>
            <button className="btn sm" onClick={() => go('flashcard')}>背闪卡</button>
            <button className="btn sm" onClick={() => go('stats')}>看统计</button>
          </div>
          <div className="muted mt12">题库总览：{SUBJECTS.map((s) => {
            const n = questions.filter((q) => q.subject === s.id).length;
            return `${s.short} ${n} 题`;
          }).join(' · ')}</div>
        </Card>
      </div>
    </div>
  );
}
