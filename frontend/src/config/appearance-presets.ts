import type { AppearanceTheme } from './appearance';

/**
 * 外观主题预设库。
 * 图片预设使用平台文生图 API 生成，颜色预设使用纯色或渐变。
 * 所有预设均为前端硬编码，无需后端配置。
 */

/** 单个预设项定义。 */
export interface PresetItem {
  /** 预设唯一 ID，用于 localStorage 引用。 */
  id: string;
  /** 预设类型：image 为壁纸图，color 为纯色/渐变。 */
  type: 'image' | 'color';
  /** 展示名称。 */
  label: string;
  /** 背景值：image 为图片 URL，color 为 CSS 颜色或渐变。 */
  value: string;
  /** 缩略图：image 用同图小尺寸，color 用色块。 */
  thumb: string;
  /** 该预设推荐的文字明暗模式。 */
  defaultTheme: AppearanceTheme;
  /** 简短描述，用于卡片悬浮提示。 */
  description: string;
}

/** 文生图 API 基础地址，按 Image Guidelines 要求使用。 */
const TEXT_TO_IMAGE_BASE = 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image';

/** 构造文生图 URL，prompt 会被 URL 编码。 */
function buildImageUrl(prompt: string): string {
  return `${TEXT_TO_IMAGE_BASE}?prompt=${encodeURIComponent(prompt)}&image_size=landscape_16_9`;
}

/** 学生端 overlay 页头通栏背景默认图（薄荷森林），与产品默认视觉一致。 */
export const DEFAULT_OVERLAY_HERO_IMAGE_URL = buildImageUrl(
  'A soft mint green forest in morning mist, gentle sunlight filtering through leaves, fresh and calm atmosphere, cinematic wide shot, no text',
);

/** 预设壁纸列表。 */
export const PRESET_IMAGES: PresetItem[] = [
  {
    id: 'img-aurora',
    type: 'image',
    label: '极光',
    value: buildImageUrl('A serene aurora borealis over snow-covered mountains, deep teal and purple sky, soft gradient, cinematic wide shot, high detail, atmospheric, no text'),
    thumb: buildImageUrl('A serene aurora borealis over snow-covered mountains, deep teal and purple sky, soft gradient, cinematic wide shot, high detail, atmospheric, no text'),
    defaultTheme: 'dark',
    description: '极地夜空下的极光，适合深色文字',
  },
  {
    id: 'img-midnight',
    type: 'image',
    label: '午夜星空',
    value: buildImageUrl('A deep midnight starry sky with subtle nebula in indigo and black, soft stars scattered, minimalist calm atmosphere, cinematic wide shot, no text'),
    thumb: buildImageUrl('A deep midnight starry sky with subtle nebula in indigo and black, soft stars scattered, minimalist calm atmosphere, cinematic wide shot, no text'),
    defaultTheme: 'dark',
    description: '深邃午夜星空，适合深色文字',
  },
  {
    id: 'img-mint-forest',
    type: 'image',
    label: '薄荷森林',
    value: buildImageUrl('A soft mint green forest in morning mist, gentle sunlight filtering through leaves, fresh and calm atmosphere, cinematic wide shot, no text'),
    thumb: buildImageUrl('A soft mint green forest in morning mist, gentle sunlight filtering through leaves, fresh and calm atmosphere, cinematic wide shot, no text'),
    defaultTheme: 'light',
    description: '晨雾中的薄荷绿森林，适合亮色文字',
  },
  {
    id: 'img-warm-study',
    type: 'image',
    label: '暖阳书房',
    value: buildImageUrl('A cozy warm sunlit study room with wooden bookshelves, soft amber light, peaceful afternoon atmosphere, cinematic wide shot, no text'),
    thumb: buildImageUrl('A cozy warm sunlit study room with wooden bookshelves, soft amber light, peaceful afternoon atmosphere, cinematic wide shot, no text'),
    defaultTheme: 'light',
    description: '暖阳下的书房，适合亮色文字',
  },
  {
    id: 'img-deep-coral',
    type: 'image',
    label: '深海珊瑚',
    value: buildImageUrl('A dreamy underwater scene with soft coral reef in teal and pink, gentle light rays through water, calm and serene, cinematic wide shot, no text'),
    thumb: buildImageUrl('A dreamy underwater scene with soft coral reef in teal and pink, gentle light rays through water, calm and serene, cinematic wide shot, no text'),
    defaultTheme: 'dark',
    description: '深海珊瑚梦境，适合深色文字',
  },
  {
    id: 'img-sakura',
    type: 'image',
    label: '樱花春日',
    value: buildImageUrl('A soft pink sakura blossom field in spring, gentle bokeh, warm pastel tones, dreamy and peaceful, cinematic wide shot, no text'),
    thumb: buildImageUrl('A soft pink sakura blossom field in spring, gentle bokeh, warm pastel tones, dreamy and peaceful, cinematic wide shot, no text'),
    defaultTheme: 'light',
    description: '春日樱花田，适合亮色文字',
  },
];

