import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '../api/endpoints';
import type { KnowledgeUploadPolicy } from '../types';
import {
  KNOWLEDGE_UPLOAD_ACCEPT,
  KNOWLEDGE_UPLOAD_MAX_BYTES,
  type KnowledgeUploadValidationResult,
} from '../utils/knowledgeUploadValidation';

export type { KnowledgeUploadPolicy };

type KnowledgeUploadPolicyQueryResult = UseQueryResult<Awaited<ReturnType<typeof api.knowledgeUploadPolicy>>>;

export function useKnowledgeUploadPolicy(): KnowledgeUploadPolicyQueryResult {
  return useQuery({
    queryKey: ['knowledge-upload-policy'],
    queryFn: () => api.knowledgeUploadPolicy(),
    staleTime: 60_000,
  });
}

export function validateKnowledgeUploadFileWithPolicy(
  file: File,
  policy: KnowledgeUploadPolicy | undefined,
): KnowledgeUploadValidationResult {
  const maxBytes = policy?.max_upload_bytes ?? KNOWLEDGE_UPLOAD_MAX_BYTES;
  if (file.size <= 0) {
    return { ok: false, message: '所选文件为空，请换一个有效文档。' };
  }
  if (file.size > maxBytes) {
    const limitMb = Math.floor(maxBytes / 1024 / 1024);
    return { ok: false, message: `文件超过 ${limitMb} MB 上限，请压缩或拆分后再上传。` };
  }
  const suffix = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '';
  const allowed = policy?.allowed_extensions?.length
    ? new Set(policy.allowed_extensions.map((item) => item.toLowerCase()))
    : null;
  if (allowed && suffix && !allowed.has(suffix)) {
    return { ok: false, message: '仅支持 PDF、Markdown（.md）与 TXT 文件。' };
  }
  return { ok: true };
}

export function formatKnowledgeUploadLimitHint(policy?: KnowledgeUploadPolicy): string {
  const maxBytes = policy?.max_upload_bytes ?? KNOWLEDGE_UPLOAD_MAX_BYTES;
  const limitMb = Math.floor(maxBytes / 1024 / 1024);
  return `支持 PDF / MD / TXT，单文件不超过 ${limitMb} MB。`;
}
