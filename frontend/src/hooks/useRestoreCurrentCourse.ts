import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/endpoints';
import { useCourseContextStore } from '../stores/course-context.store';

const readableCourseTitles: Record<string, string> = {
  deep_learning_001: '深度学习',
  machine_learning_001: '机器学习',
  ai_intro_001: '人工智能导论',
};

function resolveCourseTitle(courseId: string, title?: string | null): string {
  return readableCourseTitles[courseId] ?? title ?? courseId;
}

/** 刷新后从服务端 current-course 与课程列表恢复课程上下文，避免落回通用学习。 */
export function useRestoreCurrentCourse(): void {
  const queryClient = useQueryClient();
  const learningScope = useCourseContextStore((state) => state.learningScope);
  const currentCourseId = useCourseContextStore((state) => state.currentCourseId);
  const currentCourseTitle = useCourseContextStore((state) => state.currentCourseTitle);
  const setCurrentCourse = useCourseContextStore((state) => state.setCurrentCourse);
  const syncedRef = useRef(false);

  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;

    void (async () => {
      try {
        const { course_id: serverCourseId } = await api.currentCourse();
        if (!serverCourseId) return;

        const state = useCourseContextStore.getState();
        if (state.learningScope === 'general' && !state.currentCourseId) {
          return;
        }

        const targetId = state.currentCourseId || serverCourseId;
        if (serverCourseId !== targetId && state.currentCourseId) {
          return;
        }

        const courses =
          queryClient.getQueryData<{ items: Array<{ id: string; title?: string | null }> }>(['courses', 'selectable'])
            ?.items ??
          queryClient.getQueryData<{ items: Array<{ id: string; title?: string | null }> }>(['courses', 'admin'])?.items;

        const matched = courses?.find((course) => course.id === serverCourseId);
        const title = resolveCourseTitle(serverCourseId, matched?.title ?? state.currentCourseTitle);

        if (state.currentCourseId !== serverCourseId || state.learningScope !== 'course') {
          setCurrentCourse(serverCourseId, title);
        } else if (!state.currentCourseTitle.trim()) {
          setCurrentCourse(serverCourseId, title);
        }
      } catch {
        // 离线或后端未就绪时保留本地持久化结果。
      }
    })();
  }, [currentCourseId, currentCourseTitle, learningScope, queryClient, setCurrentCourse]);
}
