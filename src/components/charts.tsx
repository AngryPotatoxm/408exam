/** ECharts 统一封装：跟随深色模式、统一字体与留白 */
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { useStore } from '../lib/store';

export function Chart({ option, height = 300 }: { option: EChartsOption; height?: number }) {
  const { settings } = useStore();
  const dark = settings.darkMode;
  const textColor = dark ? '#c7d0e0' : '#374151';
  const axisLine = dark ? '#2c364b' : '#e4e8f0';
  const base: EChartsOption = {
    textStyle: { color: textColor, fontFamily: 'inherit' },
    tooltip: { trigger: 'axis', backgroundColor: dark ? '#181f2e' : '#fff', borderColor: axisLine, textStyle: { color: textColor } },
    legend: { textStyle: { color: textColor }, top: 0 },
    grid: { left: 40, right: 18, top: 38, bottom: 30, containLabel: true },
    color: ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2'],
  };
  const merged: EChartsOption = {
    ...base,
    ...option,
    xAxis: mergeAxis(option.xAxis, { axisLine: { lineStyle: { color: axisLine } }, axisLabel: { color: textColor }, splitLine: { lineStyle: { color: axisLine } } }),
    yAxis: mergeAxis(option.yAxis, { axisLine: { lineStyle: { color: axisLine } }, axisLabel: { color: textColor }, splitLine: { lineStyle: { color: axisLine } } }),
  };
  return <ReactECharts option={merged} style={{ height, width: '100%' }} notMerge />;
}

function mergeAxis(axis: unknown, patch: object) {
  if (!axis) return undefined;
  if (Array.isArray(axis)) return axis.map((a) => ({ ...a, ...patch }));
  return { ...(axis as object), ...patch };
}

/** 便捷：饼图 */
export function pieOption(data: { name: string; value: number }[], title?: string): EChartsOption {
  return {
    title: title ? { text: title, left: 'center', textStyle: { fontSize: 14 } } : undefined,
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '54%'],
        label: { formatter: '{b}: {c} ({d}%)' },
        data,
      },
    ],
  };
}

export function barOption(categories: string[], series: { name: string; data: number[]; type?: 'bar' | 'line' }[], stack?: boolean): EChartsOption {
  return {
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: categories },
    yAxis: { type: 'value', minInterval: 1 },
    series: series.map((s) => ({ ...s, type: s.type ?? 'bar', stack: stack ? 'total' : undefined, smooth: true })),
  };
}
