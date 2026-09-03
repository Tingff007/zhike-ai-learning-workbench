import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { isRecord } from '../utils/type-guards';

export type BackendFeatures = {
  course_ai_context: boolean;
  course_extracted_qa: boolean;
};

export function parseBackendFeatures(payload: unknown): BackendFeatures | null {
  if (!isRecord(payload) || !isRecord(payload.features)) {
    return null;
  }
  const { course_ai_context: courseAiContext, course_extracted_qa: courseExtractedQa } = payload.features;
  if (typeof courseAiContext !== 'boolean' || typeof courseExtractedQa !== 'boolean') {
    return null;
  }
  return {
    course_ai_context: courseAiContext,
    course_extracted_qa: courseExtractedQa,
  };
}

async function fetchBackendFeatures(): Promise<BackendFeatures | null> {
  try {
    const response = await fetch('/health');
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    return parseBackendFeatures(payload);
  } catch {
    return null;
  }
}

export function useBackendFeatures(): UseQueryResult<BackendFeatures | null> {
  return useQuery({
    queryKey: ['backend-health-features'],
    queryFn: fetchBackendFeatures,
    staleTime: 30_000,
    retry: 1,
  });
}
