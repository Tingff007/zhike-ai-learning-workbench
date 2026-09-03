import { api } from '../api/endpoints';
import type { Resource } from '../types';

/** 资源详情 API 返回的对外 id（code），可用于 GET /resources/{id} */
export function canonicalResourceId(resource: Resource): string {
  return resource.id;
}

/**
 * 将任务结果或 URL 中的 code/uuid 解析为详情接口可用的 resource.id。
 * 不直接把 result_resource_code 当作最终 id，而是经详情接口确认。
 */
export async function resolveArtifactId(hints: {
  resultResourceId?: string | null;
  resultResourceCode?: string | null;
  lookup?: string | null;
}): Promise<string | null> {
  const candidate =
    hints.lookup?.trim() ||
    hints.resultResourceId?.trim() ||
    hints.resultResourceCode?.trim() ||
    null;
  if (!candidate) return null;

  try {
    const detail = await api.resourceDetail(candidate);
    if (detail?.status === 'not_found') return null;
    if (detail?.id) return canonicalResourceId(detail);
  } catch {
    return null;
  }
  return null;
}
