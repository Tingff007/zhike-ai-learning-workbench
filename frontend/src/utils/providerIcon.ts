const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

/** 内置图标走前端 public，避免仅依赖后端静态目录导致裂图 */
const BUNDLED_ICON_URLS: Record<string, string> = {
  'xunfei.png': `${API_BASE}/static/provider-icons/xunfei.png`,
  'iflytek.svg': '/provider-icons/iflytek.svg',
  'aliyun.svg': '/provider-icons/aliyun.svg',
  'zhipu.svg': '/provider-icons/zhipu.svg',
  'ollama.svg': '/provider-icons/ollama.svg',
  'openai.svg': '/provider-icons/openai.svg',
  'generic.svg': '/provider-icons/generic.svg',
};

export type ModelProviderIconItem = {
  filename: string;
  url: string;
  deletable?: boolean;
};

export function providerIconSrc(filename?: string | null, cacheBust?: string | number): string | null {
  if (!filename?.trim()) return null;
  const safe = filename.replace(/[/\\]/g, '');
  const base = BUNDLED_ICON_URLS[safe] ?? `${API_BASE}/static/provider-icons/${encodeURIComponent(safe)}`;
  if (cacheBust == null) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}v=${encodeURIComponent(String(cacheBust))}`;
}

/** 未配置图标时，用供应商名称首字（中文取首字，英文取首字母大写） */
export function providerDisplayInitial(displayName?: string | null): string {
  const trimmed = (displayName ?? '').trim();
  if (!trimmed) return 'A';
  const first = Array.from(trimmed)[0] ?? 'A';
  return /[a-z]/i.test(first) ? first.toUpperCase() : first;
}

export const MOCK_PROVIDER_ICONS: ModelProviderIconItem[] = [
  { filename: 'xunfei.png', url: BUNDLED_ICON_URLS['xunfei.png'], deletable: true },
  { filename: 'iflytek.svg', url: BUNDLED_ICON_URLS['iflytek.svg'], deletable: true },
  { filename: 'aliyun.svg', url: BUNDLED_ICON_URLS['aliyun.svg'], deletable: true },
  { filename: 'zhipu.svg', url: BUNDLED_ICON_URLS['zhipu.svg'], deletable: true },
  { filename: 'ollama.svg', url: BUNDLED_ICON_URLS['ollama.svg'], deletable: true },
  { filename: 'openai.svg', url: BUNDLED_ICON_URLS['openai.svg'], deletable: true },
  { filename: 'generic.svg', url: BUNDLED_ICON_URLS['generic.svg'], deletable: true },
];
