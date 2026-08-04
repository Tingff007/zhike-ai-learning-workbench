import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Gauge, Save, XCircle } from 'lucide-react';
import { api } from '../../api/endpoints';
import { getApiErrorMessage } from '../../api/client';
import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';
import type { ChatdocVendorQuotaView } from '../../types';

function formatQuotaLine(view: ChatdocVendorQuotaView): string {
  const short: Record<string, string> = { upload: '上传', doc_qa: '问答', extract: '萃取' };
  return view.items
    .map((item) => {
      const label = short[item.key] ?? item.label;
      const cap = item.limit != null ? `/${item.limit.toLocaleString()}` : '';
      return `${label} ${item.used.toLocaleString()}${cap} ${item.unit}`;
    })
    .join(' · ');
}

function toneForUtilization(pct: number | null | undefined): string {
  if (pct == null) return 'border-slate-200 bg-slate-50';
  if (pct >= 90) return 'border-red-200 bg-red-50';
  if (pct >= 70) return 'border-amber-200 bg-amber-50';
  return 'border-emerald-200 bg-emerald-50';
}

type Props = {
  integrationKey: string;
  variant: 'card' | 'editor';
  /** 卡片模式：列表接口已带的余量，避免重复请求 */
  embeddedQuota?: ChatdocVendorQuotaView | null;
};

