import { useCallback } from 'react';
import { api } from '../api/endpoints';
import { useChatdocDesignMode } from './useChatdocDesignMode';
import { useOnlineStatus } from './useOnlineStatus';
import { knowledgeIntegrationCopy as kb } from '../config/knowledgeIntegration';

export type ChatdocSubmitGuardBlock = {
  ok: false;
  title: string;
  description: string;
};

export type ChatdocSubmitGuardOk = { ok: true };

export type ChatdocSubmitGuardResult = ChatdocSubmitGuardOk | ChatdocSubmitGuardBlock;

type AssertOptions = {
  requireCourse?: boolean;
  courseId?: string | null;
  skipBackendProbe?: boolean;
};

type ChatdocSubmitGuardHookResult = {
  assertReady: (options?: AssertOptions) => Promise<ChatdocSubmitGuardResult>;
  isOnline: boolean;
  configured: boolean;
  designModeActive: boolean;
};

export function useChatdocSubmitGuard(): ChatdocSubmitGuardHookResult {
  const isOnline = useOnlineStatus();
  const { configured, isLoading, designMode } = useChatdocDesignMode();

  const assertReady = useCallback(
    async (options: AssertOptions = {}): Promise<ChatdocSubmitGuardResult> => {
      if (!isOnline) {
        return {
          ok: false,
          title: kb.submitGuardOfflineTitle,
          description: kb.submitGuardOfflineBody,
        };
      }

      if (options.requireCourse && !options.courseId) {
        return {
          ok: false,
          title: kb.submitGuardCourseTitle,
          description: kb.submitGuardCourseBody,
        };
      }

      if (designMode) {
        return {
          ok: false,
          title: kb.submitGuardChatdocTitle,
          description: kb.submitGuardChatdocBody,
        };
      }

      if (isLoading) {
        return {
          ok: false,
          title: kb.submitGuardLoadingTitle,
          description: kb.submitGuardLoadingBody,
        };
      }

      if (!configured) {
        return {
          ok: false,
          title: kb.submitGuardChatdocTitle,
          description: kb.submitGuardChatdocBody,
        };
      }

      if (!options.skipBackendProbe) {
        const healthy = await api.checkBackendHealth();
        if (!healthy) {
          return {
            ok: false,
            title: kb.submitGuardBackendTitle,
            description: kb.submitGuardBackendBody,
          };
        }
      }

      return { ok: true };
    },
    [configured, designMode, isLoading, isOnline],
  );

  return { assertReady, isOnline, configured, designModeActive: designMode };
}
