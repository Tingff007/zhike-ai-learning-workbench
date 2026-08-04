import type { ChipOption } from '../../types/onboarding';

/**
 * 每个画像维度对应的上下文专属快捷卡片。
 *
 * 设计原则（来自"对话式学习画像自主构建"规格）：
 * - 点击卡片走 Text Injection：把自然语言句子注入输入框并发送，
 *   让 LLM 按统一语义管道理解，而非硬编码字段映射。
 * - 每张卡片的 payload 都是完整自然语言句子，后端 ProfileExtractor
 *   可直接抽取并写入对应维度。
 * - 卡片选项覆盖该维度最常见的取值，"其他"兜底允许自由输入。
 */
export const DIMENSION_CALIBRATE_CHIPS: Record<string, ChipOption[]> = {
  // 专业背景：冷启动首轮核心问题，决定后续推荐方向
  major_background: [
    { id: 'major_cs', label: '计算机科学', icon: '🖥', payload: '我学计算机科学', category: 'major_background' },
    { id: 'major_ds', label: '数据科学', icon: '📊', payload: '我学数据科学', category: 'major_background' },
    { id: 'major_auto', label: '自动化', icon: '⚙️', payload: '我学自动化', category: 'major_background' },
    { id: 'major_ee', label: '电子信息', icon: '📡', payload: '我学电子信息', category: 'major_background' },
    { id: 'major_other', label: '其他专业', icon: '➕', payload: '我的专业不在上述选项中', category: 'major_background' },
  ],
  // 资源偏好：影响资源生成与推荐类型
  resource_preference: [
    { id: 'res_lecture', label: '讲义笔记', icon: '📖', payload: '我偏好讲义笔记类资源', category: 'resource_preference' },
    { id: 'res_video', label: '视频讲解', icon: '🎬', payload: '我偏好视频讲解类资源', category: 'resource_preference' },
    { id: 'res_exercise', label: '习题练习', icon: '✏️', payload: '我偏好习题练习类资源', category: 'resource_preference' },
    { id: 'res_project', label: '项目实战', icon: '🛠', payload: '我偏好项目实战类资源', category: 'resource_preference' },
    { id: 'res_other', label: '其他偏好', icon: '➕', payload: '我有其他资源偏好', category: 'resource_preference' },
  ],
  // 认知风格：决定讲解方式（结构化 vs 案例驱动）
  cognitive_style: [
    { id: 'cog_struct', label: '结构化讲解', icon: '🏗', payload: '我偏好结构化、有体系的讲解', category: 'cognitive_style' },
    { id: 'cog_case', label: '案例驱动', icon: '💡', payload: '我偏好从案例切入的学习方式', category: 'cognitive_style' },
    { id: 'cog_explore', label: '探索式', icon: '🔍', payload: '我偏好自主探索式学习', category: 'cognitive_style' },
    { id: 'cog_other', label: '其他风格', icon: '➕', payload: '我有其他认知风格偏好', category: 'cognitive_style' },
  ],
  // 学习目标：影响路径规划与资源难度
  learning_goal: [
    { id: 'goal_postgrad', label: '考研深造', icon: '🎓', payload: '我的目标是考研深造', category: 'learning_goal' },
    { id: 'goal_job', label: '就业求职', icon: '💼', payload: '我的目标是就业求职', category: 'learning_goal' },
    { id: 'goal_contest', label: '竞赛提升', icon: '🏆', payload: '我的目标是参加竞赛提升能力', category: 'learning_goal' },
    { id: 'goal_interest', label: '兴趣拓展', icon: '🌟', payload: '我的目标是兴趣拓展', category: 'learning_goal' },
    { id: 'goal_other', label: '其他目标', icon: '➕', payload: '我有其他学习目标', category: 'learning_goal' },
  ],
  // 学习节奏：决定内容推送密度与阶段划分
  learning_pace: [
    { id: 'pace_stage', label: '阶段推进', icon: '📐', payload: '我习惯按阶段稳步推进', category: 'learning_pace' },
    { id: 'pace_gradual', label: '循序渐进', icon: '🪜', payload: '我习惯循序渐进的学习节奏', category: 'learning_pace' },
    { id: 'pace_sprint', label: '密集冲刺', icon: '⚡', payload: '我习惯密集冲刺式学习', category: 'learning_pace' },
    { id: 'pace_other', label: '其他节奏', icon: '➕', payload: '我有其他学习节奏偏好', category: 'learning_pace' },
  ],
  // 知识基础：决定起点与前置知识补全
  knowledge_base: [
    { id: 'kb_beginner', label: '入门阶段', icon: '🌱', payload: '我在这个领域还处于入门阶段', category: 'knowledge_base' },
    { id: 'kb_progress', label: '进阶中', icon: '🌿', payload: '我已掌握基础，正在进阶', category: 'knowledge_base' },
    { id: 'kb_skilled', label: '较熟练', icon: '🌳', payload: '我已较熟练，能独立应用', category: 'knowledge_base' },
    { id: 'kb_master', label: '精通', icon: '🏆', payload: '我已精通，能教他人', category: 'knowledge_base' },
    { id: 'kb_other', label: '其他', icon: '➕', payload: '我想描述其他掌握程度', category: 'knowledge_base' },
  ],
  // 易错点：课程场景下的痛点挖掘
  weakness: [
    { id: 'weak_debug', label: '代码 Debug', icon: '🐛', payload: '我容易在代码调试上卡壳', category: 'weakness' },
    { id: 'weak_formula', label: '公式推导', icon: '📐', payload: '我容易在公式推导上卡壳', category: 'weakness' },
    { id: 'weak_scene', label: '业务场景', icon: '🗂', payload: '我容易在业务场景应用上卡壳', category: 'weakness' },
    { id: 'weak_other', label: '其他痛点', icon: '➕', payload: '我有其他易错点', category: 'weakness' },
  ],
  // 表达偏好：决定 AI 回复的呈现方式
  expression_preference: [
    { id: 'expr_concise', label: '简洁直给', icon: '✂️', payload: '我偏好简洁直给的表达', category: 'expression_preference' },
    { id: 'expr_detail', label: '详细推演', icon: '📝', payload: '我偏好详细推演的表达', category: 'expression_preference' },
    { id: 'expr_visual', label: '图示优先', icon: '📊', payload: '我偏好图示优先的表达', category: 'expression_preference' },
    { id: 'expr_other', label: '其他', icon: '➕', payload: '我有其他表达偏好', category: 'expression_preference' },
  ],
  // 学习习惯：影响学习时段推荐与提醒策略
  learning_habit: [
    { id: 'habit_morning', label: '早起型', icon: '🌅', payload: '我是早起型学习者', category: 'learning_habit' },
    { id: 'habit_night', label: '夜猫型', icon: '🌙', payload: '我是夜猫型学习者', category: 'learning_habit' },
    { id: 'habit_fragment', label: '碎片化', icon: '🧩', payload: '我习惯碎片化学习', category: 'learning_habit' },
    { id: 'habit_immersive', label: '沉浸式', icon: '🎧', payload: '我习惯沉浸式长时间学习', category: 'learning_habit' },
    { id: 'habit_other', label: '其他', icon: '➕', payload: '我有其他学习习惯', category: 'learning_habit' },
  ],
  // 通用能力短板：跨课程共性弱项
  general_weakness: [
    { id: 'gw_logic', label: '逻辑推理', icon: '🔗', payload: '我在逻辑推理上偏弱', category: 'general_weakness' },
    { id: 'gw_memory', label: '记忆遗忘', icon: '🌀', payload: '我容易遗忘已学内容', category: 'general_weakness' },
    { id: 'gw_focus', label: '注意力', icon: '🎯', payload: '我注意力容易分散', category: 'general_weakness' },
    { id: 'gw_other', label: '其他', icon: '➕', payload: '我有其他通用短板', category: 'general_weakness' },
  ],
};

