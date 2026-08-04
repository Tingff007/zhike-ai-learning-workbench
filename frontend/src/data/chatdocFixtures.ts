import type { ChatDocChunkItem, ChatDocChunksResponse, Citation, NativeChunkItem, NativeChunkListResponse } from '../types';

/** @deprecated 请从 ./chatdocStatus 导入。 */
export { chatdocPipelineSteps } from './chatdocStatus';

export const chatdocHitTestingFixtures: Citation[] = [
  {
    source_id: 'mock-file-d2l-ch8',
    source_title: '深度学习讲义样章.pdf',
    iflytek_file_id: 'mock-file-d2l-ch8',
    chunk_index: 0,
    chunk_id: 'iflytek:mock-file-d2l-ch8:0',
    local_chunk_id: 'fixture-chunk-0',
    provenance_source: 'local_native',
    retrieval_mode: 'iflytek_vector',
    similarity: 0.91,
    snippet: '跳字模型是 n-gram 的神经网络扩展，用分布式词向量预测下一词。',
    content:
      '跳字模型（Neural Language Model）使用分布式表示预测下一个词，是统计语言模型与深度学习的桥梁。与 n-gram 相比，跳字模型通过 $P(w_t \\mid w_{t-k}, \\ldots, w_{t-1})$ 的神经网络参数化，可缓解数据稀疏问题。',
    page_no: 12,
  },
  {
    source_id: 'mock-file-d2l-ch8',
    source_title: '深度学习讲义样章.pdf',
    iflytek_file_id: 'mock-file-d2l-ch8',
    chunk_index: 1,
    chunk_id: 'iflytek:mock-file-d2l-ch8:1',
    local_chunk_id: 'fixture-chunk-1',
    provenance_source: 'local_native',
    retrieval_mode: 'iflytek_vector',
    similarity: 0.84,
    snippet: 'n-gram 通过固定窗口估计词序列概率，但面临维度灾难。',
    content:
      'n-gram 语言模型通过固定长度上下文估计词序列概率：$P(w_t \\mid w_{t-n+1}, \\ldots, w_{t-1})$。窗口增大时参数空间指数增长，称为维度灾难。',
    page_no: 11,
  },
];

export const chatdocChunkPreviewFixtures: ChatDocChunkItem[] = [
  {
    index: 0,
    data_type: 'wiki',
    content:
      '跳字模型（Neural Language Model）使用分布式表示预测下一个词，是统计语言模型与深度学习的桥梁。',
    preview: '跳字模型（Neural Language Model）使用分布式表示预测下一个词…',
  },
  {
    index: 1,
    data_type: 'wiki',
    content: 'n-gram 通过固定窗口估计词序列概率；窗口增大时参数空间指数增长。',
    preview: 'n-gram 通过固定窗口估计词序列概率…',
  },
];

export const chatdocNativeChunkFixtures: NativeChunkItem[] = [
  {
    chunk_id: 'fixture-chunk-0',
    file_id: 'fixture-file-id',
    index: 0,
    page: 11,
    content:
      '跳字模型（Neural Language Model）使用分布式表示预测下一个词，是统计语言模型与深度学习的桥梁。',
    char_count: 48,
    vector_status: 'pending_vectorization',
    tags: ['核心概念'],
    vendor_chunk_id: 'xf-chunk-0',
    char_start: 0,
    char_end: 48,
    data_type: 'wiki',
  },
  {
    chunk_id: 'fixture-chunk-1',
    file_id: 'fixture-file-id',
    index: 1,
    page: 12,
    content: 'n-gram 通过固定窗口估计词序列概率；窗口增大时参数空间指数增长。',
    char_count: 32,
    vector_status: 'pending_vectorization',
    tags: [],
    vendor_chunk_id: 'xf-chunk-1',
    char_start: 50,
    char_end: 82,
    data_type: 'wiki',
  },
];

export function chatdocNativeChunksPayload(
  documentId: string,
  vectorStatus?: string | null,
  offset = 0,
  limit = 50,
): NativeChunkListResponse {
  const total = chatdocNativeChunkFixtures.length;
  const vectorized = vectorStatus === 'ready' || vectorStatus === 'indexed';
  const items = chatdocNativeChunkFixtures.map((item) => ({
    ...item,
    vector_status: vectorized ? ('vectorized' as const) : item.vector_status,
  }));
  return {
    document_id: documentId,
    file_id: 'fixture-file-id',
    vector_status: vectorStatus ?? 'pending_activation',
    cloud_chunk_total: total,
    local_chunk_total: total,
    reconciliation_ok: true,
    synced_at: new Date().toISOString(),
    total,
    limit,
    offset,
    items: items.slice(offset, offset + limit),
  };
}

export function chatdocChunksPayload(
  documentId: string,
  vectorStatus?: string | null,
  offset = 0,
  limit = 25,
): ChatDocChunksResponse {
  const total = chatdocChunkPreviewFixtures.length;
  return {
    document_id: documentId,
    file_id: 'fixture-file-id',
    source: 'iflytek_chatdoc' as const,
    vector_status: vectorStatus ?? 'ready',
    total,
    limit,
    offset,
    items: chatdocChunkPreviewFixtures.slice(offset, offset + limit),
  };
}

export function isChatDocManagedDocument(parserVersion?: string | null): boolean {
  return parserVersion === 'iflytek_chatdoc';
}

/** AI 自习室和引用面板演示使用的离线/设计模式引用数据。 */
export function chatdocFixtureCitations(): Citation[] {
  return chatdocHitTestingFixtures;
}
