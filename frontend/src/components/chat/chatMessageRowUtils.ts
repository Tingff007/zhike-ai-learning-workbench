import type { WorkspaceChatMessage } from '../../stores/conversation.store';
import type { Citation } from '../../types';
import { beijingWallClockToUtc, getBeijingParts } from '../../utils/formatDateTime';
import { isResourceTaskMessage } from '../../utils/resource-task-messages';
import { ERROR_ROOT_CAUSE_PREFIX } from '../../utils/workspace-errors';

export type ChatMessageVariant = 'user' | 'assistant' | 'error' | 'success' | 'progress';

export type ParsedErrorSteps = {
  summary: string;
  rootCause: string | undefined;
  steps: string[];
};

export type ChatMessageGroup = {
  key: string;
  dedupeKey: string;
  messages: WorkspaceChatMessage[];
  collapsed: boolean;
  collapseReason?: 'error';
};

export type ChatMessageWithCitations = WorkspaceChatMessage & {
  citations: Citation[];
};

/** 判断消息是否携带可渲染的引用来源，并为引用组件收窄类型。 */
export function hasMessageCitations(message: WorkspaceChatMessage): message is ChatMessageWithCitations {
  return Array.isArray(message.citations) && message.citations.length > 0;
}

/** 判断消息在聊天气泡中的展示状态。 */
export function detectMessageVariant(message: WorkspaceChatMessage): ChatMessageVariant {
  if (message.variant) return message.variant;
  if (message.role === 'user') return 'user';
  const text = message.content;
  if (/失败|不可用|错误|blocked/i.test(text)) return 'error';
  if (message.kind === 'resource_task' && (message.taskStatus === 'succeeded' || message.taskStatus === 'completed')) return 'success';
  if (/已触发|已保存|成功|完成|已创建/i.test(text)) return 'success';
  if (/正在|处理中|Agent|等待|生成中|核验/.test(text)) return 'progress';
  return 'assistant';
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** 将消息创建时间格式化为面向北京时区的短标签。 */
export function formatMessageTime(timestamp?: number): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;

  const parts = getBeijingParts(date);
  const todayParts = getBeijingParts(new Date());
  const todayStart = beijingWallClockToUtc(todayParts.year, todayParts.month, todayParts.day).getTime();
  const tomorrowStart = todayStart + 86_400_000;
  const yesterdayStart = todayStart - 86_400_000;
  const time = `${pad2(parts.hour)}:${pad2(parts.minute)}`;

  if (timestamp >= todayStart && timestamp < tomorrowStart) return `今天 ${time}`;
  if (timestamp >= yesterdayStart && timestamp < todayStart) return `昨天 ${time}`;
  if (parts.year === todayParts.year) return `${pad2(parts.month)}月${pad2(parts.day)}日 ${time}`;
  return `${parts.year}年${pad2(parts.month)}月${pad2(parts.day)}日 ${time}`;
}

/** 解析标准化错误文案，拆出摘要、根因和可操作步骤。 */
export function parseErrorSteps(content: string): ParsedErrorSteps {
  const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) return { summary: content, rootCause: undefined, steps: [] };
  let rootCause: string | undefined;
  const steps: string[] = [];
  const summaryParts: string[] = [];
  for (const line of lines) {
    if (line.startsWith(ERROR_ROOT_CAUSE_PREFIX)) {
      rootCause = line.slice(ERROR_ROOT_CAUSE_PREFIX.length).trim();
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      steps.push(line.replace(/^\d+\.\s*/, ''));
      continue;
    }
    summaryParts.push(line);
  }
  const summary = summaryParts[0] ?? lines[0];
  return { summary, rootCause, steps };
}

/** 将连续重复错误或同一资源任务消息合并成渲染分组。 */
export function groupMessages(messages: WorkspaceChatMessage[]): ChatMessageGroup[] {
  const groups: ChatMessageGroup[] = [];
  for (const [index, message] of messages.entries()) {
    const variant = detectMessageVariant(message);
    const dedupeKey =
      isResourceTaskMessage(message) && message.taskId
        ? `resource-task:${message.taskId}`
        : variant === 'error'
          ? `error:${message.content}`
          : message.id;
    const last = groups[groups.length - 1];
    if (last && last.dedupeKey === dedupeKey && isResourceTaskMessage(message)) {
      last.messages = [message];
      last.collapsed = false;
      continue;
    }
    if (last && last.dedupeKey === dedupeKey && variant === 'error') {
      last.messages.push(message);
      last.collapsed = last.messages.length > 1;
      last.collapseReason = 'error';
      continue;
    }
    groups.push({
      key: `${variant === 'error' ? 'error' : 'msg'}-${index}-${message.id}`,
      dedupeKey,
      messages: [message],
      collapsed: false,
    });
  }
  return groups;
}
