export type UserFacingError = {
  summary: string;
  steps: string[];
  /** 技术根因仅供内部调试，不在用户界面直接展示。 */
  rootCause?: string;
};

export const ERROR_ROOT_CAUSE_PREFIX = '根源：';

type ErrorContext = {
  hasCourse?: boolean;
  isUserMode?: boolean;
};

function rawMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '';
}

export function compactRootCause(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const lines = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^traceback/i.test(line) && !/file "/i.test(line));
  const chosen = (lines.length ? lines[lines.length - 1] : trimmed.split('\n')[0]?.trim()) ?? '';
  if (!chosen) return undefined;
  return chosen.length > 220 ? `${chosen.slice(0, 217)}...` : chosen;
}

/**
 * 上线态用户界面不展示原始异常、堆栈或 Python/JS 对象细节。
 * 需要排查时通过浏览器 console、后端日志和 traceId 查看技术根因。
 */
function attachRootCause(explained: UserFacingError, _raw: string): UserFacingError {
  return explained;
}

function isModelApiConfigError(text: string): boolean {
  if (isImageProviderConfigError(text) || isImageGenerationFailure(text)) return false;
  const explicitChatError =
    /ai_model_unavailable|ai_model_not_configured|chat api|chat_model|chat model|chatgenerationresult|openai_compatible|模型 api/.test(text) ||
    /chat.*(api key|apikey|api_key|未填写|未配置|未接入|no active provider|provider not found)/.test(text) ||
    /(model gateway|模型网关).*(chat|对话|模型)/.test(text);
  const genericGatewayError =
    /(missing api key|api key|apikey|api_key|未填写|未配置|未接入|no active provider|provider not found|model gateway|模型网关)/.test(text) &&
    !/chatdoc|知识向量化|embedding|vector|向量|图片|image/.test(text);
  return explicitChatError || genericGatewayError || /__dict__|has no attribute/.test(text);
}

function isImageProviderConfigError(text: string): boolean {
  return /image_provider_unavailable|imageprovider|image provider|image_generation|image generation|image_model|openai_image|图片生成供应商|图片生成.*未配置|教学图解包无法真实出图|图片模型|生图供应商|\bfal\b|fal\.ai/.test(text);
}

function isImageGenerationFailure(text: string): boolean {
  return /imageprovider 图片生成失败|图片生成失败|出图失败|生成图片失败|三张图均未生成成功|image generation.*failed|image provider.*failed/.test(text);
}

function isNetworkError(text: string): boolean {
  return /当前无网络|无网络连接|offline|network|failed to fetch|fetch failed|econnrefused|connection refused|无法连接后端|无法连接后端服务|无法连接后端实时服务|websocket|proxy error|vite 代理|请求超时/.test(text);
}

function isServerUnavailable(text: string): boolean {
  return /502|503|504|timeout|timed out|繁忙|服务不可用|server unavailable|gateway/.test(text);
}

function modelApiNotConfigured(): UserFacingError {
  return {
    summary: 'Chat 模型 API 未配置，AI 对话暂不可用。',
    steps: [
      '请管理员到「网关中心 → Chat 模型」填写 API Key、Base URL 和模型名称',
      '点击「测试连接」并确认状态正常',
      '配置生效后重新发送当前问题',
    ],
  };
}

function imageProviderNotConfigured(): UserFacingError {
  return {
    summary: '图片生成 API 未配置，教学图解包暂不能出图。',
    steps: [
      '请管理员到「网关中心 → 图片生成」新增或启用图片生成供应商',
      '填写 API Key、Base URL 和图片模型名称，并点击「测试连接」确认状态正常',
      '如需按课程固定供应商，请到「网关中心 → 按课绑定」选择图片生成供应商',
      '配置生效后重新生成教学图解包',
    ],
  };
}

function imageGenerationFailed(): UserFacingError {
  return {
    summary: '图片生成供应商调用失败，教学图解包未能出图。',
    steps: [
      '在「网关中心 → 图片生成」重新测试当前供应商连接',
      '确认图片模型名称、Base URL、额度和限流状态正常',
      '检查参考图数量、尺寸和格式是否符合供应商要求',
      '恢复后重新生成教学图解包',
    ],
  };
}

function networkUnavailable(): UserFacingError {
  return {
    summary: '网络连接不可用，请求未能送达服务端。',
    steps: [
      '检查本机网络、Wi‑Fi、VPN 或代理是否可用',
      '确认后端服务已启动且前端代理 / WebSocket 地址正确',
      '网络恢复后重新提交，当前会话内容会保留在历史中',
    ],
  };
}

