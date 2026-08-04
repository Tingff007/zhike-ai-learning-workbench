import { Activity, CheckCircle2, XCircle } from 'lucide-react';
import { formatDateTimeZh } from '../../utils/formatDateTime';
import type { ProviderTestResult } from '../../types';

export type ConnectionTestSnapshot = {
  status: string;
  message?: string | null;
  testedAt?: string | null;
  details?: Array<{ label: string; value: string }>;
};

export function providerTestToSnapshot(result: ProviderTestResult): ConnectionTestSnapshot {
  const details: Array<{ label: string; value: string }> = [];
  if (result.model) details.push({ label: '模型', value: result.model });
  if (result.latency_ms != null) details.push({ label: '延迟', value: `${result.latency_ms} ms` });
  if (result.embedding_dim != null) details.push({ label: '向量维度', value: String(result.embedding_dim) });
  if (result.chat_stream) details.push({ label: '流式', value: '支持' });
  if (result.embedding) details.push({ label: 'Embedding', value: '可用' });
  if (result.image_generation) details.push({ label: '图片生成', value: '可用' });
  if (result.json_mode) details.push({ label: 'JSON 模式', value: '支持' });
  const message = result.error ?? result.message ?? null;
  if (!message && result.status !== 'passed') {
    return {
      status: result.status,
      message: `测试未通过（状态：${result.status}），后端未返回具体原因。`,
      details: details.length > 0 ? details : undefined,
    };
  }
  return {
    status: result.status,
    message,
    details: details.length > 0 ? details : undefined,
  };
}

function statusLabel(status: string): string {
  if (status === 'passed') return '通过';
  if (status === 'failed' || status === 'unhealthy') return '失败';
  if (status === 'degraded') return '降级';
  if (status === 'not_found') return '未找到';
  return status;
}

function isPassedStatus(status: string): boolean {
  return status === 'passed';
}

export type EditorActionFeedback = {
  tone: 'success' | 'error' | 'info';
  message: string;
};

export function EditorActionFeedbackPanel({ feedback }: { feedback?: EditorActionFeedback | null }): JSX.Element | null {
  if (!feedback?.message) return null;

  const tone =
    feedback.tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : feedback.tone === 'error'
        ? 'border-red-200 bg-red-50 text-red-900'
        : 'border-blue-200 bg-blue-50 text-primary';

  const Icon = feedback.tone === 'success' ? CheckCircle2 : feedback.tone === 'error' ? XCircle : Activity;

  return (
    <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${tone}`} role="status" aria-live="polite">
      <div className="flex items-start gap-2">
        <Icon className="shrink-0" size={18} />
        <p className="leading-6">{feedback.message}</p>
      </div>
    </div>
  );
}

export function ConnectionTestResultPanel({
  loading,
  result,
}: {
  loading?: boolean;
  result?: ConnectionTestSnapshot | null;
}): JSX.Element | null {
  if (loading) {
    return (
      <div
        className="mb-4 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-primary"
        role="status"
        aria-live="polite"
      >
        <Activity className="shrink-0 animate-pulse" size={16} />
        正在测试连接…
      </div>
    );
  }

  if (!result?.status) return null;

  const passed = isPassedStatus(result.status);
  const tone = passed
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : 'border-red-200 bg-red-50 text-red-900';

  return (
    <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${tone}`} role="status" aria-live="polite">
      <div className="flex items-start gap-2 font-semibold">
        {passed ? <CheckCircle2 className="shrink-0 text-emerald-600" size={18} /> : <XCircle className="shrink-0 text-red-600" size={18} />}
        <span>连接测试{statusLabel(result.status)}</span>
      </div>
      {result.message && (
        <p className={`mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-5 ${passed ? 'text-emerald-800' : 'text-red-800'}`}>
          {result.message}
        </p>
      )}
      {result.details && result.details.length > 0 && (
        <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
          {result.details.map((item) => (
            <div key={item.label} className="flex gap-2">
              <dt className="text-slate-500">{item.label}</dt>
              <dd className="font-mono text-slate-800">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {result.testedAt && (
        <p className="mt-2 text-xs text-slate-500">测试时间：{formatDateTimeZh(result.testedAt)}</p>
      )}
    </div>
  );
}

export function chatdocTestToSnapshot(config: {
  last_test_status?: string | null;
  last_test_message?: string | null;
  last_tested_at?: string | null;
}): ConnectionTestSnapshot | null {
  if (!config.last_test_status) return null;
  return {
    status: config.last_test_status,
    message: config.last_test_message,
    testedAt: config.last_tested_at,
  };
}