export function ChatdocVendorQuotaSection({ integrationKey, variant, embeddedQuota }: Props): JSX.Element | null {
  const queryClient = useQueryClient();
  const [limits, setLimits] = useState({ upload: '', docQa: '', extract: '' });
  const [packageNote, setPackageNote] = useState('');
  const [syncUsed, setSyncUsed] = useState({ upload: '', docQa: '', extract: '' });
  const [actionNotice, setActionNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const quotaQuery = useQuery({
    queryKey: ['chatdoc-vendor-quota', integrationKey],
    queryFn: () => api.chatdocVendorQuota(integrationKey),
    enabled: variant === 'editor' && Boolean(integrationKey),
    staleTime: 15_000,
    initialData: variant === 'card' && embeddedQuota ? embeddedQuota : undefined,
  });

  const data = variant === 'card' ? (embeddedQuota ?? quotaQuery.data) : quotaQuery.data;

  useEffect(() => {
    if (variant !== 'editor' || !data) return;
    const upload = data.items.find((item) => item.key === 'upload');
    const docQa = data.items.find((item) => item.key === 'doc_qa');
    const extract = data.items.find((item) => item.key === 'extract');
    setLimits({
      upload: upload?.limit != null ? String(upload.limit) : '',
      docQa: docQa?.limit != null ? String(docQa.limit) : '',
      extract: extract?.limit != null ? String(extract.limit) : '',
    });
    setPackageNote(data.package_note ?? '');
    setSyncUsed({
      upload: upload ? String(upload.used) : '',
      docQa: docQa ? String(docQa.used) : '',
      extract: extract ? String(extract.used) : '',
    });
  }, [data, variant]);

  const saveLimitsMutation = useMutation({
    mutationFn: () => {
      const uploadLimit = limits.upload.trim() ? Number(limits.upload) : null;
      const docQaLimit = limits.docQa.trim() ? Number(limits.docQa) : null;
      const extractLimit = limits.extract.trim() ? Number(limits.extract) : null;
      if (
        (limits.upload.trim() && Number.isNaN(uploadLimit!))
        || (limits.docQa.trim() && Number.isNaN(docQaLimit!))
        || (limits.extract.trim() && Number.isNaN(extractLimit!))
      ) {
        throw new Error('上限须为非负数字。');
      }
      return api.updateChatdocVendorQuota(integrationKey, {
        upload_limit_pages: uploadLimit,
        doc_qa_limit: docQaLimit,
        extract_limit: extractLimit,
        package_note: packageNote,
      });
    },
    onSuccess: (view) => {
      queryClient.setQueryData(['chatdoc-vendor-quota', integrationKey], view);
      setActionNotice({ tone: 'success', message: kb.chatdocQuotaSaveSuccess });
      void queryClient.invalidateQueries({ queryKey: ['chatdoc-vendor-quota', integrationKey] });
      void queryClient.invalidateQueries({ queryKey: ['chatdoc-config-instances'] });
      void queryClient.invalidateQueries({ queryKey: ['chatdoc-config', integrationKey] });
    },
    onError: (error) => {
      setActionNotice({ tone: 'error', message: getApiErrorMessage(error, '保存失败，请稍后重试。') });
    },
  });

  const syncUsedMutation = useMutation({
    mutationFn: () => {
      const uploadUsed = syncUsed.upload.trim() ? Number(syncUsed.upload) : undefined;
      const docQaUsed = syncUsed.docQa.trim() ? Number(syncUsed.docQa) : undefined;
      const extractUsed = syncUsed.extract.trim() ? Number(syncUsed.extract) : undefined;
      if (
        (syncUsed.upload.trim() && Number.isNaN(uploadUsed!))
        || (syncUsed.docQa.trim() && Number.isNaN(docQaUsed!))
        || (syncUsed.extract.trim() && Number.isNaN(extractUsed!))
      ) {
        throw new Error('已用量须为非负数字。');
      }
      return api.resetChatdocVendorQuotaUsed(integrationKey, {
        upload_used_pages: uploadUsed,
        doc_qa_used: docQaUsed,
        extract_used: extractUsed,
      });
    },
    onSuccess: (view) => {
      queryClient.setQueryData(['chatdoc-vendor-quota', integrationKey], view);
      setActionNotice({ tone: 'success', message: kb.chatdocQuotaSyncSuccess });
      void queryClient.invalidateQueries({ queryKey: ['chatdoc-vendor-quota', integrationKey] });
      void queryClient.invalidateQueries({ queryKey: ['chatdoc-config-instances'] });
    },
    onError: (error) => {
      setActionNotice({ tone: 'error', message: getApiErrorMessage(error, '同步失败，请稍后重试。') });
    },
  });

  if (!integrationKey) return null;

  if (variant === 'card') {
    if (!data) return null;
    const hasLimits = data.items.some((item) => item.limit != null && item.limit > 0);
    return (
      <div className="gateway-provider-card__quota">
        <span className="gateway-provider-card__quota-label">{kb.chatdocQuotaCardTitle}</span>
        <span className="gateway-provider-card__quota-value">
          {hasLimits ? formatQuotaLine(data) : kb.chatdocQuotaCardUnset}
        </span>
      </div>
    );
  }

  if (quotaQuery.isLoading) {
    return <p className="mb-4 text-sm text-slate-500">加载套餐余量…</p>;
  }

  if (quotaQuery.isError) {
    return (
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {getApiErrorMessage(quotaQuery.error, kb.chatdocQuotaLoadError)}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="mb-3 flex items-start gap-2">
        <Gauge className="mt-0.5 shrink-0 text-primary" size={18} />
        <div>
          <h3 className="text-sm font-semibold text-slate-950">{kb.chatdocQuotaEditorTitle}</h3>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">{kb.chatdocQuotaHint}</p>
        </div>
      </div>

      {actionNotice && (
        <div
          className={`mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
            actionNotice.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
          role="status"
        >
          {actionNotice.tone === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          <span className="flex-1 leading-5">{actionNotice.message}</span>
          <button type="button" className="text-xs opacity-70" onClick={() => setActionNotice(null)}>
            关闭
          </button>
        </div>
      )}

      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        {data.items.map((item) => (
          <div key={item.key} className={`rounded-lg border p-2.5 text-xs ${toneForUtilization(item.utilization_pct)}`}>
            <div className="font-semibold text-slate-900">{item.label}</div>
            <div className="mt-1 tabular-nums text-slate-950">
              {item.used.toLocaleString()} {item.unit}
              {item.limit != null ? ` / ${item.limit.toLocaleString()}` : '（未设上限）'}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-xs text-slate-500">
          文件上传上限（页）
          <input className="input mt-1 h-9 w-full" type="number" min={0} value={limits.upload} onChange={(e) => setLimits((p) => ({ ...p, upload: e.target.value }))} />
        </label>
        <label className="text-xs text-slate-500">
          文档问答上限（次）
          <input className="input mt-1 h-9 w-full" type="number" min={0} value={limits.docQa} onChange={(e) => setLimits((p) => ({ ...p, docQa: e.target.value }))} />
        </label>
        <label className="text-xs text-slate-500">
          文件萃取上限（次）
          <input className="input mt-1 h-9 w-full" type="number" min={0} value={limits.extract} onChange={(e) => setLimits((p) => ({ ...p, extract: e.target.value }))} />
        </label>
        <label className="md:col-span-3 text-xs text-slate-500">
          套餐备注
          <input className="input mt-1 h-9 w-full" value={packageNote} onChange={(e) => setPackageNote(e.target.value)} />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="btn-primary h-9 gap-2 px-4 text-sm"
          disabled={saveLimitsMutation.isPending}
          onClick={() => {
            setActionNotice(null);
            saveLimitsMutation.mutate();
          }}
        >
          <Save size={15} />
          {saveLimitsMutation.isPending ? '保存中…' : '保存套餐上限'}
        </button>
      </div>

      <details className="mt-4 border-t border-slate-200 pt-3">
        <summary className="cursor-pointer text-xs font-medium text-slate-700">{kb.chatdocQuotaSyncHint}</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="text-xs text-slate-500">
            已用 · 上传（页）
            <input className="input mt-1 h-9 w-full" type="number" min={0} value={syncUsed.upload} onChange={(e) => setSyncUsed((p) => ({ ...p, upload: e.target.value }))} />
          </label>
          <label className="text-xs text-slate-500">
            已用 · 问答（次）
            <input className="input mt-1 h-9 w-full" type="number" min={0} value={syncUsed.docQa} onChange={(e) => setSyncUsed((p) => ({ ...p, docQa: e.target.value }))} />
          </label>
          <label className="text-xs text-slate-500">
            已用 · 萃取（次）
            <input className="input mt-1 h-9 w-full" type="number" min={0} value={syncUsed.extract} onChange={(e) => setSyncUsed((p) => ({ ...p, extract: e.target.value }))} />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            className="btn-secondary h-9 px-4 text-sm"
            disabled={syncUsedMutation.isPending}
            onClick={() => {
              setActionNotice(null);
              syncUsedMutation.mutate();
            }}
          >
            {syncUsedMutation.isPending ? '同步中…' : '同步已用量'}
          </button>
        </div>
      </details>
    </div>
  );
}
