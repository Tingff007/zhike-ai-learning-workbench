import { getAuthToken } from '../stores/session.store';
import { tryParseJsonValue } from '../utils/json-parse';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 12_000);

type ResponseValidator<T> = (payload: unknown) => T;
type RequestOptions<T = unknown> = RequestInit & {
  parseJson?: boolean;
  timeoutMs?: number;
  validate?: ResponseValidator<T>;
};

function makeTraceId(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `web_${random}`;
}

const SERVER_MESSAGE_MAP: Record<string, string> = {
  'invalid email or password': '邮箱或密码错误，请重新输入。',
  'email is invalid': '邮箱格式不正确。',
  'email already registered': '该邮箱已注册，请直接登录或更换邮箱。',
  'missing bearer token': '登录状态已失效，请重新登录。',
  'invalid session': '登录状态已失效，请重新登录。',
  'admin role required': '当前账号没有管理权限。',
  'course is not assigned': '当前账号尚未分配该课程。',
  'course not found': '课程不存在或已被删除。',
  'path node not found': '学习路径节点不存在。',
  'resource not found': '资源不存在或已被删除。',
};

function validationIssueText(item: unknown): string {
  if (!item || typeof item !== 'object') return '';
  const record = item as { loc?: unknown; msg?: unknown; message?: unknown };
  const msg = typeof record.msg === 'string'
    ? record.msg
    : typeof record.message === 'string'
      ? record.message
      : '';
  if (!msg) return '';
  const loc = Array.isArray(record.loc)
    ? record.loc.map(String).filter((part) => part !== 'body').join('.')
    : '';
  return loc ? `${loc}: ${msg}` : msg;
}

function detailToText(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map(validationIssueText).filter(Boolean);
    return parts.length > 0 ? parts.join('；') : '请求参数不完整或格式不正确。';
  }
  if (detail && typeof detail === 'object') {
    const record = detail as Record<string, unknown>;
    if (record.detail) return detailToText(record.detail);
    if (record.message) return detailToText(record.message);
    if (record.error) return detailToText(record.error);
  }
  return '';
}

function isFastApiRouteNotFound(detail: string, status: number): boolean {
  return status === 404 && detail.trim().toLowerCase() === 'not found';
}

function fallbackMessage(status: number, detail?: string): string {
  if (status === 400) return '请求参数有误，请检查后重试。';
  if (status === 401) return '登录失败或登录状态已失效，请重新登录。';
  if (status === 403) return '当前账号没有权限执行此操作。';
  if (status === 404) {
    if (detail && isFastApiRouteNotFound(detail, status)) {
      return '后端接口未注册（多为未重启 uvicorn）。请在 backend 目录执行：python run_dev.py';
    }
    return '请求的资源不存在。';
  }
  if (status === 409) return '数据已存在，请检查后重试。';
  if (status === 413) return '上传文件过大，请压缩或拆分后重试。';
  if (status === 422) return '请求参数不完整或格式不正确。';
  if (status >= 500) return '服务器处理失败，请稍后重试或联系管理员。';
  return `请求失败，状态码 ${status}。`;
}

function localizeMessage(message: string, status: number): string {
  const trimmed = message.trim();
  const normalized = trimmed.toLowerCase();
  if (SERVER_MESSAGE_MAP[normalized]) return SERVER_MESSAGE_MAP[normalized];
  if (!trimmed) return fallbackMessage(status);
  if (isFastApiRouteNotFound(trimmed, status)) return fallbackMessage(status, trimmed);
  return trimmed;
}

export type ApiErrorDetail = {
  code?: string;
  message?: string;
  duplicate_document_id?: string;
  duplicate_filename?: string;
};

export class ApiRequestError extends Error {
  readonly status: number;
  readonly detail?: ApiErrorDetail;

  constructor(message: string, status: number, detail?: ApiErrorDetail) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.detail = detail;
  }
}

export class ApiResponseValidationError extends Error {
  readonly path: string;
  readonly cause?: unknown;

  constructor(message: string, path: string, cause?: unknown) {
    super(message);
    this.name = 'ApiResponseValidationError';
    this.path = path;
    this.cause = cause;
  }
}


function browserIsOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function networkUnavailableMessage(): string {
  return browserIsOffline()
    ? '当前无网络连接，请检查网络后重试。'
    : '无法连接后端服务，请确认后端已启动，或检查网络 / VPN / Vite 代理配置。';
}

