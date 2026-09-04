/**
 * PlanPage —— 每日学习计划与打卡设置
 * 分科每日刷题目标；基础/强化/冲刺阶段模板一键生成建议；
 * 每日学习提醒（浏览器通知 + 应用内提醒）；成就总览。
 */
import { ACHIEVEMENTS, PHASE_TEMPLATES, SUBJECTS } from '../constants';
import { requestNotifyPermission } from '../hooks/useReminder';
import { useStore } from '../lib/store';
import { Badge, Button, Card } from '../components/ui';
import type { PhaseTemplate, SubjectId } from '../types';

export function PlanPage() {
  const { settings, saveSettings, toast, achievements, checkins } = useStore();
  const unlocked = new Set(achievements.map((a) => a.id));

  const setGoal = (s: SubjectId, v: number) =>
    saveSettings({ dailyGoals: { ...settings.dailyGoals, [s]: Math.max(0, v) } });

  const applyTemplate = (t: Exclude<PhaseTemplate, 'custom'>) => {
    const tpl = PHASE_TEMPLATES[t];
    saveSettings({ dailyGoals: { ...tpl.goals }, phaseTemplate: t });
    toast(`已应用「${tpl.name}」模板`, 'success');
  };

  return (
    <div>
      <div className="topbar"><h1 className="page-title">学习计划</h1></div>

      <Card className="mb12">
        <strong>阶段计划模板</strong>
        <div className="grid grid-3 mt12">
          {(Object.keys(PHASE_TEMPLATES) as Exclude<PhaseTemplate, 'custom'>[]).map((k) => {
            const tpl = PHASE_TEMPLATES[k];
            return (
              <Card key={k} style={{ boxShadow: 'none' }}>
                <div className="row-between">
                  <strong>{tpl.name}</strong>
                  {settings.phaseTemplate === k && <Badge tone="green">使用中</Badge>}
                </div>
                <p className="muted">{tpl.advice}</p>
                <div className="muted">
                  建议每日：{SUBJECTS.map((s) => `${s.short} ${tpl.goals[s.id]}题`).join(' · ')}
                </div>
                <div className="muted">模考频率：{tpl.examEveryDays ? `每 ${tpl.examEveryDays} 天一次` : '暂不安排'}</div>
                <Button size="sm" className="mt8" onClick={() => applyTemplate(k)}>应用此模板</Button>
              </Card>
            );
          })}
        </div>
      </Card>

      <Card className="mb12">
        <strong>每日刷题目标（完成后自动打卡）</strong>
        <div className="grid grid-4 mt12">
          {SUBJECTS.map((s) => (
            <div className="field" key={s.id}>
              <label>{s.name}（题/天，0 表示不要求）</label>
              <input type="number" min={0} value={settings.dailyGoals[s.id]} onChange={(e) => setGoal(s.id, Number(e.target.value))} />
            </div>
          ))}
        </div>
        <div className="muted">历史打卡天数：{checkins.filter((c) => c.checked).length} 天</div>
      </Card>

      <Card className="mb12">
        <strong>每日学习提醒</strong>
        <div className="grid grid-2 mt12">
          <div className="field">
            <label>是否启用</label>
            <div className="row">
              <Button size="sm" variant={settings.reminderEnabled ? 'primary' : undefined} onClick={() => saveSettings({ reminderEnabled: !settings.reminderEnabled })}>
                {settings.reminderEnabled ? '已启用（点击关闭）' : '未启用（点击开启）'}
              </Button>
              <Button size="sm" onClick={async () => {
                const p = await requestNotifyPermission();
                toast(p === 'granted' ? '浏览器通知权限已授予' : `当前通知权限：${p}`, p === 'granted' ? 'success' : 'error');
              }}>申请浏览器通知权限</Button>
            </div>
          </div>
          <div className="field">
            <label>每日提醒时间</label>
            <input type="time" value={settings.reminderTime} onChange={(e) => saveSettings({ reminderTime: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label>提醒内容（可自定义）</label>
          <input value={settings.reminderText} onChange={(e) => saveSettings({ reminderText: e.target.value })} />
        </div>
      </Card>

      <Card>
        <strong>成就徽章（{achievements.length}/{ACHIEVEMENTS.length}）</strong>
        <div className="grid grid-4 mt12">
          {ACHIEVEMENTS.map((a) => {
            const got = unlocked.has(a.id);
            return (
              <Card key={a.id} style={{ boxShadow: 'none', opacity: got ? 1 : 0.45, textAlign: 'center' }}>
                <div style={{ fontSize: 30 }}>{a.icon}</div>
                <div style={{ fontWeight: 600 }}>{a.name}</div>
                <div className="muted">{a.desc}</div>
                {got && <Badge tone="green">已达成</Badge>}
              </Card>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
