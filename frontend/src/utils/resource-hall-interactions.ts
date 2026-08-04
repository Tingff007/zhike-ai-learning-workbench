import type { Resource } from '../types';
import { readLocalJson, writeLocalJson } from './browser-storage';
import { isRecord } from './type-guards';

export const RESOURCE_HALL_INTERACTION_STORAGE_KEY = 'zhike-resource-hall-interactions-v1';

export type ResourceCommunityComment = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
};

export type ResourceInteraction = {
  title?: string;
  resourceType?: string;
  liked: boolean;
  saved: boolean;
  planned: boolean;
  completed: boolean;
  likeCount: number;
  saveCount: number;
  comments: ResourceCommunityComment[];
  lastAction?: string;
  updatedAt?: string;
};

export type ResourceInteractionMap = Record<string, ResourceInteraction>;

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readNonNegativeInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.round(value));
}

function isResourceCommunityComment(value: unknown): value is ResourceCommunityComment {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string'
    && typeof value.author === 'string'
    && typeof value.body === 'string'
    && typeof value.createdAt === 'string'
  );
}

function readComments(value: unknown): ResourceCommunityComment[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isResourceCommunityComment);
}

/** 校验 localStorage 顶层必须是对象，单条互动由归一化逻辑做容错过滤。 */
function isRawInteractionRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

/** 将本地互动记录归一化为页面可直接消费的稳定结构。 */
export function normalizeResourceInteraction(raw: unknown, resource?: Resource | null): ResourceInteraction {
  const source = isRecord(raw) ? raw : {};
  const liked = readBoolean(source.liked);
  const saved = readBoolean(source.saved);
  const planned = readBoolean(source.planned);
  const completed = readBoolean(source.completed);

  return {
    title: readOptionalString(source.title) ?? resource?.title,
    resourceType: readOptionalString(source.resourceType) ?? resource?.type ?? resource?.resource_type,
    liked,
    saved,
    planned,
    completed,
    likeCount: readNonNegativeInteger(source.likeCount, liked ? 1 : 0),
    saveCount: readNonNegativeInteger(source.saveCount, saved ? 1 : 0),
    comments: readComments(source.comments),
    lastAction: readOptionalString(source.lastAction),
    updatedAt: readOptionalString(source.updatedAt),
  };
}

/** 从 localStorage 读取资源大厅本地互动记录，坏 JSON 或坏结构会被安全丢弃。 */
export function loadResourceHallInteractions(): ResourceInteractionMap {
  const rawMap = readLocalJson<Record<string, unknown>>(
    RESOURCE_HALL_INTERACTION_STORAGE_KEY,
    {},
    isRawInteractionRecord,
  );

  return Object.fromEntries(
    Object.entries(rawMap)
      .filter(([resourceId, value]) => resourceId.trim().length > 0 && isRecord(value))
      .map(([resourceId, value]) => [resourceId, normalizeResourceInteraction(value)]),
  );
}

/** 将资源大厅本地互动记录写入 localStorage，写入失败不阻断页面交互。 */
export function saveResourceHallInteractions(interactions: ResourceInteractionMap): boolean {
  return writeLocalJson(RESOURCE_HALL_INTERACTION_STORAGE_KEY, interactions);
}
