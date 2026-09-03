/** 与后端 MAX_DOCUMENT_UPLOAD_BYTES 和允许扩展名保持一致的前端上传校验。 */

export const KNOWLEDGE_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
export const KNOWLEDGE_UPLOAD_ACCEPT = '.pdf,.md,.markdown,.txt,.text';

const ALLOWED_SUFFIXES = new Set(['.pdf', '.md', '.markdown', '.txt', '.text']);

export type KnowledgeUploadValidationResult =
  | { ok: true }
  | { ok: false; message: string };

function fileSuffix(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  return dot >= 0 ? lower.slice(dot) : '';
}

export function validateKnowledgeUploadFile(file: File): KnowledgeUploadValidationResult {
  if (file.size <= 0) {
    return { ok: false, message: '所选文件为空，请换一个有效文档。' };
  }
  if (file.size > KNOWLEDGE_UPLOAD_MAX_BYTES) {
    const limitMb = Math.floor(KNOWLEDGE_UPLOAD_MAX_BYTES / 1024 / 1024);
    return { ok: false, message: `文件超过 ${limitMb} MB 上限，请压缩或拆分后再上传。` };
  }
  const suffix = fileSuffix(file.name);
  if (!ALLOWED_SUFFIXES.has(suffix)) {
    return { ok: false, message: '仅支持 PDF、Markdown（.md）与 TXT 文件。' };
  }
  return { ok: true };
}

export function formatKnowledgeUploadLimitHint(): string {
  const limitMb = Math.floor(KNOWLEDGE_UPLOAD_MAX_BYTES / 1024 / 1024);
  return `支持 PDF / MD / TXT，单文件不超过 ${limitMb} MB。`;
}
