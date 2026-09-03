import { describe, expect, it, vi } from 'vitest';
import { isBrokenWindowCanvas, roleFromWorkspacePath, resolveCanvas, syncWorkspaceRoleFromPath } from './workspaceCanvasRegistry';

describe('workspaceCanvasRegistry', (): void => {
  it('按管理端路由解析画布、角色和展示模式', (): void => {
    expect(resolveCanvas('/admin/model-gateway/providers')).toMatchObject({
      canvas: 'gateway',
      role: 'admin',
      mode: 'overlay',
    });

    expect(resolveCanvas('/admin/chatdoc-config')).toMatchObject({
      canvas: 'knowledge',
      role: 'admin',
      mode: 'overlay',
    });
  });

  it('按学生端路由解析覆盖层和独立对话画布', (): void => {
    expect(resolveCanvas('/resource-hall?scope=all')).toMatchObject({
      canvas: 'hall',
      role: 'student',
      mode: 'overlay',
    });

    expect(resolveCanvas('/dashboard')).toMatchObject({
      canvas: 'dashboard',
      role: 'student',
      mode: 'standalone',
    });
  });

  it('未知路由回退到学生独立对话画布', (): void => {
    expect(resolveCanvas('/unknown')).toMatchObject({
      canvas: 'dashboard',
      role: 'student',
      mode: 'standalone',
    });
  });

  it('识别五个破窗 overlay 画布', (): void => {
    expect(isBrokenWindowCanvas('path')).toBe(true);
    expect(isBrokenWindowCanvas('calendar')).toBe(true);
    expect(isBrokenWindowCanvas('hall')).toBe(true);
    expect(isBrokenWindowCanvas('profile')).toBe(true);
    expect(isBrokenWindowCanvas('announcements')).toBe(true);
    expect(isBrokenWindowCanvas('assessment')).toBe(false);
    expect(isBrokenWindowCanvas('settings')).toBe(false);
  });

  it('只在明确角色路由同步工作台角色', (): void => {
    const setCurrentRole = vi.fn();

    expect(roleFromWorkspacePath('/admin/course-builder')).toBe('admin');
    expect(roleFromWorkspacePath('/learning-path')).toBe('student');
    expect(roleFromWorkspacePath('/dashboard')).toBeNull();

    syncWorkspaceRoleFromPath('/dashboard', setCurrentRole);
    expect(setCurrentRole).not.toHaveBeenCalled();

    syncWorkspaceRoleFromPath('/admin/resource-review', setCurrentRole);
    expect(setCurrentRole).toHaveBeenCalledWith('admin');
  });
});
