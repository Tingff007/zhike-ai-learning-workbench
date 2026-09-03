import { KeyRound, Upload } from 'lucide-react';
import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';
import { aggregateDocumentPipeline, type PipelineBucketCounts } from '../../data/knowledgePipelineStats';
import type { ChatdocConfigView } from '../../types';
import { KnowledgePipelineFunnel } from './KnowledgePipelineFunnel';

const sourceLabel: Record<string, string> = {
  database: '管理端',
  environment: '.env',
  none: '未配置',
};

type DocumentSummary = {
  chatdocFileStatus?: string | null;
  vectorStatus?: string | null;
  parseStatus?: string | null;
};

export type KnowledgeIntegrationStatusBarProps = {
  config?: ChatdocConfigView | null;
  configLoading?: boolean;
  documents: DocumentSummary[];
  chunkTotal: number;
  processingCount: number;
  onOpenCredentials: () => void;
  useMocks?: boolean;
  metricsLabel?: string;
  /** 有文档正在上传/解析/向量化时展示入库流水线 */
  showPipeline?: boolean;
};

function StatusDot({ ok, warn }: { ok?: boolean; warn?: boolean }): JSX.Element {
  if (warn) return <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />;
  if (ok) return <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />;
  return <span className="inline-block h-2 w-2 rounded-full bg-slate-300" />;
}

export function KnowledgeIntegrationStatusBar({
  config,
  configLoading,
  documents,
  chunkTotal,
  processingCount,
  onOpenCredentials,
  useMocks = false,
  metricsLabel,
  showPipeline = false,
}: KnowledgeIntegrationStatusBarProps): JSX.Element {
  const configured = Boolean(config?.configured) || useMocks;
  const pipelineCounts: PipelineBucketCounts = aggregateDocumentPipeline(documents);

  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="font-semibold text-slate-950">云端知识库接入</span>
          <span className="inline-flex items-center gap-2 text-slate-600">
            <StatusDot ok={configured} warn={!configured && !configLoading} />
            凭证 {configured ? '已就绪' : '未配置'}
            {config?.credential_source && configured && (
              <span className="text-xs text-slate-400">({sourceLabel[config.credential_source] ?? config.credential_source})</span>
            )}
          </span>
          {useMocks && (
            <span className="rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">Mock 演示</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary h-9 gap-2 px-3 text-sm" onClick={onOpenCredentials}>
            <KeyRound size={15} />
            {kb.credentialsLink}
          </button>
        </div>
      </div>

      {!configured && !useMocks && (
        <div className="border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {kb.designModeOffline}
          <button type="button" className="ml-2 font-medium text-primary hover:underline" onClick={onOpenCredentials}>
            立即配置
          </button>
        </div>
      )}

      {showPipeline && (
        <div className="px-4 py-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span className="font-medium text-slate-700">
              入库流水线
              {metricsLabel ? <span className="ml-2 font-normal text-slate-500">({metricsLabel})</span> : null}
            </span>
            <span className="flex flex-wrap gap-3">
              <span>可检索 <b className="font-mono text-slate-800">{pipelineCounts.ready}</b></span>
              <span>处理中 <b className="font-mono text-slate-800">{processingCount}</b></span>
              {pipelineCounts.failed > 0 && (
                <span className="text-red-600">失败 <b className="font-mono">{pipelineCounts.failed}</b></span>
              )}
              <span>分段 <b className="font-mono text-slate-800">{chunkTotal.toLocaleString()}</b></span>
            </span>
          </div>
          <KnowledgePipelineFunnel counts={pipelineCounts} compact />
        </div>
      )}

      {configured && processingCount > 0 && (
        <div className="flex items-center gap-2 border-t border-blue-100 bg-blue-50/60 px-4 py-2 text-xs text-blue-800">
          <Upload size={14} />
          {processingCount} 篇文档正在云端处理，状态约每 5 秒同步一次。
        </div>
      )}

    </section>
  );
}
