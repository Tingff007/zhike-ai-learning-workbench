import { BookOpen, ExternalLink, GitBranch, Layers, Scale, Search, Shuffle } from 'lucide-react';
import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';
import { formatDateTimeZh } from '../../utils/formatDateTime';

const CHATDOC_DOC_URL = 'https://chatdoc.xfyun.cn/docs#/';

const pipelineSteps = [
  { key: 'upload', label: '上传', api: 'POST /file/upload', detail: 'stepByStep=true，不自动向量化' },
  { key: 'parse', label: '云端解析', api: 'fileStatus: parsing', detail: 'OCR / 文本化' },
  { key: 'split', label: '自动切片', api: 'chunkSize / minChunkSize', detail: '流程暂停在 splited（已切分）' },
  { key: 'pull', label: '全量拉取', api: 'GET /file/chunks', detail: '原生分片一次性入库' },
  { key: 'local', label: '本地落地', api: 'document_chunks', detail: '永久溯源，可人工微调' },
  { key: 'embed', label: '手动向量化', api: 'POST /file/embedding', detail: '满意后再写入向量索引' },
] as const;

const traceUseCases = [
  {
    icon: Search,
    title: '检索结果溯源',
    body: '问答返回 fileRefer（分片 index），用本地库匹配原文，精准定位出处。',
  },
  {
    icon: GitBranch,
    title: '切分效果排查',
    body: '答案不准时调取原生分片，区分「切分不合理」还是「检索匹配问题」。',
  },
  {
    icon: Shuffle,
    title: '多模型切换复用',
    body: '原生切片可脱离讯飞，对接第三方 Embedding + LLM，无需重新解析文档。',
  },
  {
    icon: Scale,
    title: '用量对账',
    body: '对比云端分段统计与本地分片总数，与讯飞控制台做数据对账。',
  },
] as const;

export type ChatDocSliceTracePanelProps = {
  fileId?: string | null;
  cloudTotal?: number | null;
  localTotal?: number | null;
  reconciliationOk?: boolean | null;
  syncedAt?: string | null;
  chatdocFileStatus?: string | null;
  /** 抽屉内分段工作台：默认折叠说明区，避免挤压 PDF/列表 */
  compact?: boolean;
  className?: string;
};

export function ChatDocSliceTracePanel({
  fileId,
  cloudTotal,
  localTotal,
  reconciliationOk,
  syncedAt,
  chatdocFileStatus,
  compact = false,
  className = '',
}: ChatDocSliceTracePanelProps): JSX.Element {
  return (
    <section
      className={`native-slice-trace shrink-0 rounded-xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 via-white to-violet-50/50 p-4 shadow-sm ${className}`.trim()}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <Layers size={16} className="text-indigo-600" />
            {kb.nativeSliceWorkflowTitle}
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">{kb.nativeSliceWorkflowHint}</p>
        </div>
        <a
          href={CHATDOC_DOC_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary inline-flex h-9 shrink-0 items-center gap-2 px-3 text-xs"
        >
          <BookOpen size={14} />
          {kb.nativeSliceDocLabel}
          <ExternalLink size={12} className="opacity-60" />
        </a>
      </div>

      <ol
        className={`mt-4 grid gap-2 ${
          compact ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6' : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'
        }`}
      >
        {pipelineSteps.map((step, index) => (
          <li
            key={step.key}
            className="relative rounded-lg border border-white/80 bg-white/90 px-3 py-2.5 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 font-mono text-[11px] font-bold text-indigo-700">
                {index + 1}
              </span>
              <span className="text-xs font-semibold text-slate-900">{step.label}</span>
            </div>
            <div className="mt-1 font-mono text-[10px] text-indigo-600">{step.api}</div>
            <div className="mt-0.5 text-[11px] leading-4 text-slate-500">{step.detail}</div>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap gap-3 text-xs">
        {fileId && (
          <span className="rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-slate-600">
            fileId: {fileId}
          </span>
        )}
        {chatdocFileStatus && (
          <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900">
            云端 {chatdocFileStatus}
          </span>
        )}
        {cloudTotal != null && (
          <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-600">
            云端段数 {cloudTotal}
          </span>
        )}
        {localTotal != null && (
          <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-600">
            本地段数 {localTotal}
          </span>
        )}
        {reconciliationOk === true && (
          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-800">
            {kb.nativeSliceReconcileOk}
          </span>
        )}
        {reconciliationOk === false && (
          <span className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-red-800">
            {kb.nativeSliceReconcileMismatch}
          </span>
        )}
        {syncedAt && (
          <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-500">
            最近入库 {formatDateTimeZh(syncedAt)}
          </span>
        )}
      </div>

      {!compact && (
        <div className="mt-4 border-t border-indigo-100/80 pt-4">
          <div className="text-xs font-semibold text-slate-800">{kb.nativeSliceTraceTitle}</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {traceUseCases.map((item) => (
              <div key={item.title} className="flex gap-2 rounded-lg border border-slate-100 bg-white/80 px-3 py-2">
                <item.icon size={16} className="mt-0.5 shrink-0 text-indigo-500" />
                <div>
                  <div className="text-xs font-semibold text-slate-900">{item.title}</div>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-600">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
