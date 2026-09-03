/** 课程内文档显示名 / 文件名重复检测（与后端 BLOCK_DUPLICATE_FILENAME 对齐） */

export function normalizeUploadDisplayName(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export type UploadFilenameConflict<T extends { id: string; name: string; filename?: string | null; courseId?: string | null }> = {
  document: T;
};

export function findUploadFilenameConflict<T extends { id: string; name: string; filename?: string | null; courseId?: string | null }>(
  documents: T[],
  filename: string,
  courseId?: string | null,
): UploadFilenameConflict<T> | null {
  const key = normalizeUploadDisplayName(filename);
  if (!key) return null;
  const match = documents.find((document) => {
    if (courseId && document.courseId && document.courseId !== courseId) return false;
    return normalizeUploadDisplayName(document.filename ?? document.name) === key;
  });
  return match ? { document: match } : null;
}
