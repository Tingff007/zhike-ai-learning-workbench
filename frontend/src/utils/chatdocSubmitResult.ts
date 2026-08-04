export type ChatdocBatchItem = {
  document_id: string;
  iflytek_file_id?: string | null;
  reason?: string | null;
};

export type ChatdocBatchResult = {
  accepted?: ChatdocBatchItem[];
  rejected?: ChatdocBatchItem[];
  message?: string;
};

export function summarizeChatdocBatchResult(
  result: ChatdocBatchResult,
  labels: { success: string; partial: string; allRejected: string },
): { ok: boolean; message: string; detail?: string } {
  const accepted = result.accepted ?? [];
  const rejected = result.rejected ?? [];
  if (accepted.length === 0 && rejected.length === 0) {
    return { ok: false, message: result.message || '未收到有效处理结果，请稍后重试。' };
  }
  if (accepted.length === 0) {
    const reasons = rejected
      .map((item) => item.reason?.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join('；');
    return {
      ok: false,
      message: labels.allRejected,
      detail: reasons || rejected.map((item) => item.document_id).join(', '),
    };
  }
  if (rejected.length > 0) {
    return {
      ok: true,
      message: labels.partial.replace('{accepted}', String(accepted.length)).replace('{rejected}', String(rejected.length)),
    };
  }
  return {
    ok: true,
    message: labels.success.replace('{accepted}', String(accepted.length)),
  };
}
