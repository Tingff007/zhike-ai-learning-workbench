import type { CSSProperties } from 'react';
import type { LoginBackgroundSettings } from '../types';

export const DEFAULT_LOGIN_BACKGROUND_SETTINGS: LoginBackgroundSettings = {
  enabled: true,
  media_type: 'video',
  media_url: '/auth/login-hero.mp4',
  fit: 'cover',
  position_x: 50,
  position_y: 50,
  scale: 1.02,
  brightness: 0.96,
  contrast: 1.08,
  saturate: 1.08,
  blur: 0,
  overlay_opacity: 0.46,
  fallback_color: '#b7d8ea',
  updated_at: null,
  updated_by: null,
};

type LoginBackgroundCssVars = CSSProperties & Record<`--auth-bg-${string}`, string>;

/** 把登录页背景配置转换为实际页面和后台预览共用的 CSS 变量。 */
export function buildLoginBackgroundStyle(settings: LoginBackgroundSettings): LoginBackgroundCssVars {
  return {
    '--auth-bg-color': settings.fallback_color,
    '--auth-bg-fit': settings.fit,
    '--auth-bg-position-x': `${settings.position_x}%`,
    '--auth-bg-position-y': `${settings.position_y}%`,
    '--auth-bg-scale': String(settings.scale),
    '--auth-bg-brightness': String(settings.brightness),
    '--auth-bg-contrast': String(settings.contrast),
    '--auth-bg-saturate': String(settings.saturate),
    '--auth-bg-blur': `${settings.blur}px`,
    '--auth-bg-overlay-opacity': String(settings.overlay_opacity),
  };
}

/** 合并后端返回值和默认值，保证新增字段缺省时仍可渲染。 */
export function normalizeLoginBackgroundSettings(
  settings?: Partial<LoginBackgroundSettings> | null,
): LoginBackgroundSettings {
  return {
    ...DEFAULT_LOGIN_BACKGROUND_SETTINGS,
    ...(settings ?? {}),
  };
}