export function explainResourceError(error: unknown, context: ErrorContext = {}): UserFacingError {
  const raw = rawMessage(error);
  const text = raw.toLowerCase();

  if (isNetworkError(text)) {
    return attachRootCause(networkUnavailable(), raw);
  }

  if (isImageGenerationFailure(text)) {
    return attachRootCause(imageGenerationFailed(), raw);
  }

  if (isImageProviderConfigError(text)) {
    return attachRootCause(imageProviderNotConfigured(), raw);
  }

  if (isModelApiConfigError(text)) {
    return attachRootCause(modelApiNotConfigured(), raw);
  }

  if (!context.hasCourse) {
    return {
      summary: '当前资源生成需要课程上下文，请先选择课程。',
      steps: ['在顶部课程下拉框中选择一门已发布课程', '确认课程知识库已就绪', '选择课程后重新发起资源生成'],
    };
  }

  if (/local fallback|本地降级|本地兜底|本地模板|伪造/.test(text)) {
    return attachRootCause(
      {
        summary: '未检测到可用 Chat 模型 API，已阻止本地模板伪生成。',
        steps: ['上线模式只允许真实模型生成资源', '请管理员配置 Chat 模型 API 并通过连接测试', '配置完成后重新提交生成任务'],
      },
      raw,
    );
  }

  if (/daily course token limit|daily cost limit|token limit exceeded|cost limit exceeded|额度/.test(text)) {
    return attachRootCause(
      {
        summary: '今日课程 AI 额度已用尽，暂时无法继续生成。',
        steps: ['请稍后再试', '联系管理员在「网关中心 · 按课绑定」中调整配额或排查异常用量'],
      },
      raw,
    );
  }

  if (/rate_limited|rate limit|429|too many requests/.test(text)) {
    return attachRootCause(
      {
        summary: '请求过于频繁，请稍后再试。',
        steps: ['等待约 1 分钟后重新提交', '若持续出现请联系管理员检查供应商限流与重试策略'],
      },
      raw,
    );
  }

  if (context.isUserMode && /admin|权限|forbidden|403|无权限/.test(raw)) {
    return attachRootCause(
      {
        summary: '当前账号权限不足，无法完成资源生成。',
        steps: ['确认课程已发布且当前账号可选择', '或联系管理员检查课程状态与权限配置'],
      },
      raw,
    );
  }

  if (/not assigned|未分配|尚未分配/.test(raw)) {
    return attachRootCause(
      {
        summary: '当前课程暂不可用或尚未发布。',
        steps: ['在顶部选择一门已发布课程', '若课程列表为空，请联系管理员发布课程', '课程发布后重新选择并生成资源'],
      },
      raw,
    );
  }

  if (isServerUnavailable(text)) {
    return attachRootCause(
      {
        summary: 'AI 服务响应超时或暂不可用。',
        steps: ['等待 1～2 分钟后重试', '若仍失败，请联系管理员检查模型网关、供应商状态和后端日志'],
      },
      raw,
    );
  }

  if (/context|课程上下文|knowledge|锁定/.test(raw)) {
    return attachRootCause(
      {
        summary: '课程上下文或知识库未就绪，生成已中止。',
        steps: ['确认顶部已选择正确课程', '检查课程知识库是否已发布并完成向量化', '重新选择课程后再次提交'],
      },
      raw,
    );
  }

  if (/chatdoc|知识库检索|向量化|fileid/.test(raw)) {
    return attachRootCause(
      {
        summary: '课程资料问答服务未就绪。',
        steps: ['在「知识大本营」确认课程资料已上传、解析和向量化', '检查 ChatDoc 凭证与网络连接', '配置完成后重新提交'],
      },
      raw,
    );
  }

  if (/处理失败|internal|500|server error/.test(text)) {
    return attachRootCause(
      {
        summary: '服务器处理失败，任务未能完成。',
        steps: ['稍后重试同一指令', '若多次失败，请联系管理员查看服务日志和 traceId'],
      },
      raw,
    );
  }

  return attachRootCause(
    {
      summary: '资源生成失败，请稍后重试。',
      steps: ['检查课程、模型网关和网络状态', '确认当前资源类型所需的 Chat / 图片生成供应商已配置并连接正常', '持续失败请联系管理员'],
    },
    raw,
  );
}

