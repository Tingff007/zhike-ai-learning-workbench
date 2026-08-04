import { useEffect, useState, type ChangeEvent, type DragEvent } from 'react';
import type { ResourceType } from '../../types';
import {
  RESOURCE_UPLOAD_MAX_BYTES,
  validateResourceUploadFile,
  type ResourceNotice,
  type ResourceUploadDraft,
} from './resourceHallConfig';

export type ResourceUploadPayload = {
  title: string;
  summary?: string;
  content?: string;
  resourceType: ResourceType | string;
  difficulty: string;
  courseId?: string | null;
  submitForReview?: boolean;
  file?: File | null;
};

export type ResourceUploadPayloadResult =
  | { ok: true; payload: ResourceUploadPayload }
  | { ok: false; message: string };

type UseResourceUploadDialogOptions = {
  hasCourse: boolean;
  currentCourseId: string | null;
  onNoticeChange: (notice: ResourceNotice | null) => void;
};

/** 构造上传弹窗的空白草稿，保证课程绑定默认值只由当前课程上下文决定。 */
export function createEmptyResourceUploadDraft(hasCourse: boolean): ResourceUploadDraft {
  return {
    title: '',
    summary: '',
    content: '',
    resourceType: 'reading',
    difficulty: 'basic',
    bindToCurrentCourse: hasCourse,
    submitForReview: false,
  };
}

/** 根据已通过校验的文件补全上传草稿标题和摘要。 */
export function applyResourceUploadFileToDraft(draft: ResourceUploadDraft, file: File): ResourceUploadDraft {
  return {
    ...draft,
    title: draft.title || file.name.replace(/\.[^.]+$/, ''),
    summary: draft.summary || `来自文件 ${file.name} 的上传资源`,
  };
}

/** 将上传草稿转换为 API payload，并返回适合用户展示的校验错误。 */
export function buildResourceUploadPayload(
  draft: ResourceUploadDraft,
  file: File | null,
  currentCourseId: string | null,
): ResourceUploadPayloadResult {
  const title = draft.title.trim();
  const content = draft.content.trim();
  if (!title) {
    return { ok: false, message: '请先填写资源标题。' };
  }
  if (!file && !content) {
    return { ok: false, message: '请上传 Markdown/TXT 文件，或粘贴资源正文。' };
  }
  if (content && new Blob([content]).size > RESOURCE_UPLOAD_MAX_BYTES) {
    return { ok: false, message: '资源正文过长，请控制在 2MB 以内。' };
  }
  return {
    ok: true,
    payload: {
      title,
      summary: draft.summary.trim() || undefined,
      content: content || undefined,
      resourceType: draft.resourceType,
      difficulty: draft.difficulty,
      courseId: draft.bindToCurrentCourse ? currentCourseId : null,
      submitForReview: draft.submitForReview,
      file,
    },
  };
}

/** 管理资源大厅上传弹窗状态、文件校验和提交前 payload 构造。 */
export function useResourceUploadDialog({
  hasCourse,
  currentCourseId,
  onNoticeChange,
}: UseResourceUploadDialogOptions): {
  uploadOpen: boolean;
  uploadDragActive: boolean;
  uploadFile: File | null;
  uploadDraft: ResourceUploadDraft;
  setUploadDragActive: (active: boolean) => void;
  setUploadDraft: (updater: ResourceUploadDraft | ((draft: ResourceUploadDraft) => ResourceUploadDraft)) => void;
  openUploadDialog: () => void;
  closeUploadDialog: (isPending?: boolean) => void;
  handleResourceUploadInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleResourceUploadDrop: (event: DragEvent<HTMLDivElement>) => void;
  removeUploadFile: () => void;
  submitUploadedResource: (onSubmit: (payload: ResourceUploadPayload) => void) => void;
  resetAfterSuccess: () => void;
} {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadDragActive, setUploadDragActive] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDraft, setUploadDraft] = useState<ResourceUploadDraft>(() => createEmptyResourceUploadDraft(hasCourse));

  useEffect(() => {
    setUploadDraft((draft) => ({
      ...draft,
      bindToCurrentCourse: hasCourse ? draft.bindToCurrentCourse : false,
    }));
  }, [hasCourse]);

  function openUploadDialog(): void {
    setUploadOpen(true);
    setUploadDraft((draft) => ({
      ...draft,
      bindToCurrentCourse: hasCourse,
    }));
    onNoticeChange(null);
  }

  function closeUploadDialog(isPending = false): void {
    if (isPending) return;
    setUploadOpen(false);
    setUploadDragActive(false);
    setUploadFile(null);
  }

  function handleResourceUploadFile(file: File | null): void {
    setUploadDragActive(false);
    if (!file) return;
    const validationMessage = validateResourceUploadFile(file);
    if (validationMessage) {
      onNoticeChange({ tone: 'error', message: validationMessage });
      return;
    }
    setUploadFile(file);
    setUploadDraft((draft) => applyResourceUploadFileToDraft(draft, file));
    onNoticeChange(null);
  }

  function handleResourceUploadInputChange(event: ChangeEvent<HTMLInputElement>): void {
    handleResourceUploadFile(event.currentTarget.files?.[0] ?? null);
    event.currentTarget.value = '';
  }

  function handleResourceUploadDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    handleResourceUploadFile(event.dataTransfer.files?.[0] ?? null);
  }

  function submitUploadedResource(onSubmit: (payload: ResourceUploadPayload) => void): void {
    const result = buildResourceUploadPayload(uploadDraft, uploadFile, currentCourseId);
    if (!result.ok) {
      onNoticeChange({ tone: 'error', message: result.message });
      return;
    }
    onSubmit(result.payload);
  }

  function resetAfterSuccess(): void {
    setUploadOpen(false);
    setUploadFile(null);
    setUploadDragActive(false);
    setUploadDraft(createEmptyResourceUploadDraft(hasCourse));
  }

  return {
    uploadOpen,
    uploadDragActive,
    uploadFile,
    uploadDraft,
    setUploadDragActive,
    setUploadDraft,
    openUploadDialog,
    closeUploadDialog,
    handleResourceUploadInputChange,
    handleResourceUploadDrop,
    removeUploadFile: () => setUploadFile(null),
    submitUploadedResource,
    resetAfterSuccess,
  };
}
