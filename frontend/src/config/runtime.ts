export type DataMode = 'mock' | 'live';

export type DataModeSource = 'url' | 'env' | 'default';

/**
 * 唯一 Mock / 真实数据判断入口。
 * 仅允许在 `api/endpoints.ts` 与 `api/mockAdapter.ts` 中调用。
 *
 * 优先级（高 → 低）：
 * 1. URL `?mock=1` / `?mock=0`（开发调试覆盖）
 * 2. 环境变量 `VITE_USE_MOCKS=true` / `VITE_USE_MOCKS=false`
 * 3. 默认 `live`（请求真实后端）
 *
 * 说明：`vite preview` 默认端口为 4174，但端口本身不决定 Mock。
 * 若需在预览包中使用 Mock，请在构建时设置 `VITE_USE_MOCKS=true`
 *（例如 `frontend/.env.preview` 或 CI 构建参数）。
 */
export function shouldUseMockData(): boolean {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mock') === '1') return true;
    if (params.get('mock') === '0') return false;
  }

  if (import.meta.env.VITE_USE_MOCKS === 'true') return true;
  if (import.meta.env.VITE_USE_MOCKS === 'false') return false;

  return false;
}

export function resolveDataMode(): { mode: DataMode; source: DataModeSource } {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mock') === '1') return { mode: 'mock', source: 'url' };
    if (params.get('mock') === '0') return { mode: 'live', source: 'url' };
  }

  if (import.meta.env.VITE_USE_MOCKS === 'true') {
    return { mode: 'mock', source: 'env' };
  }
  if (import.meta.env.VITE_USE_MOCKS === 'false') {
    return { mode: 'live', source: 'env' };
  }

  return { mode: 'live', source: 'default' };
}

export function isDevApiMode(): boolean {
  return resolveDataMode().mode === 'live';
}
