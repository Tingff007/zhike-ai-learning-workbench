import { readLocalString, writeLocalString } from '../utils/browser-storage';

export type CodexPetDefinition = {
  id: string;
  displayName: string;
  description: string;
  kind: string;
  spritesheetUrl: string;
  sourceUrl?: string;
};

export type CodexPetVisibilityPayload = {
  visible: boolean;
};

export const codexPetStorageKey = 'zhike-codex-pet-id';
export const codexPetChangedEventName = 'zhike-codex-pet-changed';
export const codexPetVisibleStorageKey = 'zhike-codex-pet-visible';
export const codexPetVisibilityChangedEventName = 'zhike-codex-pet-visibility-changed';

export const codexPetCatalog: CodexPetDefinition[] = [
  {
    id: 'xiaoba',
    displayName: '小八',
    description: '蓝耳帽、圆滚身体和元气表情的学习伙伴。',
    kind: 'object',
    spritesheetUrl: '/pets/xiaoba/spritesheet.webp',
  },
  {
    id: 'stlulu',
    displayName: 'lulu',
    description: '黄色橙调的元气小伙伴，圆头大眼，头顶带果实般的小呆毛。',
    kind: 'animal',
    spritesheetUrl: '/pets/stlulu/spritesheet.webp',
    sourceUrl: 'https://codex-pets.net/#/pets/stlulu',
  },
  {
    id: 'duodong',
    displayName: '多栋',
    description: '疯疯癫癫、会使坏但可爱的比格犬桌面伙伴。',
    kind: 'creature',
    spritesheetUrl: '/pets/duodong/spritesheet.webp',
    sourceUrl: 'https://codex-pets.net/#/pets/duodong',
  },
  {
    id: 'usagi',
    displayName: 'Usagi',
    description: '奶油色圆滚滚小兔子，长耳朵、红脸颊和小猫嘴表情。',
    kind: 'creature',
    spritesheetUrl: '/pets/usagi/spritesheet.webp',
    sourceUrl: 'https://codex-pets.net/#/pets/usagi',
  },
  {
    id: 'jiyi',
    displayName: 'Jiyi',
    description: '白色圆滚滚的迷你伙伴，表情柔软害羞，适合安静陪学。',
    kind: 'creature',
    spritesheetUrl: '/pets/jiyi/spritesheet.webp',
    sourceUrl: 'https://codex-pets.net/#/pets/jiyi',
  },
];

const defaultCodexPet = codexPetCatalog[0];

function resolveCodexPetVisible(value: string | null): boolean {
  return value !== 'false';
}

/** 根据宠物 ID 返回可用配置，无法识别时回退到默认宠物。 */
export function resolveCodexPet(id?: string | null): CodexPetDefinition {
  return codexPetCatalog.find((pet) => pet.id === id) ?? defaultCodexPet;
}

/** 从本地存储读取当前选中的 Codex Pet，读取失败时使用默认宠物。 */
export function readSelectedCodexPet(): CodexPetDefinition {
  return resolveCodexPet(readLocalString(codexPetStorageKey));
}

/** 从本地存储读取宠物是否显示，读取失败时默认显示。 */
export function readCodexPetVisible(): boolean {
  return resolveCodexPetVisible(readLocalString(codexPetVisibleStorageKey));
}

/** 保存当前选中的 Codex Pet，并通知同页组件立即刷新。 */
export function saveSelectedCodexPet(petId: string): CodexPetDefinition {
  const pet = resolveCodexPet(petId);
  if (typeof window === 'undefined') return pet;
  writeLocalString(codexPetStorageKey, pet.id);
  window.dispatchEvent(new CustomEvent<CodexPetDefinition>(codexPetChangedEventName, { detail: pet }));
  return pet;
}

/** 保存宠物显示开关，并通知同页组件立即刷新。 */
export function saveCodexPetVisibility(visible: boolean): boolean {
  if (typeof window === 'undefined') return visible;
  writeLocalString(codexPetVisibleStorageKey, String(visible));
  window.dispatchEvent(new CustomEvent<CodexPetVisibilityPayload>(codexPetVisibilityChangedEventName, { detail: { visible } }));
  return visible;
}
