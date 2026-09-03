import { knowledgeIntegrationCopy as kb } from '../config/knowledgeIntegration';
import type { IngestionStatus } from '../types';

export const vectorTerminalStatuses = new Set(['ready', 'indexed', 'skipped', 'failed', 'pending_activation']);

export type IngestionDocumentSnapshot = {
  parseStatus?: string;
  vectorStatus?: string;
  awaitingActivation?: boolean;
  publishReadiness?: string | null;
  cloudStatus?: string | null;
  chatdocFileStatus?: string | null;
  parserVersion?: string | null;
};

export type IngestionProgressView = {
  percent: number;
  /** 轮询失败且没有新鲜状态载荷时为 true。 */
  syncFailed: boolean;
};

export function isAwaitingActivation(document?: IngestionDocumentSnapshot | null): boolean {
  if (!document) return false;
  if (document.awaitingActivation) return true;
  if (document.vectorStatus === 'pending_activation') return true;
  if (document.publishReadiness === 'awaiting_activation') return true;
  const cloud = (document.cloudStatus ?? document.chatdocFileStatus ?? '').toLowerCase();
  return cloud === 'splited';
}

export function isDocumentProcessing(document: IngestionDocumentSnapshot): boolean {
  if (document.parseStatus === 'failed' || document.vectorStatus === 'failed') return false;
  if (isAwaitingActivation(document)) return false;
  return document.parseStatus !== 'completed'
    || document.vectorStatus === 'processing'
    || document.vectorStatus === 'vectorizing'
    || document.vectorStatus === 'indexing';
}

export function isIngestionTerminal(status?: IngestionStatus, document?: IngestionDocumentSnapshot | null): boolean {
  if (isAwaitingActivation(document)) return true;
  if (status?.awaiting_activation) return true;
  if (document?.parseStatus === 'failed' || document?.vectorStatus === 'failed') return true;
  if (document?.parseStatus === 'completed' && vectorTerminalStatuses.has(document.vectorStatus ?? '')) return true;
  if (!status) return false;
  if (status.status === 'not_found') return true;
  if (status.status === 'failed' || status.parse_status === 'failed' || status.vector_status === 'failed') return true;
  return status.parse_status === 'completed' && vectorTerminalStatuses.has(status.vector_status ?? '');
}

export function isIngestionFailed(status?: IngestionStatus, document?: IngestionDocumentSnapshot | null): boolean {
  return status?.status === 'failed'
    || status?.status === 'not_found'
    || status?.parse_status === 'failed'
    || status?.vector_status === 'failed'
    || document?.parseStatus === 'failed'
    || document?.vectorStatus === 'failed';
}

/** 状态轮询失败时避免展示误导性的固定 12% 占位进度。 */
export function resolveIngestionProgressView(
  status?: IngestionStatus,
  document?: IngestionDocumentSnapshot | null,
  syncFailed = false,
): IngestionProgressView {
  if (isIngestionFailed(status, document)) {
    return { percent: 100, syncFailed: false };
  }
  if (status?.progress !== undefined) {
    return {
      percent: Math.max(0, Math.min(100, Math.round(status.progress))),
      syncFailed: syncFailed && !status.stages?.length,
    };
  }
  if (document && !isDocumentProcessing(document)) {
    return { percent: 100, syncFailed: false };
  }
  const stages = status?.stages ?? [];
  if (stages.length > 0) {
    const percent = Math.round((stages.filter((stage) => stage.status === 'completed').length / stages.length) * 100);
    return { percent, syncFailed: false };
  }
  if (syncFailed) {
    const fallback = document && isDocumentProcessing(document) ? 20 : 0;
    return { percent: fallback, syncFailed: true };
  }
  if (document?.vectorStatus === 'ready') {
    return { percent: 100, syncFailed: false };
  }
  return { percent: 20, syncFailed: false };
}

export function ingestionStatusLabel(status?: IngestionStatus, document?: IngestionDocumentSnapshot | null, syncFailed = false): string {
  if (syncFailed && !status) return '状态同步失败';
  if (status?.status === 'not_found') return '旧任务已清理';
  if (isIngestionFailed(status, document)) return '失败';
  if (isAwaitingActivation(document) || status?.awaiting_activation) return kb.stageAwaitingActivation;
  if (
    (status?.parse_status === 'completed' && vectorTerminalStatuses.has(status.vector_status ?? ''))
    || (document?.parseStatus === 'completed' && vectorTerminalStatuses.has(document.vectorStatus ?? ''))
  ) {
    return '已完成';
  }
  if (status?.status === 'running' || (document && isDocumentProcessing(document))) return '后台处理中';
  return '排队中';
}
