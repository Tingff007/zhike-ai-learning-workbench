import { chatdocPipelineSteps, normalizeChatdocFileStatus } from './chatdocStatus';

export type PipelineBucketKey = 'uploaded' | 'parse' | 'split' | 'vectorize' | 'ready' | 'failed';

export type PipelineBucketCounts = Record<PipelineBucketKey, number>;

export type PipelineFunnelStep = {
  key: PipelineBucketKey;
  label: string;
  hint: string;
};

export const pipelineBucketLabels: Record<PipelineBucketKey, string> = {
  uploaded: '已上传',
  parse: '解析',
  split: '切分',
  vectorize: '向量化',
  ready: '可检索',
  failed: '失败',
};

const emptyCounts = (): PipelineBucketCounts => ({
  uploaded: 0,
  parse: 0,
  split: 0,
  vectorize: 0,
  ready: 0,
  failed: 0,
});

export function bucketFileStatus(status?: string | null): PipelineBucketKey | null {
  const normalized = normalizeChatdocFileStatus(status);
  if (!normalized || normalized === 'unknown') return null;
  if (normalized === 'failed') return 'failed';
  if (normalized === 'vectored') return 'ready';
  if (normalized === 'vectoring') return 'vectorize';
  if (['spliting', 'split', 'splited'].includes(normalized)) return 'split';
  if (['texted', 'ocring'].includes(normalized)) return 'parse';
  if (normalized === 'uploaded') return 'uploaded';
  return null;
}

type DocumentPipelineInput = {
  chatdocFileStatus?: string | null;
  vectorStatus?: string | null;
  parseStatus?: string | null;
};

export function aggregateDocumentPipeline(documents: DocumentPipelineInput[]): PipelineBucketCounts {
  const counts = emptyCounts();
  documents.forEach((document) => {
    if (document.parseStatus === 'failed' || document.vectorStatus === 'failed') {
      counts.failed += 1;
      return;
    }
    const bucket = bucketFileStatus(document.chatdocFileStatus);
    if (bucket) {
      counts[bucket] += 1;
      return;
    }
    if (document.vectorStatus === 'ready' || document.vectorStatus === 'indexed') {
      counts.ready += 1;
      return;
    }
    if (
      document.vectorStatus === 'processing'
      || document.vectorStatus === 'vectorizing'
      || document.vectorStatus === 'indexing'
      || document.parseStatus === 'processing'
    ) {
      counts.parse += 1;
      return;
    }
    counts.uploaded += 1;
  });
  return counts;
}

export function aggregateFileStatusDistribution(
  items: Array<{ file_status: string; count: number }>,
): PipelineBucketCounts {
  const counts = emptyCounts();
  items.forEach((item) => {
    const bucket = bucketFileStatus(item.file_status);
    if (bucket) counts[bucket] += item.count;
    else if (item.file_status === 'unknown') counts.uploaded += item.count;
  });
  return counts;
}

const pipelineFunnelStepKeys: PipelineBucketKey[] = ['uploaded', 'parse', 'split', 'vectorize', 'ready'];

export const pipelineFunnelSteps: PipelineFunnelStep[] = chatdocPipelineSteps.map((step, index) => ({
  key: pipelineFunnelStepKeys[index],
  label: step.label,
  hint: step.hint,
}));
