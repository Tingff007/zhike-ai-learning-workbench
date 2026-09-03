import {
  Bookmark,
  CalendarPlus,
  CheckCircle2,
  Copy,
  Eye,
  Heart,
  MessageSquareText,
  Save,
  Send,
  Share2,
} from 'lucide-react';
import { MarkdownRenderer } from '../../components/shared/MarkdownRenderer';
import { LoadingState } from '../../components/shared/StateBlock';
import { formatBeijingMonthDayTime } from '../../utils/formatDateTime';
import type { ResourceInteraction } from '../../utils/resource-hall-interactions';
import type { Resource } from '../../types';
import { HallImageAssetGallery } from './HallImageAssetGallery';
import { DetailEngagementItem } from './ResourceHallWidgets';
import { formatCompactCount } from './resourceHallConfig';

export type ResourceHallPreviewContentProps = {
  previewResource: Resource | null;
  detailResource: Resource | null | undefined;
  detailContent: string;
  isDetailLoading: boolean;
  isEditing: boolean;
  draftContent: string;
  updatePending: boolean;
  previewInteraction: ResourceInteraction | null;
  previewComments: ResourceInteraction['comments'];
  commentDraft: string;
  onDraftContentChange: (content: string) => void;
  onSaveDraft: () => void;
  onCancelEdit: () => void;
  onToggleLike: () => void;
  onToggleSave: () => void;
  onTogglePlan: () => void;
  onToggleCompleted: () => void;
  onShare: () => void;
  onCommentDraftChange: (value: string) => void;
  onSubmitComment: () => void;
};

/** 渲染资源预览主阅读区，集中正文、编辑器和本地互动评论。 */
export function ResourceHallPreviewContent({
  previewResource,
  detailResource,
  detailContent,
  isDetailLoading,
  isEditing,
  draftContent,
  updatePending,
  previewInteraction,
  previewComments,
  commentDraft,
  onDraftContentChange,
  onSaveDraft,
  onCancelEdit,
  onToggleLike,
  onToggleSave,
  onTogglePlan,
  onToggleCompleted,
  onShare,
  onCommentDraftChange,
  onSubmitComment,
}: ResourceHallPreviewContentProps): JSX.Element {
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-slate-100/70 px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-5xl">
        {isDetailLoading && <LoadingState />}
        {detailResource?.resource_type === 'diagram_pack' && <HallImageAssetGallery resource={detailResource} />}
        {!isEditing && (
          <>
            <div className="prose max-w-none border border-slate-200 bg-white px-6 py-5 prose-slate">
              <MarkdownRenderer content={detailContent || '暂无内容'} className="ai-markdown-preview" />
            </div>

            <section className="border-x border-b border-slate-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <DetailEngagementItem
                    active={Boolean(previewInteraction?.liked)}
                    label="本地点赞"
                    value={formatCompactCount(previewInteraction?.likeCount)}
                    Icon={Heart}
                    onClick={onToggleLike}
                  />
                  <DetailEngagementItem
                    label="本地评论"
                    value={formatCompactCount(previewComments.length)}
                    Icon={MessageSquareText}
                  />
                  <DetailEngagementItem
                    label="浏览"
                    value={formatCompactCount(previewResource?.view_count)}
                    Icon={Eye}
                  />
                  <DetailEngagementItem
                    active={Boolean(previewInteraction?.saved)}
                    label="本地收藏"
                    value={formatCompactCount(previewInteraction?.saveCount)}
                    Icon={Bookmark}
                    onClick={onToggleSave}
                  />
                  <DetailEngagementItem
                    label="复用"
                    value={formatCompactCount(previewResource?.copied_count)}
                    Icon={Copy}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <DetailEngagementItem
                    active={Boolean(previewInteraction?.planned)}
                    label={previewInteraction?.planned ? '已加入清单' : '加入清单'}
                    Icon={CalendarPlus}
                    onClick={onTogglePlan}
                  />
                  <DetailEngagementItem
                    active={Boolean(previewInteraction?.completed)}
                    label={previewInteraction?.completed ? '已完成' : '完成研读'}
                    Icon={CheckCircle2}
                    onClick={onToggleCompleted}
                  />
                  <DetailEngagementItem
                    label="分享"
                    Icon={Share2}
                    onClick={onShare}
                  />
                </div>
              </div>
            </section>

            <section className="mt-4 border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-slate-950">评论与补充</h3>
                  <p className="mt-1 text-xs font-medium text-slate-500">读完资源后再记录反馈；这里是本地互动，不作为后端资源统计。</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">
                  <MessageSquareText size={13} />
                  {previewComments.length}
                </span>
              </div>
              <div className="mt-4 grid gap-3">
                <textarea
                  className="input min-h-24 w-full resize-y text-sm leading-6"
                  value={commentDraft}
                  placeholder="写下你的理解、补充资料或使用反馈"
                  onChange={(event) => onCommentDraftChange(event.target.value)}
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="btn-primary gap-2"
                    disabled={!commentDraft.trim()}
                    onClick={onSubmitComment}
                  >
                    <Send size={16} />
                    发布评论
                  </button>
                </div>
                <div className="grid gap-2">
                  {previewComments.map((comment) => (
                    <div key={comment.id} className="border-l-4 border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <strong className="text-xs font-black text-slate-900">{comment.author}</strong>
                        <span className="text-[11px] font-medium text-slate-400">{formatBeijingMonthDayTime(comment.createdAt, '刚刚')}</span>
                      </div>
                      <p className="mt-1 text-sm font-medium leading-6 text-slate-600">{comment.body}</p>
                    </div>
                  ))}
                  {previewComments.length === 0 && (
                    <p className="text-sm font-medium leading-6 text-slate-500">还没有本地评论。发布后只会进入你的互动记录。</p>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
        {isEditing && (
          <div className="border border-slate-200 bg-white p-4">
            <textarea
              className="input h-[60vh] w-full font-mono text-sm leading-6"
              value={draftContent}
              onChange={(event) => onDraftContentChange(event.target.value)}
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <button className="btn-primary gap-2" disabled={updatePending} onClick={onSaveDraft}>
                <Save size={16} />
                保存为新版本
              </button>
              <button className="btn-secondary" onClick={onCancelEdit}>取消</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
