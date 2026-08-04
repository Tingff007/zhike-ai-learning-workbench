import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { buildAiWebSocketUrl } from '../api/ws';
import { getAuthToken, useSessionStore } from '../stores/session.store';
import type { AgentTraceEvent, ChatQuality, Citation, ExtractedQaSuggestion, SuggestedAction } from '../types';
import type { OnboardingMetadata } from '../types/onboarding';
import {
  browserIsOffline,
  normalizeStreamError,
  parseChatStreamEvent,
  websocketUnavailableMessage,
} from '../utils/chat-stream-events';
import {
  buildChatStreamPayload,
  isGeneralChatStreamRequest,
  type ChatStreamRequest,
} from '../utils/chat-stream-payload';

export type { ChatStreamRequest } from '../utils/chat-stream-payload';

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 800;

export type UseChatStreamOptions = {
  onTrace?: (event: AgentTraceEvent) => void;
  onCitation?: (citations: Citation[]) => void;
  onDelta?: (delta: string) => void;
  onSuggestedActions?: (actions: SuggestedAction[]) => void;
  onQuality?: (quality: ChatQuality) => void;
  onSessionStarted?: (conversationId: string) => void;
  onExtractedQaSuggestions?: (items: ExtractedQaSuggestion[]) => void;
  onOnboardingUpdate?: (meta: OnboardingMetadata) => void;
  onDone?: (payload: {
    conversationId: string;
    answer: string;
    citations: Citation[];
    agentTrace: AgentTraceEvent[];
    suggestedActions: SuggestedAction[];
    quality?: ChatQuality;
    resourceTaskId?: string | null;
    route?: string | null;
    onboardingMeta?: OnboardingMetadata;
  }) => void;
  onError?: (message: string) => void;
};

type UseChatStreamResult = {
  send: (request: ChatStreamRequest) => void;
  stop: () => void;
  isStreaming: boolean;
  streamStatus: string;
  setStreamStatus: Dispatch<SetStateAction<string>>;
};

