import type {
  Difficulty,
  PhaseTemplate,
  QuestionType,
  Settings,
  SubjectId,
  WrongReason,
} from './types';

export const SUBJECTS: {
  id: SubjectId;
  name: string;
  short: string;
  color: string;
  defaultExamMin: number;
}[] = [
  { id: '408', name: '408 计算机学科专业基础', short: '408', color: '#2563eb', defaultExamMin: 180 },
  { id: 'math2', name: '数学二', short: '数二', color: '#059669', defaultExamMin: 180 },
  { id: 'english2', name: '英语二', short: '英二', color: '#d97706', defaultExamMin: 180 },
  { id: 'politics', name: '政治', short: '政治', color: '#dc2626', defaultExamMin: 180 },
];

export const SUBJECT_MAP: Record<SubjectId, (typeof SUBJECTS)[number]> = Object.fromEntries(
  SUBJECTS.map((s) => [s.id, s]),
) as Record<SubjectId, (typeof SUBJECTS)[number]>;

export const BANK_LABEL: Record<'real' | 'practice', string> = {
  real: '真题库',
  practice: '练习题题库',
};

export const QUICK_TAGS = ['已掌握', '需复习', '易错', '重点'];

export const QUESTION_TYPES: { id: QuestionType; name: string }[] = [
  { id: 'single', name: '单选题' },
  { id: 'multi', name: '多选题' },
  { id: 'judge', name: '判断题' },
  { id: 'fill', name: '填空题' },
  { id: 'essay', name: '解答题' },
];

export const QUESTION_TYPE_MAP: Record<QuestionType, string> = Object.fromEntries(
  QUESTION_TYPES.map((t) => [t.id, t.name]),
) as Record<QuestionType, string>;

export const DIFFICULTY_MAP: Record<Difficulty, { name: string; color: string }> = {
  1: { name: '简单', color: '#16a34a' },
  2: { name: '中等', color: '#d97706' },
  3: { name: '困难', color: '#dc2626' },
};

export const MASTERY_MAP = {
  unset: { name: '未标记', color: '#6b7280' },
  mastered: { name: '已掌握', color: '#16a34a' },
  familiar: { name: '熟悉', color: '#2563eb' },
  unfamiliar: { name: '待加强', color: '#dc2626' },
} as const;

export const WRONG_REASONS: { id: Exclude<WrongReason, ''>; name: string }[] = [
  { id: 'concept', name: '概念模糊' },
  { id: 'calculation', name: '计算失误' },
  { id: 'misread', name: '审题不清' },
  { id: 'time', name: '时间不够' },
  { id: 'unknown', name: '完全不会' },
];

export const WRONG_REASON_MAP: Record<string, string> = Object.fromEntries(
  WRONG_REASONS.map((r) => [r.id, r.name]),
);

/** 艾宾浩斯遗忘曲线复习间隔（天）：当天、1、3、7、15、30 */
export const EB_INTERVAL_DAYS = [0, 1, 3, 7, 15, 30];

/** 统计范围 */
export const RANGES = [
  { id: 'day', name: '日' },
  { id: 'week', name: '周' },
  { id: 'month', name: '月' },
  { id: 'all', name: '全部' },
] as const;
export type RangeId = (typeof RANGES)[number]['id'];

/** 成就徽章定义（predicate 在 engine.evaluateAchievements 内实现） */
export const ACHIEVEMENTS: { id: string; name: string; desc: string; icon: string }[] = [
  { id: 'first_step', name: '初出茅庐', desc: '完成第一道题', icon: '🌱' },
  { id: 'checkin_3', name: '三日不辍', desc: '连续打卡 3 天', icon: '🔥' },
  { id: 'checkin_7', name: '坚持一周', desc: '连续打卡 7 天', icon: '💪' },
  { id: 'checkin_30', name: '月度达人', desc: '连续打卡 30 天', icon: '🏆' },
  { id: 'total_100', name: '百题斩', desc: '累计刷题 100 道', icon: '📖' },
  { id: 'total_500', name: '五百题精', desc: '累计刷题 500 道', icon: '⚔️' },
  { id: 'total_1000', name: '千题宗师', desc: '累计刷题 1000 道', icon: '👑' },
  { id: 'wrong_clear', name: '错题清零', desc: '清空某科目全部错题', icon: '🧹' },
  { id: 'exam_pass', name: '模考上岸', desc: '模拟考试得分 ≥ 60', icon: '🎯' },
  { id: 'exam_good', name: '模考高手', desc: '模拟考试得分 ≥ 80', icon: '🌟' },
  { id: 'pomodoro_10', name: '专注学徒', desc: '累计完成 10 个番茄钟', icon: '🍅' },
  { id: 'all_subjects', name: '全面发展', desc: '四个科目均有做题记录', icon: '🧭' },
];

/** 阶段学习计划模板：每日目标题数 + 模考频率（天/次，0 表示不建议） */
export const PHASE_TEMPLATES: Record<
  Exclude<PhaseTemplate, 'custom'>,
  { name: string; goals: Record<SubjectId, number>; examEveryDays: number; advice: string }
> = {
  base: {
    name: '基础阶段',
    goals: { '408': 20, math2: 15, english2: 10, politics: 0 },
    examEveryDays: 0,
    advice: '以知识点学习+章节练习为主，政治可暂不安排刷题，重在理解与错题归因。',
  },
  strengthen: {
    name: '强化阶段',
    goals: { '408': 30, math2: 25, english2: 15, politics: 15 },
    examEveryDays: 14,
    advice: '加大刷题量，每两周一次全科模考；错题当天复习并标注错误原因。',
  },
  sprint: {
    name: '冲刺阶段',
    goals: { '408': 40, math2: 30, english2: 20, politics: 25 },
    examEveryDays: 7,
    advice: '以套卷模考为主，每周至少一次限时模考，闪卡与错题每日滚动复习。',
  },
};

export const QUOTES = [
  '越努力，越幸运。今天的每一道题，都是考场上的底气。',
  '不怕慢，就怕站。保持节奏，比一时爆发更重要。',
  '错题是最好的老师，搞懂一道错题胜过刷十道新题。',
  '考研是一场一个人的战斗，但你不是一个人在努力。',
  '把大目标拆成今天的小任务，完成它，然后安心睡觉。',
  '重复是记忆之母，遗忘曲线会帮你把知识焊在脑子里。',
  '现在的焦虑，来源于想得多做得少——打开题库，先做 10 道。',
  '你不需要很厉害才开始，你需要开始才会很厉害。',
];

export const DEFAULT_SETTINGS: Settings = {
  examDate: '2027-12-25',
  darkMode: false,
  reminderTime: '20:00',
  reminderText: '该刷题啦！完成今天的目标再休息吧～',
  reminderEnabled: false,
  dailyGoals: { '408': 20, math2: 15, english2: 10, politics: 10 },
  phaseTemplate: 'custom',
  onboarded: false,
};

export const STORAGE_VERSION = 2;
