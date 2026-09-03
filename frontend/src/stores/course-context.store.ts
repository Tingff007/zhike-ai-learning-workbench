import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { CourseAiContext } from '../types';
import type { LearningScope } from '../constants/learning-scope';
import { readLocalJson, writeLocalJson } from '../utils/browser-storage';
import { isRecord } from '../utils/type-guards';

const COURSE_CONTEXT_KEY = 'zhike_workspace_course_context';

type PersistedCourseContext = {
  currentCourseId: string;
  currentCourseTitle: string;
  learningScope: LearningScope;
};

function isPersistedCourseContext(value: unknown): value is PersistedCourseContext {
  if (!isRecord(value)) return false;
  return typeof value.currentCourseId === 'string'
    && typeof value.currentCourseTitle === 'string'
    && (value.learningScope === 'course' || value.learningScope === 'general');
}

function readPersistedCourseContext(): PersistedCourseContext | null {
  const parsed = readLocalJson<PersistedCourseContext | null>(
    COURSE_CONTEXT_KEY,
    null,
    (value): value is PersistedCourseContext | null => isPersistedCourseContext(value),
  );
  if (!parsed) return null;
  return {
    currentCourseId: parsed.currentCourseId,
    currentCourseTitle: parsed.currentCourseTitle,
    learningScope: parsed.learningScope,
  };
}

function writePersistedCourseContext(context: PersistedCourseContext): void {
  writeLocalJson(COURSE_CONTEXT_KEY, context);
}

const persistedCourseContext = readPersistedCourseContext();

export type CourseContextState = {
  currentCourseId: string;
  currentCourseTitle: string;
  learningScope: LearningScope;
  aiContext: CourseAiContext | null;
  setCurrentCourse: (id: string, title: string) => void;
  setGeneralMode: () => void;
  setAiContext: (context: CourseAiContext | null) => void;
};

export const useCourseContextStore: UseBoundStore<StoreApi<CourseContextState>> = create<CourseContextState>((set) => ({
  currentCourseId: persistedCourseContext?.currentCourseId ?? '',
  currentCourseTitle: persistedCourseContext?.currentCourseTitle ?? '',
  learningScope: persistedCourseContext?.learningScope ?? 'general',
  aiContext: null,
  setCurrentCourse: (id, title) => {
    if (!id) {
      const next = {
        currentCourseId: '',
        currentCourseTitle: title || '通用学习',
        learningScope: 'general' as const,
        aiContext: null,
      };
      writePersistedCourseContext({
        currentCourseId: next.currentCourseId,
        currentCourseTitle: next.currentCourseTitle,
        learningScope: next.learningScope,
      });
      set(next);
      return;
    }
    const next = {
      currentCourseId: id,
      currentCourseTitle: title,
      learningScope: 'course' as const,
      aiContext: null,
    };
    writePersistedCourseContext({
      currentCourseId: next.currentCourseId,
      currentCourseTitle: next.currentCourseTitle,
      learningScope: next.learningScope,
    });
    set(next);
  },
  setGeneralMode: () => {
    const next = {
      currentCourseId: '',
      currentCourseTitle: '通用学习',
      learningScope: 'general' as const,
      aiContext: null,
    };
    writePersistedCourseContext({
      currentCourseId: next.currentCourseId,
      currentCourseTitle: next.currentCourseTitle,
      learningScope: next.learningScope,
    });
    set(next);
  },
  setAiContext: (aiContext) => set({ aiContext }),
}));

export function useIsCourseLearningMode(): boolean {
  const learningScope = useCourseContextStore((state) => state.learningScope);
  const currentCourseId = useCourseContextStore((state) => state.currentCourseId);
  return learningScope === 'course' && Boolean(currentCourseId);
}
