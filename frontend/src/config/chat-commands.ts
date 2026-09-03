export type ChatCommandKind = 'course_rag_qa' | 'resource_generation';

export type ChatCommandDefinition = {
  key: string;
  label: string;
  prompt?: string;
  kind: ChatCommandKind;
  resourceType?: string;
  difficulty?: string;
};

export const COURSE_RAG_QA_COMMAND: ChatCommandDefinition = {
  key: 'course_rag_qa',
  label: '课程资料问答',
  kind: 'course_rag_qa',
};

export const RESOURCE_GENERATION_COMMANDS: ChatCommandDefinition[] = [
  { key: 'lecture', label: '高白话讲义', prompt: '生成一份高白话讲义', kind: 'resource_generation', resourceType: 'lecture', difficulty: 'basic' },
  { key: 'code_lab', label: 'PyTorch 实操案例', prompt: '生成一个 PyTorch 编程实操案例', kind: 'resource_generation', resourceType: 'code_lab', difficulty: 'intermediate' },
  { key: 'quiz', label: '阶段测评题', prompt: '生成一组阶段测评题并附评分要点', kind: 'resource_generation', resourceType: 'quiz', difficulty: 'medium' },
  { key: 'remedial', label: '错题补救卡', prompt: '生成错题归因补救卡片', kind: 'resource_generation', resourceType: 'misconception_card', difficulty: 'basic' },
  { key: 'mindmap', label: '知识思维导图', prompt: '生成知识点思维导图', kind: 'resource_generation', resourceType: 'mindmap', difficulty: 'medium' },
  { key: 'diagram_pack', label: '教学图解包', prompt: '生成 3 张教学图解：概念示意图、流程图、易错对比图', kind: 'resource_generation', resourceType: 'diagram_pack', difficulty: 'medium' },
  { key: 'reading', label: '拓展阅读包', prompt: '生成拓展阅读与引用清单', kind: 'resource_generation', resourceType: 'reading', difficulty: 'advanced' },
];

/** 快捷菜单完整列表：课程资料问答 + 资源生成入口 */
export const CHAT_COMMAND_OPTIONS: ChatCommandDefinition[] = [
  COURSE_RAG_QA_COMMAND,
  ...RESOURCE_GENERATION_COMMANDS,
];

export const QUIZ_COMMAND: ChatCommandDefinition = RESOURCE_GENERATION_COMMANDS.find((item) => item.key === 'quiz')!;

export function findChatCommandByKey(key: string): ChatCommandDefinition | undefined {
  return CHAT_COMMAND_OPTIONS.find((item) => item.key === key);
}

export function findChatCommandByLabel(label: string): ChatCommandDefinition | undefined {
  return CHAT_COMMAND_OPTIONS.find((item) => item.label === label);
}

export function isResourceGenerationCommand(command: ChatCommandDefinition | undefined): boolean {
  return command?.kind === 'resource_generation';
}

export function isQuizResourceIntent(activeMode: string, message: string): boolean {
  if (activeMode === '出题') return true;
  const lowered = message.toLowerCase();
  return ['生成 5 道', '生成5道', '练习题', '测评题', '题库'].some((token) => lowered.includes(token));
}
