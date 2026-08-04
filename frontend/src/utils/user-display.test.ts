import { describe, expect, it } from 'vitest';
import { resolveUserDisplayName } from './user-display';

describe('resolveUserDisplayName', () => {
  it('保留后端返回的真实账号名', () => {
    expect(resolveUserDisplayName('003')).toBe('003');
    expect(resolveUserDisplayName('李同学')).toBe('李同学');
  });

  it('仅在姓名为空或历史乱码时使用兜底显示', () => {
    expect(resolveUserDisplayName('')).toBe('用户');
    expect(resolveUserDisplayName('   ')).toBe('用户');
    expect(resolveUserDisplayName('寮犲悓瀛?')).toBe('张同学');
  });
});
