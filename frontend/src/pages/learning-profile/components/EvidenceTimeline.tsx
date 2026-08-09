import React from 'react'
import { buildReadableEvidence, type ReadableEvidence } from '../profileTokens'

export type EvidenceTimelineProps = {
  /** 证据链源数据，支持字符串或结构化对象 */
  evidence: Array<Record<string, unknown> | string>
  /** 标题文字 */
  title?: string
  /** 控制最大高度，超出时显示滚动 */
  maxHeight?: string
}

function EvidenceItemCard({ evidence }: { evidence: ReadableEvidence }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {evidence.title && <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{evidence.title}</p>}
      <p className="mt-2 text-sm font-medium text-slate-900">{evidence.summary}</p>
      {evidence.facts.length > 0 && (
        <dl className="mt-3 space-y-2 text-sm text-slate-600">
          {evidence.facts.map((fact, factIndex) => (
            <div key={factIndex} className="flex gap-2">
              <dt className="min-w-[68px] text-slate-500">{fact.label}：</dt>
              <dd className="flex-1 break-words">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {(evidence.meta.length > 0 || evidence.createdAt) && (
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400">
          {evidence.meta.map((item, index) => (
            <span key={index} className="rounded-full border border-slate-200 px-2 py-1 bg-slate-50">
              {item}
            </span>
          ))}
          {evidence.createdAt && <span className="rounded-full border border-slate-200 px-2 py-1 bg-slate-50">记录于 {evidence.createdAt}</span>}
        </div>
      )}
    </div>
  )
}

export function EvidenceTimeline({ evidence, title = '证据链', maxHeight = '420px' }: EvidenceTimelineProps): JSX.Element {
  const items = evidence.filter(Boolean)
  return (
    <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">按时间顺序展示画像来源证据，帮助你追溯学习结论。</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{items.length} 条</span>
      </div>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          当前暂无可追溯的证据。
        </div>
      ) : (
        <div className="space-y-6 overflow-y-auto pr-2" style={{ maxHeight }}>
          {items.map((item, index) => {
            const evidenceItem = buildReadableEvidence(item, index)
            return (
              <div key={index} className="relative pl-8">
                <div className="absolute left-0 top-2 h-full w-0.5 bg-slate-200" />
                <div className="absolute left-0 top-2 h-2 w-2 rounded-full bg-slate-500" />
                <div className="ml-4">
                  <EvidenceItemCard evidence={evidenceItem} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
