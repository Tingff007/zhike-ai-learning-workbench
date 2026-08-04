import type { ModelTraceDetail } from '../../../types';
import { formatBeijingTime } from '../../../utils/formatDateTime';
import { gatewayStatusLabel } from '../GatewayStatusPill';

export type TraceTimelineEvent =
  | { kind: 'model'; at: string; data: ModelTraceDetail['model_calls'][number] }
  | { kind: 'rag'; at: string; data: ModelTraceDetail['rag_queries'][number] }
  | { kind: 'audit'; at: string; data: ModelTraceDetail['admin_audits'][number] };

export type TraceOverview = {
  finalStatus: string;
  finalStatusLabel: string;
  totalLatency: number;
  totalCost: number;
  modelCount: number;
  ragCount: number;
  auditCount: number;
};

export function buildTraceOverview(trace: ModelTraceDetail): TraceOverview {
  const { model_calls: models, rag_queries: rags, admin_audits: audits } = trace;
  const totalLatency = [...models, ...rags].reduce((sum, row) => sum + (row.latency_ms ?? 0), 0);
  const totalCost = models.reduce((sum, row) => sum + (row.estimated_cost ?? 0), 0);

  let finalStatus = 'unknown';
  if (models.some((row) => row.status === 'failed')) finalStatus = 'failed';
  else if (models.some((row) => row.status === 'fallback')) finalStatus = 'fallback';
  else if (models.some((row) => row.status === 'degraded')) finalStatus = 'degraded';
  else if (models.length > 0 && models.every((row) => row.status === 'success')) finalStatus = 'success';
  else if (models.length > 0) finalStatus = models[models.length - 1].status;

  return {
    finalStatus,
    finalStatusLabel: gatewayStatusLabel(finalStatus),
    totalLatency,
    totalCost,
    modelCount: models.length,
    ragCount: rags.length,
    auditCount: audits.length,
  };
}

export function buildTraceTimeline(trace: ModelTraceDetail): TraceTimelineEvent[] {
  const events: TraceTimelineEvent[] = [
    ...trace.model_calls.map((data) => ({
      kind: 'model' as const,
      at: data.created_at ?? '',
      data,
    })),
    ...trace.rag_queries.map((data) => ({
      kind: 'rag' as const,
      at: data.created_at ?? '',
      data,
    })),
    ...trace.admin_audits.map((data) => ({
      kind: 'audit' as const,
      at: data.created_at ?? '',
      data,
    })),
  ];
  return events.sort((a, b) => a.at.localeCompare(b.at));
}

export const formatTraceTime = formatBeijingTime;
