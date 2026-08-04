import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Megaphone,
  ShieldAlert,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { AnnouncementDisplayType, AnnouncementPriority } from '../../types';

export const announcementPriorityLabel: Record<string, string> = {
  info: '普通通知',
  success: '成功提示',
  warning: '警告提醒',
  critical: '严重公告',
  maintenance: '系统维护',
};

export const announcementDisplayLabel: Record<string, string> = {
  top_bar: '顶部公告条',
  modal: '弹窗公告',
  page_card: '页面卡片',
  toast: 'Toast 轻提示',
  list_only: '列表沉淀',
};

export const announcementAudienceLabel: Record<string, string> = {
  all: '全部用户',
  student: '用户模式',
  admin: '管理员',
};

export const announcementStatusLabel: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
  deleted: '已删除',
};

export function getAnnouncementIcon(priority?: string): LucideIcon {
  if (priority === 'critical') return ShieldAlert;
  if (priority === 'maintenance') return Wrench;
  if (priority === 'warning') return AlertTriangle;
  if (priority === 'success') return CheckCircle2;
  if (priority === 'info') return Info;
  return Megaphone;
}

export function getDefaultDisplayType(priority: AnnouncementPriority): AnnouncementDisplayType {
  if (priority === 'critical') return 'modal';
  if (priority === 'maintenance') return 'top_bar';
  if (priority === 'warning') return 'top_bar';
  if (priority === 'success') return 'toast';
  return 'page_card';
}
