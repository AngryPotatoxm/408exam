/**
 * SettingsPage —— 设置与数据安全
 * 考试目标日期、深色模式；全库备份导出 / 备份恢复；
 * 启动自动备份（保留最近 3 份，可下载）；清空数据；快捷键说明。
 */
import { useRef, useState } from 'react';
import { Button, Card, Field } from '../components/ui';
import { exportBundle, listBackups } from '../lib/db';
import { downloadText, readTextFile } from '../lib/exportUtils';
import { useStore } from '../lib/store';
import type { BackupBundle } from '../types';

export function SettingsPage({ replayOnboarding }: { replayOnboarding: () => void }) {
  const { settings, saveSettings, restoreBundle, clearAllData, toast, refreshBackups, backups } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const fullBackup = async () => {
    const bundle = await exportBundle();
    downloadText(`考研题库全库备份_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(bundle, null, 2));
    toast('全库备份已导出', 'success');
  };

  const onRestore = async (file?: File) => {
    if (!file) return;
    if (!confirm('恢复备份将覆盖当前全部数据，确定继续吗？')) return;
    setBusy(true);
    try {
      const text = await readTextFile(file);
      const bundle = JSON.parse(text) as BackupBundle;
      if (bundle.app !== '408exam') throw new Error('备份文件标识不正确');
      await restoreBundle(bundle);
      toast('数据已恢复，页面将在 1 秒后刷新', 'success');
      setTimeout(() => location.reload(), 1000);
    } catch (e) {
      toast('恢复失败：' + (e as Error).message, 'error');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const downloadAutoBackup = async (id: string) => {
    const all = await listBackups();
    const bk = all.find((b) => b.id === id);
    if (bk?.payload) {
      downloadText(`自动备份_${new Date(bk.at).toISOString().slice(0, 10)}.json`, bk.payload);
    }
  };

  return (
    <div>
      <div className="topbar"><h1 className="page-title">设置</h1></div>

      <Card className="mb12">
        <strong>偏好设置</strong>
        <div className="grid grid-2 mt12">
          <Field label="考研目标日期（首页倒计时）">
            <input type="date" value={settings.examDate} onChange={(e) => saveSettings({ examDate: e.target.value })} />
          </Field>
          <Field label="深色模式">
            <div className="row">
              <Button size="sm" variant={!settings.darkMode ? 'primary' : undefined} onClick={() => saveSettings({ darkMode: false })}>浅色</Button>
              <Button size="sm" variant={settings.darkMode ? 'primary' : undefined} onClick={() => saveSettings({ darkMode: true })}>深色</Button>
            </div>
          </Field>
        </div>
        <Button size="sm" onClick={replayOnboarding}>重新查看新手引导</Button>
      </Card>

      <Card className="mb12">
        <strong>数据备份与恢复</strong>
        <p className="muted">
          所有数据保存在浏览器 IndexedDB 中；每次启动会自动备份并保留最近 3 份。更换设备/浏览器前请先导出全库备份。
        </p>
        <div className="row mt8">
          <Button variant="primary" onClick={fullBackup}>📦 导出全库备份(JSON)</Button>
          <Button onClick={() => fileRef.current?.click()} disabled={busy}>♻️ 导入备份恢复</Button>
          <Button onClick={refreshBackups}>刷新自动备份列表</Button>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => onRestore(e.target.files?.[0])} />
        </div>
        <table className="data mt12">
          <thead><tr><th>自动备份时间</th><th>大小</th><th>操作</th></tr></thead>
          <tbody>
            {backups.length === 0 && <tr><td colSpan={3} className="muted">暂无自动备份（下次启动自动生成）</td></tr>}
            {backups.map((b) => (
              <tr key={b.id}>
                <td>{new Date(b.at).toLocaleString()}</td>
                <td>{(b.size / 1024).toFixed(1)} KB</td>
                <td><Button size="sm" onClick={() => downloadAutoBackup(b.id)}>下载</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="mb12">
        <strong>快捷键</strong>
        <ul>
          <li><span className="kbd">Ctrl/⌘ + F</span> ：在题库页快速聚焦搜索框</li>
          <li><span className="kbd">Ctrl/⌘ + S</span> ：立即导出一份全库备份</li>
          <li><span className="kbd">Esc</span> ：关闭弹窗</li>
        </ul>
      </Card>

      <Card>
        <strong>危险操作</strong>
        <div className="mt8">
          <Button variant="danger" onClick={async () => {
            if (confirm('确定清空全部题目、错题、记录吗？此操作不可恢复，建议先导出备份。')) {
              await clearAllData();
              toast('已清空全部业务数据', 'success');
            }
          }}>清空全部数据</Button>
        </div>
      </Card>
    </div>
  );
}
