import { useEffect } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '../api/endpoints';
import { useCourseContextStore } from '../stores/course-context.store';
import type { CourseAiContext } from '../types';
import { useBackendFeatures } from './useBackendFeatures';

type CourseAiContextQueryResult = UseQueryResult<CourseAiContext>;
type CourseExtractedQaQueryResult = UseQueryResult<Awaited<ReturnType<typeof api.courseExtractedQa>>>;

function fallbackAiContext(courseId: string, title?: string | null): CourseAiContext {
  const courseTitle = title || '当前课程';
  return {
    course_id: courseId,
    course_title: courseTitle,
    knowledge_ready: false,
    chat_input_enabled: false,
    file_ids_count: 0,
    qa_mode: null,
    spark_version: null,
    blocking_reason: '课程 AI 上下文暂不可用，请确认后端已重启至最新版本',
    status_label: `${courseTitle} · 知识库未就绪`,
  };
}

export function useCourseAiContext(courseId: string): CourseAiContextQueryResult {
  const setAiContext = useCourseContextStore((state) => state.setAiContext);
  const courseTitle = useCourseContextStore((state) => state.currentCourseTitle);
  const featuresQuery = useBackendFeatures();
  const apiReady = featuresQuery.data?.course_ai_context === true;

  const query = useQuery<CourseAiContext>({
    queryKey: ['course-ai-context', courseId],
    queryFn: () => api.courseAiContext(courseId),
    enabled: Boolean(courseId),
    staleTime: 30_000,
    retry: false,
  });

  useEffect(() => {
    if (!courseId) {
      setAiContext(null);
      return;
    }
    if (query.data) {
      setAiContext(query.data);
      return;
    }
    if (!apiReady && featuresQuery.isFetched && query.isFetched) {
      setAiContext(fallbackAiContext(courseId, courseTitle));
    }
  }, [apiReady, courseId, courseTitle, featuresQuery.isFetched, query.data, query.isFetched, setAiContext]);

  return query;
}

export function useCourseExtractedQa(courseId: string): CourseExtractedQaQueryResult {
  const featuresQuery = useBackendFeatures();
  const apiReady = featuresQuery.data?.course_extracted_qa === true;

  return useQuery({
    queryKey: ['course-extracted-qa', courseId],
    queryFn: () => api.courseExtractedQa(courseId),
    enabled: Boolean(courseId) && (apiReady || featuresQuery.isFetched),
    staleTime: 60_000,
    retry: false,
    placeholderData: { course_id: courseId, items: [] },
  });
}
