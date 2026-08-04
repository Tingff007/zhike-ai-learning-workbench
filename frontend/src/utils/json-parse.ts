export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== 'object') return false;
  return Object.values(value).every(isJsonValue);
}

/** 统一解析 JSON 字符串，调用方负责决定解析失败时的降级策略。 */
export function parseJsonValue(raw: string): unknown {
  const parsed: unknown = JSON.parse(raw);
  return parsed;
}

/** 尝试解析 JSON 字符串，空字符串或非法 JSON 返回 undefined。 */
export function tryParseJsonValue(raw: string): unknown | undefined {
  if (!raw.trim()) return undefined;
  try {
    return parseJsonValue(raw);
  } catch {
    return undefined;
  }
}

/** 通过 JSON 序列化做结构化深拷贝，并保持返回值停留在 JSON 类型边界内。 */
export function cloneJsonValue(value: JsonValue): JsonValue {
  const cloned = parseJsonValue(JSON.stringify(value));
  if (!isJsonValue(cloned)) {
    throw new Error('JSON 深拷贝结果不是合法 JSON 值。');
  }
  return cloned;
}
