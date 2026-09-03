import {
  readLocalJson,
  readLocalString,
  readSessionJson,
  readSessionString,
  removeLocalItem,
  removeSessionItem,
  writeSessionJson,
  writeSessionString,
} from './browser-storage';

export const AUTH_TOKEN_STORAGE_KEY = 'zhike_auth_token';
export const AUTH_USER_STORAGE_KEY = 'zhike_auth_user';

type AuthUserValidator<T> = (value: unknown) => value is T;

let memoryToken: string | null = null;
const missingJsonValue = Symbol('missing-auth-json');

function readSessionOrMigrateLegacy(key: string): string | null {
  const sessionValue = readSessionString(key);
  if (sessionValue) return sessionValue;

  const legacyValue = readLocalString(key);
  if (!legacyValue) return null;

  // 兼容旧版本：首次读取后迁移到 sessionStorage，并删除长期驻留的 localStorage 副本。
  writeSessionString(key, legacyValue);
  removeLocalItem(key);
  return legacyValue;
}

function readSessionOrMigrateLegacyJson<T>(key: string, validator: AuthUserValidator<T>): T | null {
  const sessionValue = readSessionJson<T | typeof missingJsonValue>(
    key,
    missingJsonValue,
    (value): value is T => validator(value),
  );
  if (sessionValue !== missingJsonValue) return sessionValue;

  const legacyValue = readLocalJson<T | typeof missingJsonValue>(
    key,
    missingJsonValue,
    (value): value is T => validator(value),
  );
  if (legacyValue === missingJsonValue) return null;

  // 兼容旧版本：用户快照校验通过后再迁移，避免把损坏结构写入会话存储。
  writeSessionJson(key, legacyValue);
  removeLocalItem(key);
  return legacyValue;
}

/** 读取当前会话 token，并按需迁移旧版 localStorage token。 */
export function readAuthToken(): string | null {
  if (memoryToken) return memoryToken;
  const token = readSessionOrMigrateLegacy(AUTH_TOKEN_STORAGE_KEY);
  memoryToken = token;
  return token;
}

/** 写入当前会话 token；不会把 token 写入 localStorage。 */
export function writeAuthToken(token: string): void {
  memoryToken = token;
  writeSessionString(AUTH_TOKEN_STORAGE_KEY, token);
  removeLocalItem(AUTH_TOKEN_STORAGE_KEY);
}

/** 清理所有前端可见 token 副本，包括旧版 localStorage 副本。 */
export function clearAuthToken(): void {
  memoryToken = null;
  removeSessionItem(AUTH_TOKEN_STORAGE_KEY);
  removeLocalItem(AUTH_TOKEN_STORAGE_KEY);
}

/** 读取当前会话用户快照，并迁移旧版 localStorage 用户快照。 */
export function readAuthUser<T = unknown>(validator?: AuthUserValidator<T>): T | null {
  const resolvedValidator = validator ?? ((value): value is T => value != null);
  return readSessionOrMigrateLegacyJson(AUTH_USER_STORAGE_KEY, resolvedValidator);
}

/** 写入当前会话用户快照；用户信息不再长期驻留 localStorage。 */
export function writeAuthUser(user: unknown): void {
  writeSessionJson(AUTH_USER_STORAGE_KEY, user);
  removeLocalItem(AUTH_USER_STORAGE_KEY);
}

/** 清理所有前端可见用户快照副本。 */
export function clearAuthUser(): void {
  removeSessionItem(AUTH_USER_STORAGE_KEY);
  removeLocalItem(AUTH_USER_STORAGE_KEY);
}

/** 清理认证相关的前端可见存储。 */
export function clearAuthStorage(): void {
  clearAuthToken();
  clearAuthUser();
}
