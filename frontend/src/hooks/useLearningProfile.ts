import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '../api/endpoints';
import { GENERAL_CONVERSATION_KEY } from '../constants/learning-scope';
import { useCourseContextStore } from '../stores/course-context.store';
import { serverConversationId, useConversationStore } from '../stores/conversation.store';
import type { LearningProfileScope } from '../types';

type LearningProfileQueryResult = UseQueryResult<Awaited<ReturnType<typeof api.learningProfile>>>;

type LearningProfileHookResult = {
  activeScope: LearningProfileScope;
  setActiveScope: Dispatch<SetStateAction<LearningProfileScope>>;
  profileQuery: LearningProfileQueryResult;
  hasCourse: boolean;
  activeCourseId: string | null;
  courseTitle: string | null;
};

export function useLearningProfile(): LearningProfileHookResult {
  const courseId = useCourseContextStore((state) => state.currentCourseId);
  const courseTitle = useCourseContextStore((state) => state.currentCourseTitle);
  const learningScope = useCourseContextStore((state) => state.learningScope);
  const hasCourse = learningScope === 'course' && Boolean(courseId);
  const storageKey = hasCourse && courseId ? courseId : GENERAL_CONVERSATION_KEY;
  const activeSessionId = useConversationStore((state) => state.activeSessionByCourse[storageKey] ?? null);
  const conversationId = serverConversationId(activeSessionId);
  const defaultScope: LearningProfileScope = hasCourse ? 'course' : 'global';

  const [activeScope, setActiveScope] = useState<LearningProfileScope>(defaultScope);

  useEffect(() => {
    setActiveScope(hasCourse ? 'course' : 'global');
  }, [hasCourse, courseId, learningScope]);

  const profileQuery = useQuery({
    queryKey: ['learning-profile', activeScope, courseId || 'general', conversationId || 'latest'],
    queryFn: () => api.learningProfile({
      courseId: hasCourse ? courseId : null,
      courseTitle: courseTitle || null,
      scope: activeScope,
      conversationId,
    }),
    enabled: true,
    staleTime: 3 * 60 * 1000,
  });

  return {
    activeScope,
    setActiveScope,
    profileQuery,
    hasCourse,
    activeCourseId: courseId || null,
    courseTitle: courseTitle || null,
  };
}
