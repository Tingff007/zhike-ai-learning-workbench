import { describe, expect, it } from 'vitest';
import { isRecord } from './type-guards';

describe('type-guards', (): void => {
  it('只把非数组对象识别为普通记录', (): void => {
    expect(isRecord({ id: 'u-1' })).toBe(true);
    expect(isRecord(Object.create(null))).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord('text')).toBe(false);
  });
});
