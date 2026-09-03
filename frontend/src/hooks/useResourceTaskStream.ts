import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/endpoints';
import { buildResourceWebSocketUrl } from '../api/ws';
import { getAuthToken } from '../stores/session.store';
import type { ResourceGenerationTask } from '../types';
import {
  isTerminalResourceTaskStatus,
  mergeResourceGenerationTask,
  parseResourceTaskStreamPayload,
} from '../utils/resource-task-stream';
import { useResourceTask } from './useCourseData';
import { useOnlineStatus } from './useOnlineStatus';

export type ResourceStreamMode = 'idle' | 'live' | 'polling' | 'offline';

type ResourceTaskStreamResult = Omit<ReturnType<typeof useResourceTask>, 'data'> & {
  data: ResourceGenerationTask | undefined;
  isLive: boolean;
  streamMode: ResourceStreamMode;
};

/** 订阅资源生成任务的实时进度，并在 WebSocket 不可用时降级为 REST 轮询。 */
export function useResourceTaskStream(taskId?: string | null): ResourceTaskStreamResult {
  const isOnline = useOnlineStatus();
  const query = useResourceTask(taskId, { enabled: isOnline });
  const queryClient = useQueryClient();
  const [liveTask, setLiveTask] = useState<ResourceGenerationTask | null>(null);
  const [streamMode, setStreamMode] = useState<ResourceStreamMode>('idle');
  const socketRef = useRef<WebSocket | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setLiveTask(null);
    setStreamMode('idle');
    if (!taskId) return undefined;
    if (!isOnline) {
      setStreamMode('offline');
      return undefined;
    }

    let cancelled = false;
    const taskQueryKey = ['resource-task', taskId] as const;

    const readCachedTask = (): ResourceGenerationTask | undefined =>
      queryClient.getQueryData<ResourceGenerationTask>(taskQueryKey);

    const applyPayload = (payload: Record<string, unknown>): void => {
      if (payload.type !== 'resource_generation_progress') return;
      const { type: _type, event: _event, ...taskPayload } = payload;
      setLiveTask((current) => mergeResourceGenerationTask(readCachedTask() ?? current ?? undefined, taskPayload));
      if (isTerminalResourceTaskStatus(taskPayload.status)) {
        queryClient.invalidateQueries({ queryKey: taskQueryKey });
      }
    };

    const startRestFallback = (): void => {
      if (!isOnline || cancelled) return;
      setStreamMode('polling');
      if (fallbackTimerRef.current !== null) return;
      const poll = () => {
        if (cancelled || !isOnline) return;
        void queryClient.fetchQuery({
          queryKey: taskQueryKey,
          queryFn: () => api.resourceTask(taskId),
        }).then((data) => {
          if (data) {
            setLiveTask((current) => mergeResourceGenerationTask(current ?? undefined, data));
            if (isTerminalResourceTaskStatus(data.status)) {
              if (fallbackTimerRef.current !== null) {
                window.clearInterval(fallbackTimerRef.current);
                fallbackTimerRef.current = null;
              }
            }
          }
        }).catch(() => {
          // 暂时性失败继续轮询；用户可见错误由 API 客户端或页面状态统一处理。
        });
      };
      poll();
      fallbackTimerRef.current = window.setInterval(poll, 2500);
    };

    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(buildResourceWebSocketUrl(taskId));
      socketRef.current = socket;
      setStreamMode('live');
    } catch {
      startRestFallback();
      return () => {
        cancelled = true;
        if (fallbackTimerRef.current !== null) {
          window.clearInterval(fallbackTimerRef.current);
          fallbackTimerRef.current = null;
        }
      };
    }

    socket.onmessage = (event): void => {
      if (cancelled) return;
      const payload = parseResourceTaskStreamPayload(String(event.data));
      if (!payload) {
        // 忽略格式异常的实时帧，避免单条坏消息中断轮询兜底。
        return;
      }
      if (payload.type === 'auth_required') {
        const token = getAuthToken();
        if (!token) {
          cancelled = true;
          setStreamMode('idle');
          socket?.close();
          return;
        }
        socket?.send(JSON.stringify({ type: 'auth', token }));
        return;
      }
      if (payload.type === 'auth_failed' || payload.type === 'error') {
        startRestFallback();
        return;
      }
      if (payload.type === 'auth_ok') return;
      applyPayload(payload);
    };

    socket.onerror = () => {
      startRestFallback();
    };

    socket.onclose = () => {
      if (!cancelled) {
        queryClient.invalidateQueries({ queryKey: ['resource-task', taskId] });
        startRestFallback();
      }
    };

    return () => {
      cancelled = true;
      socket?.close();
      socketRef.current = null;
      if (fallbackTimerRef.current !== null) {
        window.clearInterval(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };
  }, [isOnline, queryClient, taskId]);

  const data = liveTask ?? query.data;

  return {
    ...query,
    data,
    isLive: streamMode === 'live' && Boolean(liveTask),
    streamMode,
  };
}
