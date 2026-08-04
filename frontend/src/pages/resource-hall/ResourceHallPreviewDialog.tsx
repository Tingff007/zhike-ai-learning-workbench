import {
  X,
} from 'lucide-react';
import type { ResourceInteraction } from '../../utils/resource-hall-interactions';
import type { Resource, ResourceVersion } from '../../types';
import { ResourceHallPreviewContent } from './ResourceHallPreviewContent';
import { ResourceHallPreviewSidebar } from './ResourceHallPreviewSidebar';

export type ResourceHallPreviewDialogProps = {
  previewVersion: number | null;
  previewResource: Resource | null;
  detailResource: Resource | null | undefined;
  detailContent: string;
  isDetailLoading: boolean;
  isEditing: boolean;
  draftContent: string;
  updatePending: boolean;
  copyPending: boolean;
  submitPending: boolean;
  deletePending: boolean;
  restorePending: boolean;
  versions: ResourceVersion[];
  previewInteraction: ResourceInteraction | null;
  previewComments: ResourceInteraction['comments'];
  commentDraft: string;
  canDeletePreviewResource: boolean;
  previewDeleteResource: Pick<Resource, 'id' | 'title'> | null;
  onClose: () => void;
  onStartEdit: () => void;
  onDraftContentChange: (content: string) => void;
  onSaveDraft: () => void;
  onCancelEdit: () => void;
  onCopyResource: () => void;
  onSubmitResource: () => void;
  onDeletePreviewResource: () => void;
  onPreviewVersionChange: (version: number) => void;
  onRestoreVersion: (version: number) => void;
  onToggleLike: () => void;
  onToggleSave: () => void;
  onTogglePlan: () => void;
  onToggleCompleted: () => void;
  onShare: () => void;
  onCommentDraftChange: (value: string) => void;
  onSubmitComment: () => void;
};

/** 资源详情预览弹窗：承接阅读、互动、编辑、版本和引用展示。 */
export function ResourceHallPreviewDialog({
  previewVersion,
  previewResource,
  detailResource,
  detailContent,
  isDetailLoading,
  isEditing,
  draftContent,
  updatePending,
  copyPending,
  submitPending,
  deletePending,
  restorePending,
  versions,
  previewInteraction,
  previewComments,
  commentDraft,
  canDeletePreviewResource,
  previewDeleteResource,
  onClose,
  onStartEdit,
  onDraftContentChange,
  onSaveDraft,
  onCancelEdit,
  onCopyResource,
  onSubmitResource,
  onDeletePreviewResource,
  onPreviewVersionChange,
  onRestoreVersion,
  onToggleLike,
  onToggleSave,
  onTogglePlan,
  onToggleCompleted,
  onShare,
  onCommentDraftChange,
  onSubmitComment,
}: ResourceHallPreviewDialogProps): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6">
      <div className="mx-auto grid h-full max-w-[1440px] overflow-hidden rounded-xl bg-white shadow-2xl xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-h-0 flex-col">
          <header className="shrink-0 border-b border-slate-200 bg-white px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">{previewResource?.type ?? previewResource?.resource_type ?? '资源'}</span>
                  <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-black text-blue-700">v{previewResource?.latest_version ?? 1}</span>
                  {previewResource?.owner_scope === 'community' ? <span className="rounded-md bg-rose-50 px-2 py-1 text-xs font-black text-rose-700">社区共享</span> : null}
                  {previewVersion ? <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-black text-amber-700">正在查看 v{previewVersion}</span> : null}
                </div>
                <h2 className="mt-2 truncate text-2xl font-black text-slate-950">{previewResource?.title ?? '资源预览'}</h2>
                <p className="mt-1 line-clamp-2 text-sm font-medium leading-6 text-slate-500">{previewResource?.summary ?? '暂无摘要'}</p>
              </div>
              <button
                type="button"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                title="关闭"
                onClick={onClose}
              >
                <X size={17} />
              </button>
            </div>
          </header>
          <ResourceHallPreviewContent
            previewResource={previewResource}
            detailResource={detailResource}
            detailContent={detailContent}
            isDetailLoading={isDetailLoading}
            isEditing={isEditing}
            draftContent={draftContent}
            updatePending={updatePending}
            previewInteraction={previewInteraction}
            previewComments={previewComments}
            commentDraft={commentDraft}
            onDraftContentChange={onDraftContentChange}
            onSaveDraft={onSaveDraft}
            onCancelEdit={onCancelEdit}
            onToggleLike={onToggleLike}
            onToggleSave={onToggleSave}
            onTogglePlan={onTogglePlan}
            onToggleCompleted={onToggleCompleted}
            onShare={onShare}
            onCommentDraftChange={onCommentDraftChange}
            onSubmitComment={onSubmitComment}
          />
        </div>

        <ResourceHallPreviewSidebar
          previewVersion={previewVersion}
          previewResource={previewResource}
          detailResource={detailResource}
          copyPending={copyPending}
          submitPending={submitPending}
          deletePending={deletePending}
          restorePending={restorePending}
          versions={versions}
          previewInteraction={previewInteraction}
          canDeletePreviewResource={canDeletePreviewResource}
          previewDeleteResource={previewDeleteResource}
          onStartEdit={onStartEdit}
          onCopyResource={onCopyResource}
          onSubmitResource={onSubmitResource}
          onDeletePreviewResource={onDeletePreviewResource}
          onPreviewVersionChange={onPreviewVersionChange}
          onRestoreVersion={onRestoreVersion}
        />
      </div>
    </div>
  );
}