export function explainChatError(error: unknown, context: ErrorContext = {}): UserFacingError {
  const raw = rawMessage(error);
  const text = raw.toLowerCase();

  if (isNetworkError(text)) {
    return attachRootCause(networkUnavailable(), raw);
  }

  if (isModelApiConfigError(text)) {
    return attachRootCause(modelApiNotConfigured(), raw);
  }

  if (/course_id is required|课程.*必填|required when learning_scope is course/.test(text)) {
    return {
      summary: '当前问题被误判为课程模式，普通对话未正确进入通用学习链路。',
      steps: ['切换到「通用学习 / 不指定课程」后重试', '若仍出现，请刷新页面并检查前端是否已同步最新版本'],
    };
  }

  if (/daily course token limit|daily cost limit|token limit exceeded|cost limit exceeded|额度/.test(text)) {
    return attachRootCause(
      {
        summary: '今日 AI 额度已用尽，暂时无法继续对话。',
        steps: ['请稍后再试', '联系管理员在「网关中心」调整配额或排查异常用量'],
      },
      raw,
    );
  }

  if (/rate_limited|rate limit|429|too many requests/.test(text)) {
    return attachRootCause(
      {
        summary: '请求过于频繁，请稍后再试。',
        steps: ['等待约 1 分钟后重新发送', '若持续出现请联系管理员检查供应商限流与重试策略'],
      },
      raw,
    );
  }

  const resource = explainResourceError(error, context);
  return {
    summary: resource.summary.replace('资源生成', '对话请求').replace('资源未生成', '对话未完成'),
    steps: resource.steps,
  };
}

export function formatErrorContent(explained: UserFacingError): string {
  const lines = [explained.summary];
  lines.push(...explained.steps.map((step, index) => `${index + 1}. ${step}`));
  return lines.join('\n');
}

export function explainKnowledgeSubmitError(error: unknown): UserFacingError {
  const raw = rawMessage(error);
  const text = raw.toLowerCase();

  if (/不能为空|超过.*上限|不支持|加密|密码|编码|无有效内容|413/.test(raw)) {
    return attachRootCause(
      {
        summary: raw.trim() || '文件未通过校验，无法上传。',
        steps: ['确认格式为 PDF / MD / TXT 且未加密', '单文件不超过 50 MB', '文本文件请使用 UTF-8 编码'],
      },
      raw,
    );
  }

  if (isNetworkError(text)) {
    return attachRootCause(networkUnavailable(), raw);
  }

  if (/not configured|凭证未配置|chatdoc|502|iflytek|讯飞/.test(raw)) {
    return attachRootCause(
      {
        summary: '讯飞 ChatDoc 未就绪或调用失败。',
        steps: ['在「网关中心 · 知识向量化」检查 AppId / Secret', '点击连接测试确认通过', '稍后重试提交'],
      },
      raw,
    );
  }

  if (/not_awaiting_activation|pending_activation|splited|待向量化|待授权/.test(raw)) {
    return attachRootCause(
      {
        summary: '当前文档状态不允许向量化。',
        steps: ['等待云端切分完成（fileStatus=splited）', '在浏览 Tab 拉取原生分片', '再点击「提交向量化」'],
      },
      raw,
    );
  }

  if (/相同内容|重复上传|force_reupload|强制重新上传/.test(raw)) {
    return attachRootCause(
      {
        summary: raw.trim() || '本课程已有相同内容的文档。',
        steps: ['若确需再次入库，勾选「强制重新上传」', '或删除/回收站清理旧文档后再传', '确认选择的是目标课程'],
      },
      raw,
    );
  }

  if (/409|conflict|未绑定|fileid/.test(text)) {
    return attachRootCause(
      {
        summary: '文档未正确绑定云端 fileId。',
        steps: ['确认文档已成功上传至 ChatDoc', '刷新文档列表后重试', '必要时重新上传文档'],
      },
      raw,
    );
  }

  if (isServerUnavailable(text)) {
    return attachRootCause(
      {
        summary: '云端或服务器繁忙，提交未完成。',
        steps: ['等待 1～2 分钟后重试', '若持续失败请查看后端日志'],
      },
      raw,
    );
  }

  return attachRootCause(
    {
      summary: '提交失败，请稍后重试。',
      steps: ['检查网络与凭证配置', '确认文档状态符合操作要求', '重试或联系管理员'],
    },
    raw,
  );
}
