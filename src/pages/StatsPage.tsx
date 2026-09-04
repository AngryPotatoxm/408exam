/**
 * StatsPage —— 学习数据统计与可视化
 * 范围切换 日/周/月/全部；按科目展示题量/完成/正确率/错题；
 * 每日刷题量与正确量趋势、错题新增趋势、题型正确率、错题原因分布；
 * 周/月报文字摘要（可打印/另存 PDF）；模考成绩预测。
 */
import { useMemo, useState } from 'react';
import { barOption, Chart, pieOption } from '../components/charts';
import { Card, Empty, Stat, Tabs } from '../components/ui';
import { QUESTION_TYPE_MAP, RANGES, SUBJECTS, WRONG_REASON_MAP, type RangeId } from '../constants';
import {
  accuracyByType,
  buildSubjectStats,
  dailySeries,
  predictScore,
  rangeStart,
  wrongDailySeries,
} from '../lib/engine';
import { useStore } from '../lib/store';

export function StatsPage() {
  const { questions, records, wrongs, checkins, exams } = useStore();
  const [range, setRange] = useState<RangeId>('week');
  const from = rangeStart(range);
  const days = range === 'day' ? 1 : range === 'week' ? 7 : range === 'month' ? 30 : 90;

  const subjectStats = SUBJECTS.map((s) => buildSubjectStats(s.id, questions, records, wrongs, from));
  const inRange = records.filter((r) => r.at >= from);
  const totalAnswered = inRange.length;
  const totalCorrect = inRange.filter((r) => r.correct).length;
  const acc = totalAnswered ? Math.round((totalCorrect / totalAnswered) * 1000) / 10 : 0;
  const focusMin = Math.round(checkins.reduce((s, c) => s + c.focusMs, 0) / 60000);
  const byType = accuracyByType(records, from);
  const prediction = predictScore(exams);
  const trend = useMemo(() => dailySeries(records, days), [records, days]);
  const wrongTrend = useMemo(() => wrongDailySeries(wrongs, days), [wrongs, days]);
  const reasonData = useMemo(() => {
    const m = new Map<string, number>();
    wrongs.filter((w) => !w.resolved && w.reason).forEach((w) => m.set(w.reason, (m.get(w.reason) ?? 0) + 1));
    return [...m.entries()].map(([name, value]) => ({ name: WRONG_REASON_MAP[name] ?? name, value }));
  }, [wrongs]);

  const printReport = () => window.print();

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">学习统计</h1>
        <div className="row">
          <Tabs value={range} onChange={setRange} options={RANGES.map((r) => ({ id: r.id, name: r.name }))} />
          <button className="btn sm" onClick={printReport}>导出周报/月报(PDF)</button>
        </div>
      </div>

      <div className="grid grid-4 mb12">
        <Stat label={`范围内作答（${totalAnswered}）`} value={totalAnswered} />
        <Stat label="范围内正确率" value={`${acc}%`} tone="var(--success)" />
        <Stat label="未解决错题" value={wrongs.filter((w) => !w.resolved).length} tone="var(--danger)" />
        <Stat label="累计专注时长" value={`${focusMin} 分钟`} />
      </div>

      <div className="grid grid-2 mb12">
        <Card>
          <strong>各科目题量 / 已完成</strong>
          <div className="chart-box mt8">
            <Chart
              height={280}
              option={barOption(
                SUBJECTS.map((s) => s.short),
                [
                  { name: '题目总数', data: subjectStats.map((s) => s.total), type: 'bar' },
                  { name: '已完成', data: subjectStats.map((s) => s.done), type: 'bar' },
                  { name: '未解决错题', data: subjectStats.map((s) => s.wrongActive), type: 'bar' },
                ],
              )}
            />
          </div>
        </Card>
        <Card>
          <strong>各科目正确率（范围内）</strong>
          <div className="chart-box mt8">
            <Chart
              height={280}
              option={{
                tooltip: { trigger: 'axis', valueFormatter: (v) => `${v}%` },
                xAxis: { type: 'category', data: SUBJECTS.map((s) => s.short) },
                yAxis: { type: 'value', max: 100 },
                series: [
                  {
                    type: 'bar',
                    data: subjectStats.map((s) => Math.round(s.accuracy * 1000) / 10),
                    itemStyle: { color: '#2563eb' },
                    label: { show: true, formatter: '{c}%' },
                  },
                ],
              }}
            />
          </div>
        </Card>
      </div>

      <Card className="mb12">
        <strong>每日刷题量 / 正确量趋势（近 {days} 天）</strong>
        <div className="chart-box mt8">
          <Chart
            option={{
              tooltip: { trigger: 'axis' },
              legend: { data: ['做题数', '做对数'], top: 0 },
              xAxis: { type: 'category', data: trend.keys },
              yAxis: { type: 'value', minInterval: 1 },
              series: [
                { name: '做题数', type: 'line', smooth: true, areaStyle: {}, data: trend.totalArr },
                { name: '做对数', type: 'line', smooth: true, data: trend.correctArr },
              ],
            }}
          />
        </div>
      </Card>

      <div className="grid grid-2 mb12">
        <Card>
          <strong>错题新增趋势（近 {days} 天）</strong>
          <div className="chart-box mt8">
            <Chart
              height={260}
              option={{
                tooltip: { trigger: 'axis' },
                xAxis: { type: 'category', data: wrongTrend.keys },
                yAxis: { type: 'value', minInterval: 1 },
                series: [{ type: 'line', smooth: true, areaStyle: {}, data: wrongTrend.arr, itemStyle: { color: '#dc2626' } }],
              }}
            />
          </div>
        </Card>
        <Card>
          <strong>错题原因分布</strong>
          {reasonData.length ? (
            <div className="chart-box mt8"><Chart height={260} option={pieOption(reasonData)} /></div>
          ) : (
            <Empty title="还没有标注错误原因" hint="在错题本为错题选择原因后，这里会展示薄弱环节分布" />
          )}
        </Card>
      </div>

      <Card className="mb12">
        <strong>按题型正确率（范围内）</strong>
        <table className="data mt8">
          <thead><tr><th>题型</th><th>作答数</th><th>正确数</th><th>正确率</th></tr></thead>
          <tbody>
            {Object.entries(byType).map(([t, v]) => (
              <tr key={t}>
                <td>{QUESTION_TYPE_MAP[t as keyof typeof QUESTION_TYPE_MAP] ?? t}</td>
                <td>{v.total}</td><td>{v.correct}</td>
                <td>{v.total ? Math.round((v.correct / v.total) * 1000) / 10 : 0}%</td>
              </tr>
            ))}
            {!Object.keys(byType).length && <tr><td colSpan={4} className="muted">范围内暂无作答记录</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card>
        <div className="row-between">
          <strong>学习报告摘要（{range === 'day' ? '今日' : range === 'week' ? '本周' : range === 'month' ? '本月' : '累计'}）</strong>
          {prediction !== null && <span className="badge blue">模考预测分：{prediction}</span>}
        </div>
        <ul className="mt8">
          {subjectStats.map((s) => (
            <li key={s.subject}>
              {SUBJECTS.find((x) => x.id === s.subject)?.name}：范围内作答 {s.answered} 题，正确 {s.correct} 题，正确率{' '}
              {s.answered ? Math.round(s.accuracy * 1000) / 10 : 0}%；题库共 {s.total} 题，已完成 {s.done}，未解决错题 {s.wrongActive}。
            </li>
          ))}
          <li>累计专注 {focusMin} 分钟，模考 {exams.length} 次{prediction !== null ? `，近期加权预测成绩 ${prediction} 分` : ''}。</li>
        </ul>
        <div className="muted mt8">点击右上角「导出周报/月报(PDF)」可通过浏览器打印为 PDF 或纸质版。</div>
      </Card>
    </div>
  );
}
