import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Globe, Layers, LayoutGrid, Loader2, Plus, Trash2 } from 'lucide-react';
import type { KnowledgeViewScope } from '../../data/knowledgeViewScope';
import { api, type CourseCreatePayload, type CourseUpdatePayload } from '../../api/endpoints';
import { useAdminCourseAccess } from '../../hooks/useAdminCourseAccess';
import { useCourseContextStore } from '../../stores/course-context.store';
import type { Course } from '../../types';
import { ConfirmDialog } from '../shared/ConfirmDialog';

function getReadableCourseTitle(course: Course) {
  return course.title?.trim() || course.id || '未命名课程';
}

type KnowledgeCourseManagementProps = {
  onOpenRecycle?: () => void;
  viewScope: KnowledgeViewScope;
  onViewScopeChange: (scope: KnowledgeViewScope) => void;
};

export function KnowledgeCourseManagement({
  onOpenRecycle,
  viewScope,
  onViewScopeChange,
}: KnowledgeCourseManagementProps): JSX.Element | null {
  const { canManageCourses } = useAdminCourseAccess();
  const queryClient = useQueryClient();
  const { currentCourseId, currentCourseTitle, setCurrentCourse } = useCourseContextStore();
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [form, setForm] = useState({ title: '', description: '', status: 'draft' as 'draft' | 'published' });

  const coursesQuery = useQuery({
    queryKey: ['courses', 'admin'],
    queryFn: api.adminCourses,
    enabled: canManageCourses,
    retry: 1,
    staleTime: 60_000,
  });

  const coursesFallbackQuery = useQuery({
    queryKey: ['courses', 'public-fallback'],
    queryFn: api.courses,
    enabled: canManageCourses && coursesQuery.isError,
    retry: 1,
  });

  const activeCourses = coursesQuery.data?.items?.length
    ? coursesQuery.data.items
    : coursesFallbackQuery.data?.items ?? [];

  const listLoading = coursesQuery.isPending && !coursesQuery.isError && !coursesQuery.data;
  const listLoadFailed = coursesQuery.isError && coursesFallbackQuery.isError;

  const displayTriggerLabel = useMemo(() => {
    if (viewScope === 'all') return '全部课程';
    if (listLoading) return '加载中…';
    if (!currentCourseId) return '未选择';
    const matched = activeCourses.find((course) => course.id === currentCourseId);
    if (matched) return getReadableCourseTitle(matched);
    return currentCourseTitle.trim() || '未命名课程';
  }, [activeCourses, currentCourseId, currentCourseTitle, listLoading, viewScope]);

  const invalidateCourses = () => {
    queryClient.invalidateQueries({ queryKey: ['courses'] });
    queryClient.invalidateQueries({ queryKey: ['courses', 'deleted'] });
    queryClient.invalidateQueries({ queryKey: ['course-builder'] });
    queryClient.invalidateQueries({ queryKey: ['knowledge-documents'] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: CourseCreatePayload) => api.createCourse(payload),
    onSuccess: ({ course }) => {
      setNotice(`已创建「${course.title}」`);
      setCreateOpen(false);
      setForm({ title: '', description: '', status: 'draft' });
      onViewScopeChange('course');
      setCurrentCourse(course.id, getReadableCourseTitle(course));
      api.updateCurrentCourse(course.id).catch(() => undefined);
      setIsOpen(true);
      invalidateCourses();
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : '创建失败'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ courseId, payload }: { courseId: string; payload: CourseUpdatePayload }) =>
      api.updateCourse(courseId, payload),
    onSuccess: () => invalidateCourses(),
    onError: (error) => setNotice(error instanceof Error ? error.message : '更新失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: (courseId: string) => api.deleteCourse(courseId),
    onSuccess: (_, courseId) => {
      setNotice('已移入回收站');
      setDeleteTarget(null);
      if (currentCourseId === courseId) {
        const remaining = activeCourses.filter((course) => course.id !== courseId);
        const next = remaining[0];
        if (next) {
          setCurrentCourse(next.id, getReadableCourseTitle(next));
          api.updateCurrentCourse(next.id).catch(() => undefined);
        } else {
          setCurrentCourse('', '');
        }
      }
      invalidateCourses();
      onOpenRecycle?.();
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : '删除失败'),
  });

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  if (!canManageCourses) return null;

  function handleSelectAllCourses() {
    onViewScopeChange('all');
    setIsOpen(false);
  }

  function handleSelectCourse(course: Course) {
    onViewScopeChange('course');
    setCurrentCourse(course.id, getReadableCourseTitle(course));
    api.updateCurrentCourse(course.id).catch(() => undefined);
    setIsOpen(false);
  }

  function handleCreate() {
    const title = form.title.trim();
    if (!title) {
      setNotice('请填写课程名称');
      return;
    }
    createMutation.mutate({ title, description: form.description.trim(), status: form.status });
  }

  function handleDelete(course: Course) {
    deleteMutation.mutate(course.id);
  }

  function handlePublish(course: Course) {
    updateMutation.mutate(
      { courseId: course.id, payload: { status: 'published' } },
      { onSuccess: () => setNotice(`「${getReadableCourseTitle(course)}」已发布`) },
    );
  }

  return (
    <div id="course-management" className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <LayoutGrid size={15} />
        {displayTriggerLabel}
        <ChevronDown size={15} className={`transition ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-30 w-[min(420px,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-2">
            <strong className="text-sm text-slate-900">课程管理</strong>
            <button type="button" className="btn-secondary h-8 gap-1 px-2 text-xs" onClick={() => setCreateOpen(true)}>
              <Plus size={14} /> 新建
            </button>
          </div>

          <button type="button" className="mb-2 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-slate-50" onClick={handleSelectAllCourses}>
            <Globe size={15} className="text-primary" />
            全部课程视图
            {viewScope === 'all' && <Check size={15} className="ml-auto text-primary" />}
          </button>

          {listLoading && (
            <div className="flex items-center gap-2 px-2 py-3 text-sm text-slate-500">
              <Loader2 size={15} className="animate-spin" /> 加载课程列表…
            </div>
          )}

          {listLoadFailed && (
            <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
              课程列表加载失败，请确认后端已启动。
            </div>
          )}

          {!listLoading && !listLoadFailed && activeCourses.length === 0 && (
            <div className="px-2 py-3 text-sm text-slate-500">暂无课程</div>
          )}

          <div className="max-h-72 space-y-1 overflow-y-auto">
            {activeCourses.map((course) => (
              <div key={course.id} className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-slate-50">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm" onClick={() => handleSelectCourse(course)}>
                  <Layers size={15} className="shrink-0 text-slate-400" />
                  <span className="truncate font-medium text-slate-800">{getReadableCourseTitle(course)}</span>
                  {currentCourseId === course.id && viewScope === 'course' && <Check size={14} className="ml-auto shrink-0 text-primary" />}
                </button>
                {course.status !== 'published' && (
                  <button type="button" className="btn-secondary h-7 px-2 text-xs" onClick={() => handlePublish(course)}>发布</button>
                )}
                <button type="button" className="btn-secondary h-7 px-2 text-xs text-red-600" onClick={() => setDeleteTarget(course)}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          {coursesQuery.isError && !listLoadFailed && (
            <p className="mt-2 text-xs text-amber-600">管理员课程接口不可用，已尝试公共课程列表。</p>
          )}

          {notice && <p className="mt-2 text-xs text-slate-600">{notice}</p>}
        </div>
      )}

      {createOpen && (
        <ConfirmDialog
          open
          title="新建课程"
          description={(
            <div className="space-y-3">
              <p className="text-sm text-slate-600">创建后将切换到该课程视图。</p>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">课程名称</span>
                <input className="input w-full" value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">描述</span>
                <textarea className="input w-full min-h-20" value={form.description} onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))} />
              </label>
            </div>
          )}
          confirmLabel={createMutation.isPending ? '创建中…' : '创建'}
          loading={createMutation.isPending}
          onConfirm={handleCreate}
          onCancel={() => setCreateOpen(false)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          open
          title="移入回收站"
          description={`确定将「${getReadableCourseTitle(deleteTarget)}」移入回收站吗？`}
          confirmLabel={deleteMutation.isPending ? '处理中…' : '移入回收站'}
          tone="danger"
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
