/**
 * store.tsx —— 全局数据 store（React Context）
 * 启动时从 IndexedDB 全量加载；所有变更动作写状态的同时写透 IndexedDB。
 * 承载：题目 CRUD/批量导入、作答流水、错题本（遗忘曲线）、模考、打卡、番茄钟统计、
 *       设置、成就、备份恢复。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { autoBackup, idb, importBundle, listBackups, type StoreName } from './db';
import {
  calcStreak,
  dayKey,
  encodeNote,
  evaluateAchievements,
  initialReview,
  isGoalMet,
  normalizeQuestion,
  scheduleNextReview,
  scoreExam,
  startOfDay,
  uid,
} from './engine';
import { ACHIEVEMENTS, DEFAULT_SETTINGS } from '../constants';
import type {
  AchievementState,
  BackupBundle,
  BackupMeta,
  BankKind,
  CheckinDay,
  Difficulty,
  ExamRecord,
  KnowledgePoint,
  MasteryLevel,
  PracticeMode,
  PracticeRecord,
  Question,
  Settings,
  SubjectId,
  WrongQuestion,
  WrongReason,
} from '../types';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface StoreShape {
  ready: boolean;
  questions: Question[];
  kps: KnowledgePoint[];
  wrongs: WrongQuestion[];
  records: PracticeRecord[];
  exams: ExamRecord[];
  checkins: CheckinDay[];
  settings: Settings;
  achievements: AchievementState[];
  backups: BackupMeta[];
  toasts: Toast[];
  toast: (text: string, type?: Toast['type']) => void;
  dismissToast: (id: string) => void;
  // 题目
  upsertQuestion: (q: Question) => Promise<void>;
  bulkImportQuestions: (rows: Record<string, unknown>[], subject: SubjectId, bank: BankKind) => { added: number; updated: number };
  deleteQuestion: (id: string) => Promise<void>;
  toggleTag: (id: string, tag: string) => void;
  setDifficulty: (id: string, d: Difficulty) => void;
  setNote: (id: string, note: string) => void;
  linkKps: (id: string, kpIds: string[]) => void;
  resetProgress: (subject: SubjectId, bank: BankKind) => void;
  // 知识点
  upsertKp: (kp: KnowledgePoint) => void;
  deleteKp: (id: string) => void;
  setKpMastery: (id: string, mastery: MasteryLevel) => void;
  // 作答 / 错题
  recordAnswer: (args: { questionId: string; correct: boolean; costMs: number; mode: PracticeMode; examId?: string }) => void;
  manualAddWrong: (questionId: string) => void;
  updateWrong: (id: string, patch: Partial<WrongQuestion>) => void;
  reviewWrong: (id: string, correct: boolean) => void;
  removeWrong: (id: string) => void;
  // 模考
  saveExam: (e: Omit<ExamRecord, 'id' | 'score' | 'at'> & { id?: string; at?: number }) => ExamRecord;
  // 打卡 / 番茄钟
  addPomodoro: (focusMs: number) => void;
  // 设置 / 备份
  saveSettings: (patch: Partial<Settings>) => void;
  finishOnboarding: () => void;
  refreshBackups: () => Promise<void>;
  restoreBundle: (b: BackupBundle) => Promise<void>;
  clearAllData: () => Promise<void>;
  streak: number;
}

const Ctx = createContext<StoreShape | null>(null);
/** 遗忘曲线最终阶段 index（对应 30 天） */
const EB_LAST = 5;

