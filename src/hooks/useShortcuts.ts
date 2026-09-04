/**
 * 全局快捷键：
 *  Ctrl/⌘ + F 聚焦全局搜索（派发 app:focus-search 事件，由列表页监听）
 *  Ctrl/⌘ + S 手动备份一次（派发 app:backup 事件，由设置页/Layout 监听）
 *  Esc 关闭弹层（浏览器原生已处理大部分）
 */
import { useEffect } from 'react';

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'f') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('app:focus-search'));
      } else if (key === 's') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('app:backup'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
