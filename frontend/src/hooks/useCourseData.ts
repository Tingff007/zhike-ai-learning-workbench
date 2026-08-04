import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { api, type AssessmentPayload, type ChatPayload, type ResourceGeneratePayload } from '../api/endpoints';
import { useCourseContextStore } from '../stores/course-context.store';
import { useOnlineStatus } from './useOnlineStatus';

type CourseQueriesOptions = { includeResources?: boolean };

type CourseQueriesResult = {
  courseId: string;
  concepts: UseQueryResult<Awaited<ReturnType<typeof api.concepts>>>;
  path: UseQueryResult<Awaited<ReturnType<typeof api.path>>>;
  mastery: UseQueryResult<Awaited<ReturnType<typeof api.mastery>>>;
  profile: UseQueryResult<Awaited<ReturnType<typeof api.profile>>>;
  resources: UseQueryResult<Awaited<ReturnType<typeof api.resources>>>;
};

type GenerateResourceMutationResult = UseMutationResult<Awaited<ReturnType<typeof api.generateResource>>, Error, ResourceGeneratePayload>;
type ResourceTaskQueryResult = UseQueryResult<Awaited<ReturnType<typeof api.resourceTask>>>;
type SubmitAssessmentMutationResult = UseMutationResult<Awaited<ReturnType<typeof api.submitAssessment>>, Error, AssessmentPayload>;
type ChatMutationResult = UseMutationResult<Awaited<ReturnType<typeof api.chat>>, Error, ChatPayload>;

export function useCurrentCourseId(): string {
  return useCourseContextStore((state) => state.currentCourseId);
}

export function useCourseQueries(options: CourseQueriesOptions = {}): CourseQueriesResult {
  const courseId = useCurrentCourseId();
  const includeResources = options.includeResources ?? true;
  return {
    courseId,
    concepts: useQuery({ queryKey: ['concepts', courseId], queryFn: () => api.concepts(courseId), enabled: Boolean(courseId) }),
    path: useQuery({ queryKey: ['path', courseId], queryFn: () => api.path(courseId), enabled: Boolean(courseId), staleTime: 5 * 60 * 1000 }),
    mastery: useQuery({ queryKey: ['mastery', courseId], queryFn: () => api.mastery(courseId), enabled: Boolean(courseId) }),
    profile: useQuery({ queryKey: ['profile', courseId], queryFn: () => api.profile(courseId), enabled: Boolean(courseId) }),
    resources: useQuery({ queryKey: ['resources', courseId], queryFn: () => api.resources(courseId), enabled: Boolean(courseId && includeResources) }),
  };
}

export function useGenerateResourceMutation(): GenerateResourceMutationResult {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ResourceGeneratePayload) => api.generateResource(payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['resources', variables.course_id] });
      queryClient.invalidateQueries({ queryKey: ['resource-tasks', variables.course_id] });
      queryClient.invalidateQueries({ queryKey: ['learning-profile'] });
    },
  });
}

export function useResourceTask(taskId?: string | null, options: { enabled?: boolean } = {}): ResourceTaskQueryResult {
  const isOnline = useOnlineStatus();
  const enabled = Boolean(taskId) && isOnline && (options.enabled ?? true);
  return useQuery({
    queryKey: ['resource-task', taskId],
    queryFn: () => api.resourceTask(taskId!),
    enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return enabled &&
        (status === 'queued' ||
          status === 'planning' ||
          status === 'retrieving' ||
          status === 'running' ||
          status === 'generating' ||
          status === 'verifying' ||
          status === 'safety_checking')
        ? 1200
        : false;
    },
  });
}

export function useSubmitAssessmentMutation(): SubmitAssessmentMutationResult {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AssessmentPayload) => api.submitAssessment(payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['mastery', variables.course_id] });
      queryClient.invalidateQueries({ queryKey: ['profile', variables.course_id] });
      queryClient.invalidateQueries({ queryKey: ['path', variables.course_id] });
      queryClient.invalidateQueries({ queryKey: ['learning-profile'] });
      queryClient.invalidateQueries({ queryKey: ['learning-schedules'] });
    },
  });
}

export function useChatMutation(): ChatMutationResult {
  return useMutation({ mutationFn: (payload: ChatPayload) => api.chat(payload) });
}
