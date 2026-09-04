/**
 * useReminder —— 每日学习提醒：到设定时间弹出浏览器通知（有权限时）+ 应用内提醒
 * 每 30 秒检查一次，每个自然日同一时间只提醒一次。
 */
import { useEffect, useRef } from 'react';
import { dayKey } from '../lib/engine';

export function useReminder(enabled: boolean, time: string, text: string, onInApp: (text: string) => void) {
  const lastRef = useRef('');
  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (hhmm === time && lastRef.current !== dayKey()) {
        lastRef.current = dayKey();
        onInApp(text);
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('考研学习提醒', { body: text });
        }
      }
    };
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, [enabled, time, text, onInApp]);
}

export async function requestNotifyPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission === 'default') return Notification.requestPermission();
  return Notification.permission;
}