function emptyDay(date: string, goals: Settings['dailyGoals']): CheckinDay {
  return {
    id: date,
    date,
    done: { '408': 0, math2: 0, english2: 0, politics: 0 },
    goals: { ...goals },
    focusMs: 0,
    pomodoros: 0,
    checked: false,
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [kps, setKps] = useState<KnowledgePoint[]>([]);
  const [wrongs, setWrongs] = useState<WrongQuestion[]>([]);
  const [records, setRecords] = useState<PracticeRecord[]>([]);
  const [exams, setExams] = useState<ExamRecord[]>([]);
  const [checkins, setCheckins] = useState<CheckinDay[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [achievements, setAchievements] = useState<AchievementState[]>([]);
  const [backups, setBackups] = useState<BackupMeta[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const stateRef = useRef({ questions, wrongs, records, exams, checkins, settings, achievements });
  stateRef.current = { questions, wrongs, records, exams, checkins, settings, achievements };

  const toast = useCallback((text: string, type: Toast['type'] = 'info') => {
    const id = uid('t_');
    setToasts((ts) => [...ts, { id, text, type }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 3200);
  }, []);
  const dismissToast = useCallback((id: string) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  /* 初始化加载 + 启动自动备份 */
  useEffect(() => {
    (async () => {
      const [q, k, w, r, e, c, sRows, a] = await Promise.all([
        idb.getAll<Question>('questions'),
        idb.getAll<KnowledgePoint>('knowledgePoints'),
        idb.getAll<WrongQuestion>('wrongQuestions'),
        idb.getAll<PracticeRecord>('records'),
        idb.getAll<ExamRecord>('exams'),
        idb.getAll<CheckinDay>('checkins'),
        idb.getAll<Settings & { id: string }>('settings'),
        idb.getAll<AchievementState>('achievements'),
      ]);
      setQuestions(q);
      setKps(k);
      setWrongs(w);
      setRecords(r);
      setExams(e);
      setCheckins(c);
      setAchievements(a);
      setSettings({ ...DEFAULT_SETTINGS, ...(sRows[0] ?? {}) });
      await autoBackup();
      setBackups(await listBackups());
      setReady(true);
    })();
  }, []);

  /* 深色模式联动 */
  useEffect(() => {
    document.documentElement.dataset.theme = settings.darkMode ? 'dark' : 'light';
  }, [settings.darkMode]);

  /** 统一成就检测与解锁提示 */
  const grantAchievements = useCallback(
    (next: {
      records: PracticeRecord[];
      checkins: CheckinDay[];
      exams: ExamRecord[];
      wrongs: WrongQuestion[];
      pomodoros: number;
    }) => {
      const newly = evaluateAchievements({
        ...next,
        unlocked: stateRef.current.achievements.map((a) => a.id),
      });
      if (newly.length) {
        const rows = newly.map((id) => ({ id, unlockedAt: Date.now() }));
        setAchievements((prev) => {
          const merged = [...prev, ...rows];
          idb.bulkPut('achievements', merged);
          return merged;
        });
        newly.forEach((id) => {
          const def = ACHIEVEMENTS.find((x) => x.id === id);
          if (def) toast(`解锁成就「${def.icon} ${def.name}」`, 'success');
        });
      }
    },
    [toast],
  );

  /** 取/建今日打卡记录 */
  const touchToday = useCallback((list: CheckinDay[], goals: Settings['dailyGoals']): [CheckinDay[], CheckinDay] => {
    const key = dayKey();
    let today = list.find((c) => c.date === key);
    let next = list;
    if (!today) {
      today = emptyDay(key, goals);
      next = [...list, today];
    }
    return [next, today];
  }, []);

  /* ---------------- 题目 ---------------- */
  const upsertQuestion = useCallback(
    async (q: Question) => {
      setQuestions((prev) => {
        const idx = prev.findIndex((x) => x.id === q.id);
        const next = idx >= 0 ? prev.map((x) => (x.id === q.id ? q : x)) : [...prev, q];
        idb.put('questions', q);
        return next;
      });
    },
    [],
  );

  const bulkImportQuestions = useCallback(
    (rows: Record<string, unknown>[], subject: SubjectId, bank: BankKind) => {
      let added = 0;
      let updated = 0;
      const normalized: Question[] = [];
      rows.forEach((row) => {
        const q = normalizeQuestion({ ...row, subject: (row.subject as SubjectId) ?? subject, bank });
        if (!q) return;
        normalized.push(q);
      });
      setQuestions((prev) => {
        const map = new Map(prev.map((q) => [q.id, q]));
        normalized.forEach((q) => {
          if (map.has(q.id)) updated++;
          else added++;
          map.set(q.id, q);
        });
        const next = [...map.values()];
        idb.bulkPut('questions', normalized);
        return next;
      });
      return { added, updated };
    },
    [],
  );

  const deleteQuestion = useCallback(async (delId: string) => {
    setQuestions((prev) => {
      idb.delete('questions', delId);
      return prev.filter((q) => q.id !== delId);
    });
    setWrongs((prev) => {
      const removed = prev.filter((w) => w.questionId === delId);
      removed.forEach((w) => idb.delete('wrongQuestions', w.id));
      return prev.filter((w) => w.questionId !== delId);
    });
  }, []);

  const patchQuestion = useCallback((id: string, patch: Partial<Question>) => {
    setQuestions((prev) => {
      const next = prev.map((q) => (q.id === id ? { ...q, ...patch, updatedAt: Date.now() } : q));
      const target = next.find((q) => q.id === id);
      if (target) idb.put('questions', target);
      return next;
    });
  }, []);

  const toggleTag = useCallback(
    (id: string, tag: string) => {
      const q = stateRef.current.questions.find((x) => x.id === id);
      if (!q) return;
      const tags = q.tags.includes(tag) ? q.tags.filter((t) => t !== tag) : [...q.tags, tag];
      patchQuestion(id, { tags });
    },
    [patchQuestion],
  );

  const setDifficulty = useCallback((id: string, d: Difficulty) => patchQuestion(id, { difficulty: d }), [patchQuestion]);

  const setNote = useCallback(
    (id: string, note: string) => patchQuestion(id, { note: note ? encodeNote(note) : '' }),
    [patchQuestion],
  );

  const linkKps = useCallback((id: string, kpIds: string[]) => patchQuestion(id, { kpIds }), [patchQuestion]);

  const resetProgress = useCallback(
    (subject: SubjectId, bank: BankKind) => {
      setQuestions((prev) => {
        const changed: Question[] = [];
        const next = prev.map((q) => {
          if (q.subject === subject && q.bank === bank && q.done) {
            const u = { ...q, done: false, lastPracticedAt: undefined };
            changed.push(u);
            return u;
          }
          return q;
        });
        idb.bulkPut('questions', changed);
        return next;
      });
      toast('该题库做题进度已重置', 'success');
    },
    [toast],
  );

  /* ---------------- 知识点 ---------------- */
  const upsertKp = useCallback((kp: KnowledgePoint) => {
    setKps((prev) => {
      const idx = prev.findIndex((x) => x.id === kp.id);
      const next = idx >= 0 ? prev.map((x) => (x.id === kp.id ? kp : x)) : [...prev, kp];
      idb.put('knowledgePoints', kp);
      return next;
    });
  }, []);

  const deleteKp = useCallback((delId: string) => {
    setKps((prev) => {
      idb.delete('knowledgePoints', delId);
      return prev.filter((k) => k.id !== delId);
    });
    setQuestions((prev) => {
      const changed = prev
        .filter((q) => q.kpIds.includes(delId))
        .map((q) => ({ ...q, kpIds: q.kpIds.filter((x) => x !== delId) }));
      idb.bulkPut('questions', changed);
      return prev.map((q) => (q.kpIds.includes(delId) ? { ...q, kpIds: q.kpIds.filter((x) => x !== delId) } : q));
    });
  }, []);

  const setKpMastery = useCallback(
    (id: string, mastery: MasteryLevel) => {
      setKps((prev) => {
        // 闪卡也走遗忘曲线：标记需复习/未掌握 → 明天再看；已掌握 → 3 天后
        const days = mastery === 'mastered' ? 3 : mastery === 'familiar' ? 1 : 0;
        const next = prev.map((k) =>
          k.id === id ? { ...k, mastery, nextReviewAt: startOfDay() + days * 86400000 } : k,
        );
        const target = next.find((k) => k.id === id);
        if (target) idb.put('knowledgePoints', target);
        return next;
      });
    },
    [],
  );

  /* ---------------- 作答 + 错题本联动 ---------------- */
  const recordAnswer: StoreShape['recordAnswer'] = useCallback(
    ({ questionId, correct, costMs, mode, examId }) => {
      const now = Date.now();
      const target = stateRef.current.questions.find((q) => q.id === questionId);
      if (!target) return;
      // 1) 题目计数与 done
      const updatedQ: Question = {
        ...target,
        done: true,
        correctCount: target.correctCount + (correct ? 1 : 0),
        wrongCount: target.wrongCount + (correct ? 0 : 1),
        lastPracticedAt: now,
        updatedAt: now,
      };
      const rec: PracticeRecord = {
        id: uid('r_'),
        questionId,
        subject: target.subject,
        bank: target.bank,
        correct,
        costMs,
        at: now,
        mode,
        examId,
        type: target.type,
        difficulty: target.difficulty,
      };
      // 2) 错题本调度
      let wrongChanged: WrongQuestion | null = null;
      setWrongs((prev) => {
        const exist = prev.find((w) => w.questionId === questionId && !w.resolved) ?? prev.find((w) => w.questionId === questionId);
        let nextList: WrongQuestion[];
        if (!correct) {
          if (exist) {
            wrongChanged = {
              ...exist,
              resolved: false,
              wrongCount: exist.wrongCount + 1,
              stage: 0,
              nextReviewAt: initialReview(now).nextAt,
              lastReviewAt: now,
            };
            nextList = prev.map((w) => (w.id === exist.id ? wrongChanged! : w));
          } else {
            const init = initialReview(now);
            wrongChanged = {
              id: uid('w_'),
              questionId,
              subject: target.subject,
              bank: target.bank,
              mastery: 'unset',
              reason: '',
              wrongCount: 1,
              stage: init.stage,
              nextReviewAt: init.nextAt,
              createdAt: now,
              resolved: false,
            };
            nextList = [...prev, wrongChanged];
          }
        } else if (exist) {
          // 答对：推进遗忘曲线阶段
          const sched = scheduleNextReview(exist.stage, now);
          wrongChanged = { ...exist, stage: sched.stage, nextReviewAt: sched.nextAt, lastReviewAt: now };
          nextList = prev.map((w) => (w.id === exist.id ? wrongChanged! : w));
        } else {
          nextList = prev;
        }
        if (wrongChanged) idb.put('wrongQuestions', wrongChanged);
        return nextList;
      });
      setQuestions((prev) => {
        idb.put('questions', updatedQ);
        return prev.map((q) => (q.id === questionId ? updatedQ : q));
      });
      setRecords((prev) => {
        const next = [...prev, rec];
        idb.put('records', rec);
        return next;
      });
      // 3) 今日打卡计数（模考模式也计入）
      setCheckins((prev) => {
        const [base, today] = touchToday(prev, stateRef.current.settings.dailyGoals);
        const updatedToday: CheckinDay = {
          ...today,
          done: { ...today.done, [target.subject]: (today.done[target.subject] ?? 0) + 1 },
        };
        if (!updatedToday.checked && isGoalMet(updatedToday)) {
          updatedToday.checked = true;
          toast('今日目标全部完成，自动打卡成功 🎉', 'success');
        }
        const next = base.map((c) => (c.date === updatedToday.date ? updatedToday : c));
        idb.put('checkins', updatedToday);
        return next;
      });
      // 4) 成就（异步等状态落定后用计算值）
      setTimeout(() => {
        const s = stateRef.current;
        const pomodoros = s.checkins.reduce((sum, c) => sum + c.pomodoros, 0);
        grantAchievements({
          records: [...s.records, rec],
          checkins: s.checkins,
          exams: s.exams,
          wrongs: s.wrongs,
          pomodoros,
        });
      }, 0);
    },
    [grantAchievements, toast, touchToday],
  );

  const manualAddWrong = useCallback(
    (questionId: string) => {
      const q = stateRef.current.questions.find((x) => x.id === questionId);
      if (!q) return;
      const exist = stateRef.current.wrongs.find((w) => w.questionId === questionId);
      if (exist && !exist.resolved) {
        toast('该题已在错题本中');
        return;
      }
      const init = initialReview();
      const row: WrongQuestion = exist
        ? { ...exist, resolved: false, stage: 0, nextReviewAt: init.nextAt }
        : {
            id: uid('w_'),
            questionId,
            subject: q.subject,
            bank: q.bank,
            mastery: 'unset',
            reason: '',
            wrongCount: 1,
            stage: init.stage,
            nextReviewAt: init.nextAt,
            createdAt: Date.now(),
            resolved: false,
          };
      setWrongs((prev) => {
        const next = exist ? prev.map((w) => (w.id === row.id ? row : w)) : [...prev, row];
        idb.put('wrongQuestions', row);
        return next;
      });
      toast('已加入错题本', 'success');
    },
    [toast],
  );

  const updateWrong = useCallback((id: string, patch: Partial<WrongQuestion>) => {
    setWrongs((prev) => {
      const next = prev.map((w) => (w.id === id ? { ...w, ...patch } : w));
      const t = next.find((w) => w.id === id);
      if (t) idb.put('wrongQuestions', t);
      return next;
    });
  }, []);

  const reviewWrong = useCallback(
    (id: string, correct: boolean) => {
      setWrongs((prev) => {
        const next = prev.map((w) => {
          if (w.id !== id) return w;
          if (correct) {
            const sched = scheduleNextReview(w.stage);
            // 走完整个遗忘曲线且已标记掌握 → 自动归档
            const resolved = w.mastery === 'mastered' && sched.stage === EB_LAST;
            const u = { ...w, stage: sched.stage, nextReviewAt: sched.nextAt, lastReviewAt: Date.now(), resolved };
            idb.put('wrongQuestions', u);
            return u;
          }
          const init = initialReview();
          const u = { ...w, stage: 0, nextReviewAt: init.nextAt, wrongCount: w.wrongCount + 1, lastReviewAt: Date.now() };
          idb.put('wrongQuestions', u);
          return u;
        });
        return next;
      });
    },
    [],
  );

  const removeWrong = useCallback((id: string) => {
    setWrongs((prev) => {
      idb.delete('wrongQuestions', id);
      return prev.filter((w) => w.id !== id);
    });
  }, []);

  /* ---------------- 模考 ---------------- */
  const saveExam: StoreShape['saveExam'] = useCallback(
    (e) => {
      const row: ExamRecord = {
        ...e,
        id: e.id ?? uid('e_'),
        at: e.at ?? Date.now(),
        score: scoreExam(e.correct, e.total),
      };
      setExams((prev) => {
        const next = [...prev, row];
        idb.put('exams', row);
        return next;
      });
      setTimeout(() => {
        const s = stateRef.current;
        grantAchievements({
          records: s.records,
          checkins: s.checkins,
          exams: [...s.exams, row],
          wrongs: s.wrongs,
          pomodoros: s.checkins.reduce((sum, c) => sum + c.pomodoros, 0),
        });
      }, 0);
      return row;
    },
    [grantAchievements],
  );

  /* ---------------- 番茄钟 ---------------- */
  const addPomodoro = useCallback(
    (focusMs: number) => {
      setCheckins((prev) => {
        const [base, today] = touchToday(prev, stateRef.current.settings.dailyGoals);
        const u: CheckinDay = { ...today, focusMs: today.focusMs + focusMs, pomodoros: today.pomodoros + 1 };
        idb.put('checkins', u);
        const next = base.map((c) => (c.date === u.date ? u : c));
        setTimeout(() => {
          const s = stateRef.current;
          grantAchievements({
            records: s.records,
            checkins: next,
            exams: s.exams,
            wrongs: s.wrongs,
            pomodoros: next.reduce((sum, c) => sum + c.pomodoros, 0),
          });
        }, 0);
        return next;
      });
    },
    [grantAchievements, touchToday],
  );

  /* ---------------- 设置 / 备份 ---------------- */
  const saveSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      idb.put('settings', { ...next, id: 'singleton' } as Settings & { id: string });
      return next;
    });
  }, []);

  const finishOnboarding = useCallback(() => {
    setSettings((prev) => {
      const next = { ...prev, onboarded: true };
      idb.put('settings', { ...next, id: 'singleton' } as Settings & { id: string });
      return next;
    });
  }, []);

  const refreshBackups = useCallback(async () => setBackups(await listBackups()), []);

  const restoreBundle = useCallback(async (b: BackupBundle) => {
    await importBundle(b);
    setQuestions(b.questions ?? []);
    setKps(b.knowledgePoints ?? []);
    setWrongs(b.wrongQuestions ?? []);
    setRecords(b.records ?? []);
    setExams(b.exams ?? []);
    setCheckins(b.checkins ?? []);
    setAchievements(b.achievements ?? []);
    setSettings({ ...DEFAULT_SETTINGS, ...(b.settings ?? {}) });
    setBackups(await listBackups());
  }, []);

  const clearAllData = useCallback(async () => {
    await Promise.all(
      (['questions', 'knowledgePoints', 'wrongQuestions', 'records', 'exams', 'checkins', 'achievements'] as StoreName[]).map(
        (s) => idb.clear(s),
      ),
    );
    setQuestions([]);
    setKps([]);
    setWrongs([]);
    setRecords([]);
    setExams([]);
    setCheckins([]);
    setAchievements([]);
  }, []);

  const streak = useMemo(() => calcStreak(checkins), [checkins]);

  const value: StoreShape = {
    ready, questions, kps, wrongs, records, exams, checkins, settings, achievements, backups, toasts,
    toast, dismissToast,
    upsertQuestion, bulkImportQuestions, deleteQuestion, toggleTag, setDifficulty, setNote, linkKps, resetProgress,
    upsertKp, deleteKp, setKpMastery,
    recordAnswer, manualAddWrong, updateWrong, reviewWrong, removeWrong,
    saveExam, addPomodoro,
    saveSettings, finishOnboarding, refreshBackups, restoreBundle, clearAllData, streak,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreShape {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore 必须在 StoreProvider 内使用');
  return ctx;
}
