/** 冷启动引导向导相关类型定义 */

export interface ChipOption {
  /** 全局唯一标识，用于埋点追踪 */
  id: string;
  /** 显示文字，如 "计算机科学与技术" */
  label: string;
  /** 可选 emoji 图标，如 "🖥" */
  icon?: string;
  /** 点击后注入输入框的自然语言句子（自由输入路径的回退文本） */
  payload: string;
  /**
   * 直写画像时写入 ProfileDimension.label 的值，如 "计算机科学"。
   * 预设 chip 点击路径不走 LLM，后端直接用此值写入画像维度。
   * 不填时回退到 label。
   */
  value?: string;
  /** 所属画像维度 key，预设 chip 直写时作为 dimension_key */
  category?: string;
  /** 额外元数据，供 A/B 测试或埋点使用 */
  metadata?: Record<string, string>;
}

export type OnboardingPhase = 'idle' | 'active' | 'closing';

export interface OnboardingRound {
  /** 轮次序号，从 1 开始 */
  round: number;
  /** AI 本轮发送的问题文本 */
  question: string;
  /** 用户本轮的回答（无论点击还是输入） */
  answer: string;
  /** 本轮抽取到的画像维度 key 列表 */
  extractedDimensions: string[];
  /** 本轮完整对话历史快照，用于刷新恢复 */
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface OnboardingState {
  /** 是否已跳过引导 */
  skipped: boolean;
  /** 引导阶段 */
  phase: OnboardingPhase;
  /** 当前轮次（1-3） */
  round: number;
  /** 各轮次记录 */
  rounds: OnboardingRound[];
  /** 引导完成时间（ISO 字符串），null 表示未完成 */
  completedAt: string | null;
  /** 当前已经抽取到的维度 key 列表 */
  completedDimensions: string[];
  /** 跳转到的课程 slug，无则为 null */
  selectedCourseSlug: string | null;
}

/** 后端在 AI 响应中携带的引导元数据 */
export interface OnboardingMetadata {
  isOnboarding: boolean;
  round: number;
  suggestedChips: ChipOption[];
  done: boolean;
  currentDimensions: OnboardingDimensionBrief[];
  duplicate?: boolean;
}

/** 前端标签云使用的精简维度 */
export interface OnboardingDimensionBrief {
  key: string;
  name: string;
  label: string;
  confidence: number;
}

/** 第 1 轮静态欢迎与问题（无需 API 即可展示） */
export const ONBOARDING_ROUND1_QUESTION =
  '你好！我是你的 AI 学习助手。\n\n为了更好地陪你走过整个大学学习旅程，我需要先简单了解一下你。\n\n你现在主修的专业方向是？';

export const ONBOARDING_ROUND1_CHIPS: ChipOption[] = [
  { id: 'major_cs', label: '计算机科学', icon: '🖥', payload: '我学计算机科学', value: '计算机科学', category: 'major_background' },
  { id: 'major_ds', label: '数据科学', icon: '📊', payload: '我学数据科学', value: '数据科学', category: 'major_background' },
  { id: 'major_auto', label: '自动化', icon: '⚙️', payload: '我学自动化', value: '自动化', category: 'major_background' },
  { id: 'major_ee', label: '电子信息', icon: '📡', payload: '我学电子信息', value: '电子信息', category: 'major_background' },
];

export const ONBOARDING_TOTAL_DIMENSION_TARGET = 6;

/** 引导对话流中的消息（用于内嵌对话流渲染，替代原全屏 Overlay 的 OnboardingMessageStream） */
export interface OnboardingDialogueMessage {
  /** 消息唯一 id */
  id: string;
  /** 角色：用户或 AI 助手 */
  role: 'user' | 'assistant';
  /** 消息文本内容 */
  content: string;
  /** 是否来自预设 chip 点击（true=直写无 LLM，false=自由输入走 LLM） */
  fromPresetChip?: boolean;
  /** 该轮抽取到的画像维度 key 列表（仅 AI 消息可能携带） */
  extractedDimensions?: string[];
  /** 所属引导轮次（1-3） */
  round?: number;
}

/** 引导提交模式：预设 chip 直写 或 自由输入走 LLM */
export type OnboardingSubmitMode = 'preset_chip' | 'free_input';

/** 预设 chip 直写请求体（不走 LLM，后端直接写入画像维度） */
export interface PresetChipSubmitRequest {
  /** 被点击的预设 chip（含 category 作为 dimension_key、value 作为写入 label） */
  chip: ChipOption;
  /** 当前引导轮次（1-3） */
  round: number;
  /** 已完成的引导对话历史，供后端模板表查表定位下一轮问题 */
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/** 预设 chip 直写响应体 */
export interface PresetChipSubmitResponse {
  /** AI 的模板回复话术（用于对话流展示，前端用打字机效果渲染） */
  aiReply: string;
  /** 引导元数据（含下一轮 chips、当前维度、轮次、是否完成） */
  meta: OnboardingMetadata;
}