export function useChatStream(options: UseChatStreamOptions = {}): UseChatStreamResult {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const socketRef = useRef<WebSocket | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamStatus, setStreamStatus] = useState('');

  const stop = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'stop' }));
    }
    socket.close();
    socketRef.current = null;
    setIsStreaming(false);
    setStreamStatus('已停止生成');
  }, []);

  const send = useCallback((request: ChatStreamRequest) => {
    stop();
    if (browserIsOffline()) {
      setIsStreaming(false);
      setStreamStatus('当前无网络连接');
      optionsRef.current.onError?.(websocketUnavailableMessage());
      return;
    }

    setIsStreaming(true);
    const isGeneral = isGeneralChatStreamRequest(request);
    setStreamStatus('正在连接 AI 实时服务...');

    let reconnectAttempts = 0;
    let chatSubmitted = false;
    let terminalClose = false;
    const chatPayload = buildChatStreamPayload(request);

    const connect = (): void => {
      if (browserIsOffline()) {
        terminalClose = true;
        setIsStreaming(false);
        setStreamStatus('当前无网络连接');
        optionsRef.current.onError?.(websocketUnavailableMessage());
        return;
      }

      let socket: WebSocket;
      try {
        socket = new WebSocket(buildAiWebSocketUrl(request.conversation_id));
      } catch {
        terminalClose = true;
        setIsStreaming(false);
        setStreamStatus('实时通道创建失败');
        optionsRef.current.onError?.(websocketUnavailableMessage());
        return;
      }
      socketRef.current = socket;
      chatSubmitted = false;

      const submitChat = (): void => {
        if (chatSubmitted || socket.readyState !== WebSocket.OPEN) return;
        chatSubmitted = true;
        setStreamStatus(isGeneral ? '已连接，正在提交通用学习问题...' : '已连接，正在提交课程问题...');
        socket.send(JSON.stringify(chatPayload));
      };

      socket.onmessage = (event): void => {
        const payload = parseChatStreamEvent(String(event.data));
        if (!payload) return;
        const handlers = optionsRef.current;

        if (payload.type === 'auth_required') {
          const token = useSessionStore.getState().token ?? getAuthToken();
          if (!token) {
            handlers.onError?.('请先登录后再使用 AI 对话。');
            setIsStreaming(false);
            socket.close();
            return;
          }
          socket.send(JSON.stringify({ type: 'auth', token }));
          return;
        }
        if (payload.type === 'auth_failed') {
          terminalClose = true;
          handlers.onError?.(payload.message ?? '鉴权失败，请重新登录。');
          setIsStreaming(false);
          socket.close();
          return;
        }
        if (payload.type === 'auth_ok') {
          submitChat();
          return;
        }
        if (payload.type === 'session_started') {
          handlers.onSessionStarted?.(payload.conversation_id);
          setStreamStatus(`会话 ${payload.conversation_id} 已建立`);
          return;
        }
        if (payload.type === 'agent_trace') {
          const traceEvent = payload.event ?? {
            step: payload.step ?? 'Agent',
            status: payload.status ?? 'running',
            detail: payload.detail,
          };
          handlers.onTrace?.(traceEvent);
          return;
        }
        if (payload.type === 'citation_update') {
          handlers.onCitation?.(payload.citations);
          setStreamStatus(`已更新 ${payload.citations.length} 条课程引用`);
          return;
        }
        if (payload.type === 'text_delta') {
          handlers.onDelta?.(payload.delta);
          return;
        }
        if (payload.type === 'quality_update') {
          handlers.onQuality?.(payload.quality);
          return;
        }
        if (payload.type === 'suggested_actions') {
          handlers.onSuggestedActions?.(payload.actions);
          return;
        }
        if (payload.type === 'extracted_qa_suggestions') {
          handlers.onExtractedQaSuggestions?.(payload.items);
          return;
        }
        if (payload.type === 'onboarding_update') {
          const onboarding = payload.meta?.onboarding;
          if (onboarding) handlers.onOnboardingUpdate?.(onboarding);
          return;
        }
        if (payload.type === 'done') {
          handlers.onDone?.({
            conversationId: payload.conversation_id,
            answer: payload.answer,
            citations: payload.citations ?? [],
            agentTrace: payload.agent_trace ?? [],
            suggestedActions: payload.suggested_actions ?? [],
            quality: payload.quality,
            resourceTaskId: payload.resource_task_id,
            route: payload.route ?? null,
            onboardingMeta: payload.meta?.onboarding,
          });
          setStreamStatus('回答已完成');
          setIsStreaming(false);
          socket.close();
          return;
        }
        if (payload.type === 'error') {
          terminalClose = true;
          const message = typeof payload.message === 'string' ? payload.message : JSON.stringify(payload.message);
          handlers.onError?.(normalizeStreamError(message));
          setStreamStatus('AI 请求失败');
          setIsStreaming(false);
          socket.close();
        }
      };

      socket.onerror = () => {
        setStreamStatus(browserIsOffline() ? '当前无网络连接' : '实时通道连接失败，准备重试');
      };

      socket.onclose = () => {
        socketRef.current = null;
        if (terminalClose) {
          setIsStreaming(false);
          return;
        }
        if (!chatSubmitted && reconnectAttempts < MAX_RECONNECT_ATTEMPTS && !browserIsOffline()) {
          reconnectAttempts += 1;
          setStreamStatus(`连接中断，正在重连（${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}）...`);
          window.setTimeout(connect, RECONNECT_DELAY_MS);
          return;
        }
        setIsStreaming(false);
        if (!chatSubmitted) {
          const message = websocketUnavailableMessage();
          setStreamStatus(browserIsOffline() ? '当前无网络连接' : '实时通道不可用');
          optionsRef.current.onError?.(message);
          return;
        }
        setStreamStatus('连接已断开，请稍后重试');
      };
    };

    connect();
  }, [stop]);

  return { send, stop, isStreaming, streamStatus, setStreamStatus };
}