function parseApiErrorDetail(payload: unknown): ApiErrorDetail | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const record = payload as Record<string, unknown>;
  const nested = record.detail;
  const source = nested && typeof nested === 'object' ? (nested as Record<string, unknown>) : record;
  if (typeof source.message !== 'string' && typeof source.code !== 'string') return undefined;
  return {
    code: typeof source.code === 'string' ? source.code : undefined,
    message: typeof source.message === 'string' ? source.message : undefined,
    duplicate_document_id: typeof source.duplicate_document_id === 'string' ? source.duplicate_document_id : undefined,
    duplicate_filename: typeof source.duplicate_filename === 'string' ? source.duplicate_filename : undefined,
  };
}

/** 从 fetch / mutation 抛出的 Error 中取出可展示文案 */
export function getApiErrorMessage(error: unknown, fallback = '请求失败，请稍后重试。'): string {
  if (error instanceof ApiRequestError && error.message.trim()) return error.message.trim();
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === 'string' && error.trim()) return error.trim();
  return fallback;
}

function isGenericServerMessage(message: string, status: number): boolean {
  const normalized = message.trim().toLowerCase();
  return status >= 500 && normalized === 'internal server error';
}

function isLikelyBackendUnavailable(status: number, raw: string): boolean {
  if (status !== 500 && status !== 502 && status !== 503 && status !== 504) return false;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized === 'internal server error'
    || normalized.includes('econnrefused')
    || normalized.includes('proxy error')
    || normalized.includes('connect econnrefused')
  );
}

async function readErrorMessage(response: Response): Promise<string> {
  const raw = await response.text().catch(() => '');
  if (isLikelyBackendUnavailable(response.status, raw)) {
    return networkUnavailableMessage();
  }
  if (!raw.trim()) return fallbackMessage(response.status);
  const payload = tryParseJsonValue(raw);
  if (payload !== undefined) {
    const rawDetail = detailToText(payload);
    const detail = localizeMessage(rawDetail, response.status);
    if (isGenericServerMessage(detail, response.status)) {
      return `${fallbackMessage(response.status)}（HTTP ${response.status}，后端未返回 detail 字段，请查看 uvicorn 控制台日志）`;
    }
    return detail;
  }
  const detail = localizeMessage(raw, response.status);
  if (isGenericServerMessage(detail, response.status)) {
    return `${fallbackMessage(response.status)}（HTTP ${response.status}，后端未返回 JSON 错误体，请查看 uvicorn 控制台日志）`;
  }
  return detail;
}

export async function request<T>(path: string, init?: RequestOptions<T>): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const token = getAuthToken();
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const traceHeader = { 'X-Trace-Id': makeTraceId() };
  const headers = isFormData
    ? { ...traceHeader, ...authHeader, ...(init?.headers ?? {}) }
    : { 'Content-Type': 'application/json', ...traceHeader, ...authHeader, ...(init?.headers ?? {}) };
  const controller = new AbortController();
  const timeoutMs = init?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(browserIsOffline()
        ? '当前无网络连接，请检查网络后重试。'
        : '请求超时，请确认后端已启动（默认 http://localhost:8001）且网络正常。');
    }
    throw new Error(networkUnavailableMessage());
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    const parsed = tryParseJsonValue(raw);
    const message = isLikelyBackendUnavailable(response.status, raw)
      ? networkUnavailableMessage()
      : parsed
        ? localizeMessage(detailToText(parsed), response.status)
        : localizeMessage(raw, response.status) || fallbackMessage(response.status);
    if (isGenericServerMessage(message, response.status)) {
      throw new ApiRequestError(
        `${fallbackMessage(response.status)}（HTTP ${response.status}，后端未返回 detail 字段，请查看 uvicorn 控制台日志）`,
        response.status,
        parseApiErrorDetail(parsed),
      );
    }
    throw new ApiRequestError(message, response.status, parseApiErrorDetail(parsed));
  }

  if (init?.parseJson === false || response.status === 204) {
    return undefined as T;
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new ApiResponseValidationError('后端返回的 JSON 格式无效。', path, error);
  }
  if (init?.validate) {
    try {
      return init.validate(payload);
    } catch (error) {
      if (error instanceof ApiResponseValidationError) throw error;
      throw new ApiResponseValidationError('后端响应结构与前端契约不一致。', path, error);
    }
  }
  return payload as T;
}

export async function requestBlob(path: string, init?: RequestOptions): Promise<Blob> {
  const token = getAuthToken();
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const controller = new AbortController();
  const timeoutMs = init?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'X-Trace-Id': makeTraceId(),
        ...authHeader,
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(browserIsOffline()
        ? '当前无网络连接，请检查网络后重试。'
        : '下载超时，请确认后端已启动且网络正常。');
    }
    throw new Error(networkUnavailableMessage());
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.blob();
}
export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: any) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data) }),
  put: <T>(path: string, data?: any) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(data) }),
  delete: <T>(path: string) =>
    request<T>(path, { method: 'DELETE' }),
};