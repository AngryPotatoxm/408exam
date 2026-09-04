/**
 * usePomodoro —— 番茄钟：默认 25 分钟专注 + 5 分钟休息，时长可自定义
 * 完成一个专注番茄后回调 onFocusDone(focusMs)，由 store 累计专注时长。
 */
import { useCallback, useEffect, useRef, useState } from 'react';

type Phase = 'idle' | 'focus' | 'break';

export function usePomodoro(onFocusDone?: (focusMs: number) => void) {
  const [focusMin, setFocusMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);
  const [phase, setPhase] = useState<Phase>('idle');
  const [remainSec, setRemainSec] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const cfgRef = useRef({ focusMin, breakMin, onFocusDone });
  cfgRef.current = { focusMin, breakMin, onFocusDone };

  // 计时主循环：running 时每秒递减，到 0 自动切换阶段
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setRemainSec((r) => {
        if (r > 1) return r - 1;
        // 当前阶段结束 → 切换
        setPhase((p) => {
          if (p === 'focus') {
            cfgRef.current.onFocusDone?.(cfgRef.current.focusMin * 60000);
            setRemainSec(cfgRef.current.breakMin * 60);
            return 'break';
          }
          setRunning(false);
          setRemainSec(cfgRef.current.focusMin * 60);
          return 'idle';
        });
        return 0;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running]);

  const start = useCallback(() => {
    if (phase === 'idle') {
      setPhase('focus');
      setRemainSec(cfgRef.current.focusMin * 60);
    }
    setRunning(true);
  }, [phase]);
  const pause = useCallback(() => setRunning(false), []);
  const reset = useCallback(() => {
    setRunning(false);
    setPhase('idle');
    setRemainSec(focusMin * 60);
  }, [focusMin]);

  const totalSec = (phase === 'break' ? breakMin : focusMin) * 60;
  return {
    focusMin,
    breakMin,
    setFocusMin,
    setBreakMin,
    phase,
    running,
    remainSec,
    progress: totalSec ? 1 - remainSec / totalSec : 0,
    start,
    pause,
    reset,
  };
}
