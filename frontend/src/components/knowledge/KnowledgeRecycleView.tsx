import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, FileText, Loader2, RotateCcw, Skull } from 'lucide-react';
import { api } from '../../api/endpoints';
import { useCourseContextStore } from '../../stores/course-context.store';
import type { Course } from '../../types';
import { formatDateTimeZh } from '../../utils/formatDateTime';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState } from '../shared/StateBlock';

type ItemKind = 'course' | 'document';

type SelectedItem = {
  kind: ItemKind;
  id: string;
  name: string;
};

type PurgeTarget =
  | { mode: 'single'; kind: ItemKind; id: string; name: string }
  | { mode: 'batch'; items: SelectedItem[] };

type KnowledgeRecycleViewProps = {
  onBack?: () => void;
};

function formatDeletedAt(value?: string | null) {
  if (!value) return '';
  return formatDateTimeZh(value) || value;
}

function getReadableCourseTitle(course: Course) {
  return course.title?.trim() || course.id || '未命名课程';
}

function itemKey(item: SelectedItem) {
  return `${item.kind}:${item.id}`;
}

export function KnowledgeRecycleView({ onBack }: KnowledgeRecycleViewProps): JSX.Element {
  const queryClient = useQueryClient();
  const { currentCourseId, setCurrentCourse } = useCourseContextStore();
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [purgeTarget, setPurgeTarget] = useState<PurgeTarget | null>(null);
  const [actionError, setActionError] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);

  const recycledDocs = useQuery({
    queryKey: ['knowledge-recycled', 'all'],
    queryFn: () => api.listRecycledKnowledgeDocuments(null),
    retry: 1,
    staleTime: 15_000,
  });

  const deletedCoursesQuery = useQuery({
    queryKey: ['courses', 'deleted'],
    queryFn: api.deletedCourses,
    retry: 1,
    staleTime: 15_000,
  });

  const deletedCourses = deletedCoursesQuery.data?.items ?? [];
  const recycledDocuments = recycledDocs.data?.items ?? [];

  const allItems = useMemo<SelectedItem[]>(() => [
    ...deletedCourses.map((course) => ({
      kind: 'course' as const,
      id: course.id,
      name: getReadableCourseTitle(course),
    })),
    ...recycledDocuments.map((doc) => ({
      kind: 'document' as const,
      id: doc.id,
      name: doc.title || doc.filename,
    })),
  ], [deletedCourses, recycledDocuments]);

  const selectedItems = useMemo(
    () => allItems.filter((item) => selectedKeys.includes(itemKey(item))),
    [allItems, selectedKeys],
  );

  const loading = recycledDocs.isPending || deletedCoursesQuery.isPending;
  const loadError =
    recycledDocs.error instanceof Error
      ? recycledDocs.error.message
      : deletedCoursesQuery.error instanceof Error
        ? deletedCoursesQuery.error.message
        : recycledDocs.isError || deletedCoursesQuery.isError
          ? '回收站加载失败，请确认后端已启动（默认 http://localhost:8001）。'
          : null;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['knowledge-recycled'] });
    queryClient.invalidateQueries({ queryKey: ['knowledge-documents'] });
    queryClient.invalidateQueries({ queryKey: ['courses'] });
    queryClient.invalidateQueries({ queryKey: ['courses', 'deleted'] });
    queryClient.invalidateQueries({ queryKey: ['course-builder'] });
  };

  const restoreDocument = useMutation({
    mutationFn: (documentId: string) => api.restoreKnowledgeDocument(documentId),
    onSuccess: invalidateAll,
  });

  const purgeDocument = useMutation({
    mutationFn: (documentId: string) => api.purgeKnowledgeDocument(documentId, true),
    onSuccess: invalidateAll,
  });

  const restoreCourse = useMutation({
    mutationFn: (courseId: string) => api.restoreCourse(courseId),
    onSuccess: ({ course }) => {
      setCurrentCourse(course.id, getReadableCourseTitle(course));
      api.updateCurrentCourse(course.id).catch(() => undefined);
      invalidateAll();
    },
  });

  const purgeDeletedCourse = useMutation({
    mutationFn: (courseId: string) => api.purgeDeletedCourse(courseId),
    onSuccess: (_, courseId) => {
      if (currentCourseId === courseId) {
        setCurrentCourse('', '');
      }
      invalidateAll();
    },
  });

  const purgeCourse = useMutation({
    mutationFn: (courseId: string) => api.purgeCourse(courseId, true),
    onSuccess: (_, courseId) => {
      if (currentCourseId === courseId) {
        setCurrentCourse('', '');
      }
      invalidateAll();
    },
  });

  const anyPending = batchBusy
    || restoreDocument.isPending
    || purgeDocument.isPending
    || restoreCourse.isPending
    || purgeCourse.isPending
    || purgeDeletedCourse.isPending;

  function toggleItem(item: SelectedItem) {
    const key = itemKey(item);
    setSelectedKeys((current) => (
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key]
    ));
  }

  function toggleSection(items: SelectedItem[]) {
    if (items.length === 0) return;
    const keys = items.map(itemKey);
    const allSelected = keys.every((key) => selectedKeys.includes(key));
    setSelectedKeys((current) => {
      if (allSelected) return current.filter((key) => !keys.includes(key));
      return [...new Set([...current, ...keys])];
    });
  }

  function clearSelection() {
    setSelectedKeys([]);
  }

  function isSelected(item: SelectedItem) {
    return selectedKeys.includes(itemKey(item));
  }

  async function restoreOne(item: SelectedItem) {
    if (item.kind === 'course') {
      await restoreCourse.mutateAsync(item.id);
      return;
    }
    await restoreDocument.mutateAsync(item.id);
  }

  async function purgeOne(item: SelectedItem) {
    if (item.kind === 'course') {
      const inDeletedBin = deletedCourses.some((course) => course.id === item.id);
      if (inDeletedBin) {
        await purgeDeletedCourse.mutateAsync(item.id);
        return;
      }
      await purgeCourse.mutateAsync(item.id);
      return;
    }
    await purgeDocument.mutateAsync(item.id);
  }

  async function runBatchRestore(items: SelectedItem[]) {
    setBatchBusy(true);
    setActionError('');
    try {
      for (const item of items) {
        await restoreOne(item);
      }
      clearSelection();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '批量还原失败');
      invalidateAll();
    } finally {
      setBatchBusy(false);
    }
  }

  async function runBatchPurge(items: SelectedItem[]) {
    setBatchBusy(true);
    setActionError('');
    try {
      for (const item of items) {
        await purgeOne(item);
      }
      setPurgeTarget(null);
      clearSelection();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '批量彻底删除失败');
      invalidateAll();
    } finally {
      setBatchBusy(false);
    }
  }

  function handleRestoreCourse(course: Course) {
    void runBatchRestore([{ kind: 'course', id: course.id, name: getReadableCourseTitle(course) }]);
  }

  function confirmPurge() {
    if (!purgeTarget) return;
    if (purgeTarget.mode === 'batch') {
      void runBatchPurge(purgeTarget.items);
      return;
    }
    setBatchBusy(true);
    setActionError('');
    purgeOne({ kind: purgeTarget.kind, id: purgeTarget.id, name: purgeTarget.name })
      .then(() => {
        setPurgeTarget(null);
      })
      .catch((error) => {
        setActionError(error instanceof Error ? error.message : '彻底删除失败');
      })
      .finally(() => {
        setBatchBusy(false);
      });
  }

  const purgeLoading = batchBusy || purgeDocument.isPending || purgeCourse.isPending;
  const isEmpty = !loading && !loadError && allItems.length === 0;
  const allSelected = allItems.length > 0 && allItems.every((item) => isSelected(item));

  const purgeDescription = purgeTarget?.mode === 'batch'
    ? `将永久删除已选的 ${purgeTarget.items.length} 项（${purgeTarget.items.filter((item) => item.kind === 'course').length} 门课程、${purgeTarget.items.filter((item) => item.kind === 'document').length} 份文档），不可恢复。`
    : purgeTarget?.kind === 'course'
      ? `将永久删除课程「${purgeTarget.name}」及其关联数据，不可恢复。`
      : purgeTarget
        ? `将同步删除云端「${purgeTarget.name}」及本地记录，不可恢复。`
        : '';

  return (
    <>
      {onBack && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-secondary h-9 px-3 text-sm" onClick={onBack}>
            ← 返回知识大本营
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">回收站</h1>
          <p className="page-subtitle">
            已删除的课程与文档集中在此。勾选后可批量还原或彻底删除；文档软删除保留云端向量，彻底删除将调用云端 file/del。
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {allItems.length > 0 && (
            <button
              type="button"
              className="btn-secondary h-9 px-3 text-sm"
              disabled={anyPending}
              onClick={() => setSelectedKeys(allSelected ? [] : allItems.map(itemKey))}
            >
              {allSelected ? '取消全选' : '全选'}
            </button>
          )}
          {selectedItems.length > 0 && (
            <>
              <span className="rounded bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-primary">
                已选 {selectedItems.length}
              </span>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                disabled={anyPending}
                onClick={() => void runBatchRestore(selectedItems)}
              >
                {batchBusy ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                批量还原
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                disabled={anyPending}
                onClick={() => setPurgeTarget({ mode: 'batch', items: selectedItems })}
              >
                <Skull size={15} />
                批量彻底删除
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {actionError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {actionError}
          </div>
        )}
        {isEmpty && <EmptyState label="回收站暂无数据。" />}
        {loading && <LoadingState label="加载回收站…" />}
        {loadError && <ErrorState label={loadError} />}
        {!loading && !loadError && isEmpty && (
          <EmptyState label="回收站为空。删除的课程与文档会集中出现在此处，可还原或彻底删除。" />
        )}

        {(deletedCourses.length > 0 || (!loading && !loadError)) && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <header className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <BookOpen size={16} className="text-indigo-600" />
                已删除课程
                <span className="font-normal text-slate-500">({deletedCourses.length})</span>
              </div>
              {deletedCourses.length > 0 && (
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={deletedCourses.every((course) => isSelected({ kind: 'course', id: course.id, name: getReadableCourseTitle(course) }))}
                    onChange={() => toggleSection(deletedCourses.map((course) => ({
                      kind: 'course',
                      id: course.id,
                      name: getReadableCourseTitle(course),
                    })))}
                  />
                  本组全选
                </label>
              )}
            </header>
            {deletedCourses.length === 0 ? (
              <p className="text-xs text-slate-400">暂无已删除课程</p>
            ) : (
              <ul className="space-y-2">
                {deletedCourses.map((course) => {
                  const item: SelectedItem = { kind: 'course', id: course.id, name: getReadableCourseTitle(course) };
                  return (
                    <li
                      key={course.id}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-3 text-sm ${
                        isSelected(item) ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200 bg-slate-50/80'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-slate-300"
                        checked={isSelected(item)}
                        onChange={() => toggleItem(item)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-slate-900">{item.name}</div>
                        <div className="truncate text-xs text-slate-500">
                          课程 · {course.id}
                          {course.deleted_at ? ` · ${formatDeletedAt(course.deleted_at)}` : ''}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                          disabled={anyPending}
                          onClick={() => handleRestoreCourse(course)}
                        >
                          <RotateCcw size={14} />
                          还原
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                          disabled={anyPending}
                          onClick={() => setPurgeTarget({ mode: 'single', kind: 'course', id: course.id, name: item.name })}
                        >
                          <Skull size={14} />
                          彻底删除
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {(recycledDocuments.length > 0 || (!loading && !loadError)) && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <header className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <FileText size={16} className="text-indigo-600" />
                已删除文档
                <span className="font-normal text-slate-500">({recycledDocuments.length})</span>
              </div>
              {recycledDocuments.length > 0 && (
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={recycledDocuments.every((doc) => isSelected({
                      kind: 'document',
                      id: doc.id,
                      name: doc.title || doc.filename,
                    }))}
                    onChange={() => toggleSection(recycledDocuments.map((doc) => ({
                      kind: 'document',
                      id: doc.id,
                      name: doc.title || doc.filename,
                    })))}
                  />
                  本组全选
                </label>
              )}
            </header>
            {recycledDocuments.length === 0 ? (
              <p className="text-xs text-slate-400">暂无已删除文档</p>
            ) : (
              <ul className="space-y-2">
                {recycledDocuments.map((doc) => {
                  const item: SelectedItem = { kind: 'document', id: doc.id, name: doc.title || doc.filename };
                  return (
                    <li
                      key={doc.id}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-3 text-sm ${
                        isSelected(item) ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200 bg-slate-50/80'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-slate-300"
                        checked={isSelected(item)}
                        onChange={() => toggleItem(item)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-slate-900">{item.name}</div>
                        <div className="truncate text-xs text-slate-500">
                          文档 · {doc.course_title ?? doc.course_id}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                          disabled={anyPending}
                          onClick={() => void runBatchRestore([item])}
                        >
                          <RotateCcw size={14} />
                          还原
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                          disabled={anyPending}
                          onClick={() => setPurgeTarget({ mode: 'single', kind: 'document', id: doc.id, name: item.name })}
                        >
                          <Skull size={14} />
                          彻底删除
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(purgeTarget)}
        title={purgeTarget?.mode === 'batch' ? '批量彻底删除' : purgeTarget?.kind === 'course' ? '彻底删除课程' : '彻底删除文档'}
        description={purgeDescription}
        confirmLabel="彻底删除"
        tone="danger"
        loading={purgeLoading}
        onCancel={() => setPurgeTarget(null)}
        onConfirm={confirmPurge}
      />
    </>
  );
}
