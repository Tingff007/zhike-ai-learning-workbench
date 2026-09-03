import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './endpoints';

const MOCK_ANNOUNCEMENT_DISMISSALS_KEY = 'zhike_mock_announcement_dismissals';
const MOCK_ANNOUNCEMENT_READS_KEY = 'zhike_mock_announcement_reads';
const MOCK_LOGIN_BACKGROUND_KEY = 'zhike_mock_login_background';

class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.items.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

function stubMockWindow(localStorage = new MemoryStorage(), sessionStorage = new MemoryStorage()): void {
  vi.stubGlobal('window', {
    location: {
      search: '?mock=1',
      protocol: 'https:',
      host: 'example.test',
    },
    localStorage,
    sessionStorage,
  } as unknown as Window);
}

describe('endpoints mock 本地存储校验', (): void => {
  afterEach((): void => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('读取登录背景 mock 配置时拒绝坏结构', async (): Promise<void> => {
    const localStorage = new MemoryStorage();
    localStorage.setItem(MOCK_LOGIN_BACKGROUND_KEY, JSON.stringify({ media_type: 'audio', media_url: 42 }));
    stubMockWindow(localStorage);
    vi.spyOn(console, 'warn').mockImplementation((): void => undefined);

    const settings = await api.loginBackgroundSettings();

    expect(settings.media_type).toBe('video');
    expect(settings.media_url).toBe('/auth/login-hero.mp4');
    expect(localStorage.getItem(MOCK_LOGIN_BACKGROUND_KEY)).toBeNull();
  });

  it('读取登录背景 mock 配置时保留有效局部覆盖', async (): Promise<void> => {
    const localStorage = new MemoryStorage();
    localStorage.setItem(MOCK_LOGIN_BACKGROUND_KEY, JSON.stringify({
      media_type: 'image',
      media_url: '/custom-login.png',
      overlay_opacity: 0.3,
    }));
    stubMockWindow(localStorage);

    const settings = await api.loginBackgroundSettings();

    expect(settings.media_type).toBe('image');
    expect(settings.media_url).toBe('/custom-login.png');
    expect(settings.overlay_opacity).toBe(0.3);
    expect(localStorage.getItem(MOCK_LOGIN_BACKGROUND_KEY)).not.toBeNull();
  });

  it('公告已读和关闭状态只接受字符串 ID 列表', async (): Promise<void> => {
    const localStorage = new MemoryStorage();
    localStorage.setItem(MOCK_ANNOUNCEMENT_READS_KEY, JSON.stringify([123]));
    localStorage.setItem(MOCK_ANNOUNCEMENT_DISMISSALS_KEY, JSON.stringify([false]));
    stubMockWindow(localStorage);
    vi.spyOn(console, 'warn').mockImplementation((): void => undefined);

    const summary = await api.announcementSummary();

    expect(summary.unread_count).toBeGreaterThan(0);
    expect(localStorage.getItem(MOCK_ANNOUNCEMENT_READS_KEY)).toBeNull();
    expect(localStorage.getItem(MOCK_ANNOUNCEMENT_DISMISSALS_KEY)).toBeNull();
  });
});
