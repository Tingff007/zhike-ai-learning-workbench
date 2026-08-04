import { useEffect, useRef } from 'react';
import { useResourceTaskStream } from './useResourceTaskStream';
import { useUiStore } from '../stores/ui.store';
import type { WorkspaceChatMessage } from '../stores/conversation.store';
import {
  buildResourceTaskPatch,
  resourceTaskSyncKey,
  upsertResourceTaskMessage,
} from '../utils/resource-task-messages';
import { resolveArtifactId } from '../utils/resolve-artifact-id';

type UpdateMessages = (updater: (items: WorkspaceChatMessage[]) => WorkspaceChatMessage[]) => void;

export function useSyncResourceTaskToChat(
  taskId: string | null,
  updateMessages: UpdateMessages,
  syncArtifactIdToUrl?: (artifactId: string | null) => void,
): void {
  const task = useResourceTaskStream(taskId);
  const updateMessagesRef = useRef(updateMessages);
  const syncArtifactIdToUrlRef = useRef(syncArtifactIdToUrl);
  const lastSyncKeyRef = useRef<string | null>(null);
  const resolvedArtifactTaskRef = useRef<string | null>(null);

  updateMessagesRef.current = updateMessages;
  syncArtifactIdToUrlRef.current = syncArtifactIdToUrl;

  useEffect(() => {
    lastSyncKeyRef.current = null;
    resolvedArtifactTaskRef.current = null;
  }, [taskId]);

  useEffect(() => {
    const data = task.data;
    if (!taskId || !data) return;

    const syncKey = resourceTaskSyncKey(taskId, data);
    if (lastSyncKeyRef.current === syncKey) return;
    lastSyncKeyRef.current = syncKey;

    const title = useUiStore.getState().artifactMeta?.title ?? '资源';
    const patch = buildResourceTaskPatch(data, title);

    updateMessagesRef.current((items) => {
      const next = upsertResourceTaskMessage(items, taskId, patch);
      return next;
    });
  }, [task.data, taskId]);

  useEffect(() => {
    const data = task.data;
    if (!taskId || !data || !['succeeded', 'completed'].includes(data.status)) return;
    if (resolvedArtifactTaskRef.current === taskId) return;
    resolvedArtifactTaskRef.current = taskId;

    void (async () => {
      const artifactId = await resolveArtifactId({
        resultResourceId: data.result_resource_id,
        resultResourceCode: data.result_resource_code,
      });
      if (!artifactId) return;

      const meta = useUiStore.getState().artifactMeta;
      updateMessagesRef.current((items) =>
        upsertResourceTaskMessage(items, taskId, { artifactId, resourceId: artifactId }),
      );
      useUiStore.getState().setActiveArtifact(artifactId, {
        title: meta?.title,
        prompt: meta?.prompt,
        resourceType: meta?.resourceType,
      });
      syncArtifactIdToUrlRef.current?.(artifactId);
    })();
  }, [task.data?.status, task.data?.result_resource_id, task.data?.result_resource_code, taskId]);
}
