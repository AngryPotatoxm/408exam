/**
 * FlashcardPage —— 背诵模式（闪卡）
 * 正面知识点名称、背面详细内容；可按科目/章节筛选、随机或按遗忘曲线优先排序；
 * 标记 已掌握/需复习/未掌握，自动排定下次复习时间。
 */
import { useMemo, useState } from 'react';
import { Badge, Button, Card, Empty, Tabs } from '../components/ui';
import { SUBJECTS } from '../constants';
import { isDue, shuffle } from '../lib/engine';
import { useStore } from '../lib/store';
import type { MasteryLevel, SubjectId } from '../types';

export function FlashcardPage({ initialSubject }: { initialSubject?: SubjectId }) {
  const { kps, setKpMastery } = useStore();
  const [subject, setSubject] = useState<SubjectId>(initialSubject ?? '408');
  const [chapter, setChapter] = useState('');
  const [order, setOrder] = useState<'review' | 'random'>('review');
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [round, setRound] = useState(0); // 重新洗牌标记

  const chapters = useMemo(
    () => [...new Set(kps.filter((k) => k.subject === subject).map((k) => k.chapter))].sort(),
    [kps, subject],
  );

  const deck = useMemo(() => {
    let list = kps.filter((k) => k.subject === subject);
    if (chapter) list = list.filter((k) => k.chapter === chapter);
    list = list.slice();
    if (order === 'random') return shuffle(list);
    // 复习优先：到期/从未复习的在前，其次按 nextReviewAt 升序
    return list.sort((a, b) => {
      const da = isDue({ nextReviewAt: a.nextReviewAt ?? 0, resolved: a.mastery === 'mastered' });
      const db = isDue({ nextReviewAt: b.nextReviewAt ?? 0, resolved: b.mastery === 'mastered' });
      if (da !== db) return Number(db) - Number(da);
      return (a.nextReviewAt ?? 0) - (b.nextReviewAt ?? 0);
    });
    // round 变化时重排
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kps, subject, chapter, order, round]);

  const card = deck[idx];
  const mark = (mastery: MasteryLevel) => {
    if (!card) return;
    setKpMastery(card.id, mastery);
    nextCard();
  };
  const nextCard = () => {
    setFlipped(false);
    setIdx((i) => (i + 1 < deck.length ? i + 1 : 0));
  };

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">闪卡背诵</h1>
        <Tabs value={subject} onChange={(v) => { setSubject(v); setChapter(''); setIdx(0); }} options={SUBJECTS.map((s) => ({ id: s.id, name: s.short }))} />
      </div>
      <Card className="mb12">
        <div className="row">
          <select value={chapter} onChange={(e) => { setChapter(e.target.value); setIdx(0); }}>
            <option value="">全部章节</option>
            {chapters.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <Tabs
            value={order}
            onChange={(v) => { setOrder(v); setIdx(0); setRound((r) => r + 1); }}
            options={[{ id: 'review', name: '复习优先' }, { id: 'random', name: '随机顺序' }]}
          />
          <Button size="sm" onClick={() => { setRound((r) => r + 1); setIdx(0); setFlipped(false); }}>🔀 重新洗牌</Button>
          <span className="muted">共 {deck.length} 张{deck.length ? `，第 ${idx + 1} 张` : ''}</span>
        </div>
      </Card>
      {!card ? (
        <Empty title="该范围下还没有闪卡" hint="先到「知识点」页面创建知识点，名称为卡面、详细内容为卡背" />
      ) : (
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div className={`flashcard ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped((f) => !f)}>
            <div className="flashcard-inner">
              <div className="flash-face">
                <Badge tone="blue">{card.chapter}</Badge>
                <h2 style={{ marginTop: 14 }}>{card.name}</h2>
                <div className="muted mt12">点击卡片翻面查看详细内容</div>
              </div>
              <div className="flash-face flash-back">
                <strong>{card.name}</strong>
                <div style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>{card.content || '（暂无内容）'}</div>
              </div>
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Button variant="danger" onClick={() => mark('unfamiliar')}>未掌握（今天再看）</Button>
            <Button onClick={() => mark('familiar')}>需复习（明天）</Button>
            <Button variant="success" onClick={() => mark('mastered')}>已掌握（3天后）</Button>
            <Button onClick={nextCard}>跳过</Button>
          </div>
        </div>
      )}
    </div>
  );
}
