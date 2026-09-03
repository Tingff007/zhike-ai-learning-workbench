import { useSessionStore } from '../stores/session.store';

type AdminCourseAccess = {
  canManageCourses: boolean;
  isAdminUser: boolean;
};

/** 知识大本营课程 API 权限（role=admin） */
export function useAdminCourseAccess(): AdminCourseAccess {
  const user = useSessionStore((state) => state.user);
  const isAdminUser = user?.role === 'admin';
  return {
    canManageCourses: isAdminUser,
    isAdminUser,
  };
}
