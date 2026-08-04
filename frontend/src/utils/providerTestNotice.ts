import type { ProviderTestResult } from '../types';

/** 页面顶部 notice 条使用的单行摘要 */
export function formatProviderTestNotice(result: ProviderTestResult): string {
  const parts = [`${result.provider_id} 测试结果：${result.status}`];
  if (result.embedding_dim != null) parts.push(`向量维度 ${result.embedding_dim}`);
  if (result.image_generation) parts.push('图片生成可用');
  if (result.latency_ms != null) parts.push(`${result.latency_ms}ms`);
  const detail = result.error ?? result.message;
  if (detail) parts.push(detail);
  return parts.join('，');
}
