import {
  BookOpen,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  Copy,
  Heart,
  PencilLine,
  RotateCcw,
  Send,
  Trash2,
} from 'lucide-react';
import { formatBeijingMonthDayTime } from '../../utils/formatDateTime';
import type { ResourceInteraction } from '../../utils/resource-hall-interactions';
import type { Resource, ResourceVersion } from '../../types';
import { RecommendationEvidencePanel } from './RecommendationEvidencePanel';
import { FlowStep } from './ResourceHallWidgets';

export type ResourceHallPreviewSidebarProps = {
  previewVersion: number | null;
  previewResource: Resource | null;
  detailResource: Resource | null | undefined;
  copyPending: boolean;
  submitPending: boolean;
  deletePending: boolean;
  restorePending: boolean;
  versions: ResourceVersion[];
  previewInteraction: ResourceInteraction | null;
  canDeletePreviewResource: boolean;
  previewDeleteResource: Pick<Resource, 'id' | 'title'> | null;
  onStartEdit: () => void;
  onCopyResource: () => void;
  onSubmitResource: () => void;
  onDeletePreviewResource: () => void;
  onPreviewVersionChange: (version: number) => void;
  onRestoreVersion: (version: number) => void;
};

/** 渲染资源预览右侧栏，集中操作、推荐解释、学习状态、版本和引用依据。 */
export function ResourceHallPreviewSidebar({
  previewVersion,
  previewResource,
  detailResource,
  copyPending,
  submitPending,
  deletePending,
  restorePending,
  versions,
  previewInteraction,
  canDeletePreviewResource,
  previewDeleteResource,
  onStartEdit,
  onCopyResource,
  onSubmitResource,
  onDeletePreviewResource,
  onPreviewVersionChange,
  onRestoreVersion,
}: ResourceHallPreviewSidebarProps): JSX.Element {
  return (
    <aside className="min-h-0 overflow-auto border-t border-slate-200 bg-slate-50 p-5 xl:border-l xl:border-t-0">
      <section className="border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-black text-slate-950">资源操作</h3>
        <div className="mt-4 grid gap-2">
          <button className="btn-primary w-full gap-2" onClick={onStartEdit}>
            <PencilLine size={16} />
            编辑并新建版本
          </button>
          <button className="btn-secondary w-full gap-2" disabled={copyPending} onClick={onCopyResource}>
            <Copy size={16} />
            复制到个人资源
          </button>
          <button className="btn-secondary w-full gap-2" disabled={submitPending} onClick={onSubmitResource}>
            <Send size={16} />
            提交资源大厅审核
          </button>
          {canDeletePreviewResource && previewDeleteResource ? (
            <button
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-sm font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={deletePending}
              onClick={onDeletePreviewResource}
            >
              <Trash2 size={16} />
              删除资源
            </button>
          ) : null}
        </div>
      </section>

      <RecommendationEvidencePanel resource={previewResource} />

      <section className="mt-4 border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-black text-slate-950">学习状态</h3>
        <div className="mt-5 pl-2">
          <FlowStep label="打开详情" description="已进入资源详情，可阅读正文与引用依据。" done Icon={BookOpen} />
          <FlowStep label="参与互动" description="点赞、收藏、评论或分享只记录在本地互动轨迹。" done={Boolean(previewInteraction?.lastAction)} Icon={Heart} />
          <FlowStep label="加入清单" description="把资源放入个人待学列表，稍后继续研读。" done={Boolean(previewInteraction?.planned)} Icon={CalendarPlus} />
          <FlowStep label="完成研读" description="标记完成后保留在学习清单中，作为已学资源。" done={Boolean(previewInteraction?.completed)} Icon={CheckCircle2} />
        </div>
      </section>

      <section className="mt-4 border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-black text-slate-950">版本记录</h3>
        <div className="mt-3 grid gap-2 text-sm">
          {versions.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`flex items-center justify-between gap-3 rounded-md border p-3 text-left ${
                previewVersion === item.version ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
              onClick={() => onPreviewVersionChange(item.version)}
            >
              <span>
                <strong className="block text-slate-950">v{item.version}</strong>
                <span className="mt-1 block text-xs text-slate-500">{formatBeijingMonthDayTime(item.created_at ?? undefined, '未知时间')}</span>
              </span>
              <Clock3 size={15} className="text-slate-400" />
            </button>
          ))}
          {previewVersion != null && previewVersion !== (detailResource?.latest_version ?? null) && (
            <button className="btn-primary w-full gap-2" disabled={restorePending} onClick={() => onRestoreVersion(previewVersion)}>
              <RotateCcw size={16} />
              回滚为 v{previewVersion}
            </button>
          )}
          {versions.length === 0 && <p className="text-sm text-slate-500">暂无版本记录</p>}
        </div>
      </section>

      <section className="mt-4 border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-black text-slate-950">引用依据</h3>
        <div className="mt-3 grid gap-2 text-xs text-slate-600">
          {(detailResource?.citations ?? []).slice(0, 5).map((citation, index) => (
            <div key={`${citation.source_title ?? citation.sourceTitle ?? 'source'}-${index}`} className="rounded-md bg-slate-50 p-3 leading-5">
              <strong className="mb-1 block text-slate-800">{citation.source_title ?? citation.sourceTitle ?? '课程资料'}</strong>
              {citation.snippet}
            </div>
          ))}
          {(detailResource?.citations ?? []).length === 0 && <p>无引用</p>}
        </div>
      </section>
    </aside>
  );
}
