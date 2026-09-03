import { X } from 'lucide-react';
import type { KnowledgeViewScope } from '../../data/knowledgeViewScope';
import { knowledgeScopeMetricsLabel } from '../../data/knowledgeViewScope';

export type KnowledgeViewScopeBarProps = {
  scope: KnowledgeViewScope;
  onScopeChange: (scope: KnowledgeViewScope) => void;
  courseId?: string;
  courseTitle?: string;
  courseScopeDisabled?: boolean;
  documentFocusId?: string | null;
  documentFocusName?: string | null;
  onClearDocumentFocus?: () => void;
  totalDocuments: number;
  /** 嵌入知识大本营顶栏卡片，不再单独占一行大卡片 */
  variant?: 'standalone' | 'embedded';
  /** 范围切换已并入课程 Popover 时隐藏右侧切换按钮 */
  hideScopeToggle?: boolean;
};

export function KnowledgeViewScopeBar({
  scope,
  onScopeChange,
  courseId,
  courseTitle,
  courseScopeDisabled = false,
  documentFocusId,
  documentFocusName,
  onClearDocumentFocus,
  totalDocuments,
  variant = 'standalone',
  hideScopeToggle = false,
}: KnowledgeViewScopeBarProps): JSX.Element {
  const scopeContext = {
    scope,
    courseId,
    courseTitle,
    documentId: documentFocusId ?? undefined,
    documentName: documentFocusName ?? undefined,
  };

  const embedded = variant === 'embedded';
  const coursePickHint = courseScopeDisabled
    ? (hideScopeToggle ? '请在标题旁课程菜单中选择单门课程' : '请先在标题旁选择课程，或切换到「全部课程」')
    : undefined;

  return (
    <section
      className={
        embedded
          ? 'border-t border-slate-100 px-4 py-3'
          : 'mt-5 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">查看范围</div>
          <div className="mt-1 text-sm font-semibold text-slate-950">
            {knowledgeScopeMetricsLabel(scopeContext, totalDocuments)}
          </div>
        </div>
        {!hideScopeToggle && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                className={`h-8 rounded-md px-3 text-sm font-medium transition ${
                  scope === 'all' ? 'bg-white text-primary shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
                onClick={() => onScopeChange('all')}
              >
                全部课程
              </button>
              <button
                type="button"
                className={`h-8 rounded-md px-3 text-sm font-medium transition ${
                  scope === 'course' ? 'bg-white text-primary shadow-sm' : 'text-slate-600 hover:text-slate-900'
                } ${courseScopeDisabled ? 'opacity-50' : ''}`}
                disabled={courseScopeDisabled}
                title={coursePickHint ?? courseTitle ?? courseId ?? '当前课程'}
                onClick={() => onScopeChange('course')}
              >
                当前课程
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span className="font-medium text-slate-600">{embedded ? '运维课程' : '顶栏课程'}</span>
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
          {courseId ? (courseTitle ?? courseId) : '未选择'}
        </span>
        <span className="text-slate-300">·</span>
        <span>
          {scope === 'all'
            ? '汇总所有课程的入库与流水线状态'
            : courseId
              ? '仅展示该课程文档；上传与检索调试绑定此课程'
              : (coursePickHint ?? '请先在顶栏选择课程，或切换到全部课程')}
        </span>
      </div>

      {documentFocusId && documentFocusName && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <span className="text-xs font-medium text-slate-600">文档聚焦</span>
          <span className="inline-flex max-w-full items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-800">
            <span className="truncate">{documentFocusName}</span>
            {onClearDocumentFocus && (
              <button type="button" className="rounded p-0.5 text-violet-600 hover:bg-violet-100" onClick={onClearDocumentFocus} title="返回课程视图">
                <X size={12} />
              </button>
            )}
          </span>
          <span className="text-xs text-slate-500">下方流水线按该文档单独统计</span>
        </div>
      )}
    </section>
  );
}
