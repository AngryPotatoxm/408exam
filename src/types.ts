/**
 * 全局领域类型定义
 * 新增 subject 字段：408（已有）/ math2（数二）/ english2（英二）/ politics（政治）
 * 新增 bank 字段：real（真题库）/ practice（练习题题库）
 * 旧数据（无 subject/bank 字段）导入时自动迁移为 408 + real，保证完全向后兼容。
 */
export type SubjectId = '408' | 'math2' | 'english2' | 'politics';
export type BankKind = 'real' | 'practice';
/** 单选 / 多选 / 判断 / 填空 / 解答 */
export type QuestionType = 'single' | 'multi' | 'judge' | 'fill' | 'essay';
/** 1 简单 / 2 中等 / 3 困难 */
export type Difficulty = 1 | 2 | 3;
export type MasteryLevel = 'unset' | 'mastered' | 'familiar' | 'unfamiliar';
/** 错题原因：概念模糊 / 计算失误 / 审题不清 / 时间不够 / 完全不会 */
export type WrongReason = '' | 'concept' | 'calculation' | 'misread' | 'time' | 'unknown';
export type PracticeMode = 'practice' | 'exam' | 'review';

/** 题目对象（沿用并扩展原 408 题库结构） */
export interface Question {
  id: string;
  subject: SubjectId;
  bank: BankKind;
  year?: number;
  type: QuestionType;
  chapter?: string;
  /** 自定义资料分类，如 张宇1000题 / 黄皮书真题 */
  source?: string;
  question: string;
  /** 选项，判断题/填空/解答可为空 */
  options?: string[];
  /** 标准答案：单选 'A'；多选 'AC'；判断 'T'/'F'；填空/解答为文本 */
  answer: string;
  analysis?: string;
  /** 关联知识点 id 列表（题目↔知识点多对多） */
  kpIds: string[];
  /** 快速标签：已掌握 / 需复习 / 易错 / 重点（可自定义扩展） */
  tags: string[];
  difficulty: Difficulty;
  /** 个人笔记/备注（展示前转义，存储时做 Base64 简单加密） */
  note?: string;
  done: boolean;
  correctCount: number;
  wrongCount: number;
  lastPracticedAt?: number;
  createdAt: number;
  updatedAt: number;
}

/** 知识点（同时作为闪卡） */
export interface KnowledgePoint {
  id: string;
  subject: SubjectId;
  chapter: string;
  name: string;
  /** 闪卡背面详细内容 */
  content: string;
  parentId?: string;
  /** 闪卡掌握度 */
  mastery: MasteryLevel;
  /** 闪卡下次复习时间（遗忘曲线） */
  nextReviewAt?: number;
  createdAt: number;
}

/** 错题本记录（按科目区分） */
export interface WrongQuestion {
  id: string;
  questionId: string;
  subject: SubjectId;
  bank: BankKind;
  mastery: MasteryLevel;
  reason: WrongReason;
  wrongCount: number;
  /** 遗忘曲线阶段 0~5，对应间隔 0/1/3/7/15/30 天 */
  stage: number;
  nextReviewAt: number;
  lastReviewAt?: number;
  createdAt: number;
  /** 掌握后可标记移除（不再出现在待复习） */
  resolved: boolean;
}

/** 每次作答流水 */
export interface PracticeRecord {
  id: string;
  questionId: string;
  subject: SubjectId;
  bank: BankKind;
  correct: boolean;
  costMs: number;
  at: number;
  mode: PracticeMode;
  examId?: string;
  type: QuestionType;
  difficulty: Difficulty;
}

/** 模考记录 */
export interface ExamRecord {
  id: string;
  subject: SubjectId;
  bank: BankKind;
  total: number;
  correct: number;
  /** 百分制总分 */
  score: number;
  durationMs: number;
  limitMin: number;
  at: number;
  detail: { questionId: string; correct: boolean; type: QuestionType }[];
}

/** 单日打卡/学习记录，date 为 YYYY-MM-DD（本地），id 与 date 相同（IndexedDB 主键） */
export interface CheckinDay {
  id: string;
  date: string;
  /** 各科当日完成题数 */
  done: Record<SubjectId, number>;
  /** 当日目标快照 */
  goals: Record<SubjectId, number>;
  focusMs: number;
  pomodoros: number;
  checked: boolean;
}

export type PhaseTemplate = 'base' | 'strengthen' | 'sprint' | 'custom';

export interface Settings {
  /** 目标考试日期 YYYY-MM-DD，默认 2028 考研（2027-12-25） */
  examDate: string;
  darkMode: boolean;
  /** 每日提醒时间 HH:mm */
  reminderTime: string;
  reminderText: string;
  reminderEnabled: boolean;
  dailyGoals: Record<SubjectId, number>;
  phaseTemplate: PhaseTemplate;
  onboarded: boolean;
}

export interface AchievementState {
  id: string;
  unlockedAt: number;
}

/** 全库备份结构 */
export interface BackupBundle {
  version: number;
  exportedAt: number;
  app: '408exam';
  questions: Question[];
  knowledgePoints: KnowledgePoint[];
  wrongQuestions: WrongQuestion[];
  records: PracticeRecord[];
  exams: ExamRecord[];
  checkins: CheckinDay[];
  settings: Settings;
  achievements: AchievementState[];
}

export interface BackupMeta {
  id: string;
  at: number;
  size: number;
}

/** 随机抽题配置 */
export interface PickOptions {
  count: number;
  /** 跳过 done=true（随机练习默认 true） */
  excludeDone: boolean;
  /** 'mixed' 完全随机；'ratio' 按难度比例；'fixed' 只抽指定难度 */
  difficultyMode: 'mixed' | 'ratio' | 'fixed';
  /** ratio 模式下 简单/中等/困难 比例，和为 100 */
  ratio?: [number, number, number];
  fixedDifficulty?: Difficulty;
}