/** 维度 key → 中文名映射，用于校准弹窗标题与标签云显示 */
export const DIMENSION_LABELS: Record<string, string> = {
  major_background: '专业背景',
  knowledge_base: '知识基础',
  cognitive_style: '认知风格',
  learning_goal: '学习目标',
  learning_pace: '学习节奏',
  weakness: '易错点',
  general_weakness: '通用能力短板',
  resource_preference: '资源偏好',
  expression_preference: '表达偏好',
  learning_habit: '学习习惯',
};

/**
 * 中文标签 → 维度 key 的反向映射。
 * 用于从 ProfileOverviewPanel 的 meta 字段（中文标签如"专业背景"）
 * 定位到后端维度 key（如 major_background）。
 */
export const META_LABEL_TO_DIMENSION_KEY: Record<string, string> = {
  专业背景: 'major_background',
  长期学习目标: 'learning_goal',
  资源偏好: 'resource_preference',
  当前课程: 'knowledge_base',
  当前节点: 'learning_pace',
  当前掌握度: 'knowledge_base',
  课程易错点: 'weakness',
  当前主题: 'learning_goal',
  当前任务意图: 'learning_goal',
  当前临时目标: 'learning_goal',
  共性短板: 'general_weakness',
  前置知识影响: 'knowledge_base',
  跨课程迁移提示: 'knowledge_base',
};

