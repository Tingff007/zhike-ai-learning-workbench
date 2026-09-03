import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Brain,
  CheckCircle2,
  Code2,
  FileText,
  Images,
  Layers,
} from 'lucide-react';
import { CHAT_COMMAND_OPTIONS, type ChatCommandDefinition } from '../config/chat-commands';

export type MenuCommandOption = ChatCommandDefinition & { Icon: LucideIcon };

export type DiagramOption = {
  value: string;
  label: string;
};

const commandIconMap: Record<string, LucideIcon> = {
  course_rag_qa: BookOpen,
  lecture: FileText,
  code_lab: Code2,
  quiz: CheckCircle2,
  remedial: Brain,
  mindmap: Layers,
  diagram_pack: Images,
  reading: BookOpen,
};

/** AI 对话舱快捷命令菜单，集中维护图标与命令定义的对应关系。 */
export const menuCommandOptions: MenuCommandOption[] = CHAT_COMMAND_OPTIONS.map((command) => ({
  ...command,
  Icon: commandIconMap[command.key] ?? FileText,
}));

/** 教学图解包图片比例选项。 */
export const diagramAspectOptions: readonly DiagramOption[] = [
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
];

/** 教学图解包风格预设选项。 */
export const diagramStyleOptions: readonly DiagramOption[] = [
  { value: 'clean_edu', label: '教材清爽' },
  { value: 'isometric', label: '等距信息图' },
  { value: 'chalkboard', label: '黑板板书' },
  { value: 'paper_cut', label: '纸片拼贴' },
];
