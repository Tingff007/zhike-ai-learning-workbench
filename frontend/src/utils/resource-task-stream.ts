import type { ResourceGenerationTask } from '../types';
import { tryParseJsonValue } from './json-parse';

export const RESOURCE_TASK_TERMINAL_STATUSES = new Set([
  'succeeded',
  'completed',
  'failed',
  'cancelled',
  'need_input',
  'needs_input',
  'not_found',
]);

export type ResourceTaskStreamPayload = Record<string, unknown> & {
  type: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 解析资源生成任务 WebSocket 帧，坏 JSON 或缺少事件类型时返回 null。 */
export function parseResourceTaskStreamPayload(raw: string): ResourceTaskStreamPayload | null {
  const payload = tryParseJsonValue(raw);
  return isRecord(payload) && typeof payload.type === 'string'
    ? { ...payload, type: payload.type }
    : null;
}

/** 判断资源生成任务状态是否已经进入终态，终态后应触发一次 REST 刷新。 */
export function isTerminalResourceTaskStatus(status: unknown): boolean {
  return typeof status === 'string' && RESOURCE_TASK_TERMINAL_STATUSES.has(status);
}

/** 合并 REST 缓存任务与实时增量，保留数组字段的稳定默认值。 */
export function mergeResourceGenerationTask(
  base: ResourceGenerationTask | undefined,
  incoming: Partial<ResourceGenerationTask> & Record<string, unknown>,
): ResourceGenerationTask {
  const merged: Partial<ResourceGenerationTask> = { ...base, ...incoming };

  return {
    ...merged,
    task_id: merged.task_id ?? '',
    status: merged.status ?? 'unknown',
    resource_type: merged.resource_type ?? 'unknown',
    steps: incoming.steps ?? base?.steps ?? [],
    outline_json: incoming.outline_json ?? base?.outline_json ?? [],
    citations: incoming.citations ?? base?.citations ?? [],
    assets: incoming.assets ?? base?.assets ?? [],
  };
}