/** 根据维度 key 获取专属 chips；未配置时返回空数组（由调用方兜底） */
export function getDimensionChips(dimensionKey: string | null | undefined): ChipOption[] {
  if (!dimensionKey) return [];
  return DIMENSION_CALIBRATE_CHIPS[dimensionKey] ?? [];
}

/** 根据维度 key 获取中文名；未知时回退为"画像维度" */
export function getDimensionLabel(dimensionKey: string | null | undefined): string {
  if (!dimensionKey) return '画像维度';
  return DIMENSION_LABELS[dimensionKey] ?? '画像维度';
}

/**
 * 根据维度 key 生成 AI 首轮提问文本。
 * 每个维度的提问贴合其语义，引导用户给出可被 LLM 抽取的回答。
 */
export function getDimensionQuestion(dimensionKey: string | null | undefined): string {
  if (!dimensionKey) {
    return '我们来重新校准你的学习画像。告诉我你想调整哪个维度，或直接描述你最近的变化，我会立即更新。';
  }
  const label = getDimensionLabel(dimensionKey);
  const questionMap: Record<string, string> = {
    major_background: `我们来重新校准「${label}」。你现在主修的专业方向是？点击下方选项或直接描述都可以。`,
    resource_preference: `我们来重新校准「${label}」。你更喜欢哪类学习资源？点击下方选项或直接描述都可以。`,
    cognitive_style: `我们来重新校准「${label}」。你更适应哪种讲解方式？点击下方选项或直接描述都可以。`,
    learning_goal: `我们来重新校准「${label}」。你近期的学习目标是什么？点击下方选项或直接描述都可以。`,
    learning_pace: `我们来重新校准「${label}」。你习惯怎样的学习节奏？点击下方选项或直接描述都可以。`,
    knowledge_base: `我们来重新校准「${label}」。你目前在这个领域的掌握程度如何？点击下方选项或直接描述都可以。`,
    weakness: `我们来重新校准「${label}」。你最容易在哪种类型的题目上卡壳？点击下方选项或直接描述都可以。`,
    expression_preference: `我们来重新校准「${label}」。你希望我用什么方式回复你？点击下方选项或直接描述都可以。`,
    learning_habit: `我们来重新校准「${label}」。你的学习习惯是怎样的？点击下方选项或直接描述都可以。`,
    general_weakness: `我们来重新校准「${label}」。你觉得自己在哪些通用能力上偏弱？点击下方选项或直接描述都可以。`,
  };
  return questionMap[dimensionKey] ?? `我们来重新校准「${label}」。点击下方选项或直接描述都可以。`;
}
