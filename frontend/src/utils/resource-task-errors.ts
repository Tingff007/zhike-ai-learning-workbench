import { explainResourceError, formatErrorContent, type UserFacingError } from './workspace-errors';

type TaskFailureContext = {
  hasCourse?: boolean;
  rootCause?: string | null;
  errorCode?: string | null;
  resourceType?: string | null;
};

export function explainTaskFailure(
  raw: string | null | undefined,
  context: TaskFailureContext = {},
): UserFacingError {
  const normalizedRaw = [raw, context.errorCode, context.resourceType].filter(Boolean).join('\n').trim();
  if (!normalizedRaw) {
    return {
      summary: '资源生成未完成。',
      steps: ['在左侧重新选择资源类型并提交', '确认顶部已选择课程且知识库文档已向量化', '若多次失败请联系管理员检查模型网关'],
    };
  }
  const explained = explainResourceError(new Error(normalizedRaw), context);
  const apiRoot = context.rootCause?.trim();
  if (apiRoot && apiRoot !== explained.summary) {
    return { ...explained, rootCause: apiRoot };
  }
  return explained;
}

export function formatTaskFailureContent(
  raw: string | null | undefined,
  context: TaskFailureContext = {},
): string {
  return formatErrorContent(explainTaskFailure(raw, context));
}
