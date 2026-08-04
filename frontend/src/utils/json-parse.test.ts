import { describe, expect, it } from 'vitest';
import { isRecord } from './type-guards';
import { cloneJsonValue, isJsonValue, parseJsonValue, tryParseJsonValue, type JsonValue } from './json-parse';

describe('json-parse', (): void => {
  it('解析合法 JSON 并保留 unknown 边界', (): void => {
    expect(parseJsonValue('{"items":["a"]}')).toEqual({ items: ['a'] });
  });

  it('尝试解析非法 JSON 时返回 undefined', (): void => {
    expect(tryParseJsonValue('{broken')).toBeUndefined();
    expect(tryParseJsonValue('')).toBeUndefined();
  });

  it('识别 JSON 值并拒绝无法序列化的运行时值', (): void => {
    expect(isJsonValue({ items: ['a'], enabled: true, count: 2, empty: null })).toBe(true);
    expect(isJsonValue({ bad: Number.NaN })).toBe(false);
    expect(isJsonValue({ bad: undefined })).toBe(false);
    expect(isJsonValue({ bad: () => true })).toBe(false);
  });

  it('深拷贝 JSON 配置对象时不会复用原始引用', (): void => {
    const source: JsonValue = { nested: { enabled: true } };
    const copied = cloneJsonValue(source);

    expect(copied).toEqual(source);
    expect(copied).not.toBe(source);
    expect(isRecord(copied) && isRecord(source)).toBe(true);
    if (isRecord(copied) && isRecord(source)) {
      expect(copied.nested).not.toBe(source.nested);
    }
  });
});