/** 预设颜色/渐变列表。 */
export const PRESET_COLORS: PresetItem[] = [
  {
    id: 'color-mint',
    type: 'color',
    label: '薄荷',
    value: '#eef7f2',
    thumb: '#eef7f2',
    defaultTheme: 'light',
    description: '清新薄荷绿',
  },
  {
    id: 'color-ink',
    type: 'color',
    label: '墨黑',
    value: '#0f172a',
    thumb: '#0f172a',
    defaultTheme: 'dark',
    description: '深夜墨黑',
  },
  {
    id: 'color-sunset',
    type: 'color',
    label: '日落',
    value: 'linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)',
    thumb: 'linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)',
    defaultTheme: 'light',
    description: '温暖日落渐变',
  },
  {
    id: 'color-mist',
    type: 'color',
    label: '晨雾',
    value: 'linear-gradient(135deg, #c2e9fb 0%, #a1c4fd 100%)',
    thumb: 'linear-gradient(135deg, #c2e9fb 0%, #a1c4fd 100%)',
    defaultTheme: 'light',
    description: '清冷晨雾蓝',
  },
  {
    id: 'color-peach',
    type: 'color',
    label: '蜜桃',
    value: 'linear-gradient(135deg, #fecdca 0%, #fda4af 100%)',
    thumb: 'linear-gradient(135deg, #fecdca 0%, #fda4af 100%)',
    defaultTheme: 'light',
    description: '甜美蜜桃粉',
  },
  {
    id: 'color-indigo',
    type: 'color',
    label: '靛蓝',
    value: 'linear-gradient(135deg, #1e3a8a 0%, #312e81 100%)',
    thumb: 'linear-gradient(135deg, #1e3a8a 0%, #312e81 100%)',
    defaultTheme: 'dark',
    description: '深邃靛蓝',
  },
  {
    id: 'color-matcha',
    type: 'color',
    label: '抹茶',
    value: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
    thumb: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
    defaultTheme: 'light',
    description: '清雅抹茶绿',
  },
  {
    id: 'color-twilight',
    type: 'color',
    label: '暮紫',
    value: 'linear-gradient(135deg, #4c1d95 0%, #831843 100%)',
    thumb: 'linear-gradient(135deg, #4c1d95 0%, #831843 100%)',
    defaultTheme: 'dark',
    description: '神秘暮紫',
  },
];

/** 所有预设合并列表，用于查表。 */
export const ALL_PRESETS: PresetItem[] = [...PRESET_IMAGES, ...PRESET_COLORS];

/** 根据预设 ID 查找预设项，找不到时返回 null。 */
export function resolvePreset(presetId?: string): PresetItem | null {
  if (!presetId) return null;
  return ALL_PRESETS.find((item) => item.id === presetId) ?? null;
}

/**
 * 根据预设 ID 解析出 CSS background-image 值。
 * 图片预设返回 url(...)，颜色预设返回颜色/渐变字符串。
 * 找不到时返回 'none'。
 */
export function resolvePresetValue(presetId?: string): string {
  const preset = resolvePreset(presetId);
  if (!preset) return 'none';
  if (preset.type === 'image') return `url("${preset.value}")`;
  return preset.value;
}
