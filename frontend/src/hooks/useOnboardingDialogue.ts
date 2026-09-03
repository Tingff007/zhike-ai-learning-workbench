import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch } from 'react';
import type { ChatStreamRequest } from '../hooks/useChatStream';
import {
  buildOnboardingHistoryFromRounds,
  type OnboardingAction,
} from '../hooks/useOnboardingWizard';
import type {
  ChipOption,
  OnboardingDialogueMessage,
  OnboardingDimensionBrief,
  OnboardingMetadata,
  OnboardingState,
} from '../types/onboarding';
import {
  ONBOARDING_ROUND1_CHIPS,
  ONBOARDING_ROUND1_QUESTION,
} from '../types/onboarding';
import { api } from '../api/endpoints';

const ONBOARDING_LOAD_TIMEOUT_MS = 30_000;

/** 生成消息唯一 id */
function createMessageId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

type SendChatStream = (request: ChatStreamRequest) => void;

export type UseOnboardingDialogueParams = {
  state: OnboardingState;
  dispatch: Dispatch<OnboardingAction>;
  showWizard: boolean;
  sendChatStream: SendChatStream;
  isStreaming: boolean;
};

export type UseOnboardingDialogueResult = {
  /** 引导对话消息流（替代原 OnboardingMessageStream 的渲染数据源） */
  messages: OnboardingDialogueMessage[];
  chips: ChipOption[];
  dimensions: OnboardingDimensionBrief[];
  chipsLoading: boolean;
  currentQuestion: string;
  streamingContent: string;
  duplicateHint: boolean;
  loadError: boolean;
  inputDisabled: boolean;
  /** 预设 chip 直写路径：不走 LLM，后端直接写入画像维度 */
  submitPresetChip: (chip: ChipOption) => void;
  /** 自由输入路径：走 LLM 抽取维度 + 生成回复 */
  submitFreeInput: (answer: string) => void;
  retryLoad: () => void;
  handleSkip: () => void;
  handleClose: () => void;
  applyOnboardingMeta: (
    meta: OnboardingMetadata | undefined,
    assistantAnswer: string,
    userAnswer: string,
    options?: { recordRound?: boolean },
  ) => void;
  appendStreamDelta: (delta: string) => void;
  handleStreamError: (message: string) => void;
  handleStreamDone: (payload: { answer: string; meta?: OnboardingMetadata }) => void;
  /** 处理流式过程中推送的 onboarding_update 事件：仅实时更新右侧标签云维度，不记录轮次 */
  handleOnboardingUpdate: (meta: OnboardingMetadata) => void;
};

/** 引导对话编排：预设 chip 直写 + 自由输入 LLM 两条路径，统一维护对话消息流 */
export function useOnboardingDialogue({
  state,
  dispatch,
  showWizard,
  sendChatStream,
  isStreaming,
}: UseOnboardingDialogueParams): UseOnboardingDialogueResult {
  const [messages, setMessages] = useState<OnboardingDialogueMessage[]>([]);
  const [chips, setChips] = useState<ChipOption[]>(ONBOARDING_ROUND1_CHIPS);
  const [dimensions, setDimensions] = useState<OnboardingDimensionBrief[]>([]);
  const [chipsLoading, setChipsLoading] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(ONBOARDING_ROUND1_QUESTION);
  const [streamingContent, setStreamingContent] = useState('');
  const [duplicateHint, setDuplicateHint] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const loadTimeoutRef = useRef<number | null>(null);
  const pendingQuestionRef = useRef(ONBOARDING_ROUND1_QUESTION);
  const pendingAnswerRef = useRef<string | null>(null);
  const pendingChipRef = useRef<ChipOption | null>(null);
  /** 当前正在流式渲染的 AI 消息 id（自由输入路径用） */
  const streamingMessageIdRef = useRef<string | null>(null);
  const closingTimerRef = useRef<number | null>(null);
  const restoreRequestedRef = useRef(false);

  const clearLoadTimeout = useCallback((): void => {
    if (loadTimeoutRef.current !== null) {
      window.clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }, []);

  const startLoadTimeout = useCallback((): void => {
    clearLoadTimeout();
    loadTimeoutRef.current = window.setTimeout(() => {
      setLoadError(true);
      setChipsLoading(false);
    }, ONBOARDING_LOAD_TIMEOUT_MS);
  }, [clearLoadTimeout]);

  /** 追加一条消息到对话流 */
  const appendMessage = useCallback((message: OnboardingDialogueMessage): void => {
    setMessages((prev) => [...prev, message]);
  }, []);

  /** 更新指定 id 的消息内容（流式渲染用） */
  const updateMessageContent = useCallback((id: string, content: string): void => {
    setMessages((prev) =>
      prev.map((item) => (item.id === id ? { ...item, content } : item)),
    );
  }, []);

  const applyOnboardingMeta = useCallback(
    (
      meta: OnboardingMetadata | undefined,
      assistantAnswer: string,
      userAnswer: string,
      options?: { recordRound?: boolean },
    ): void => {
      clearLoadTimeout();
      setLoadError(false);
      setChipsLoading(false);

      if (!meta || (!meta.isOnboarding && !meta.done)) {
        dispatch({ type: 'CLOSE' });
        return;
      }

      setDuplicateHint(Boolean(meta.duplicate));
      const recordRound = options?.recordRound ?? true;

      if (recordRound) {
        const question = pendingQuestionRef.current;
        const history = [
          { role: 'user' as const, content: userAnswer },
          { role: 'assistant' as const, content: assistantAnswer },
        ];
        dispatch({
          type: 'SUBMIT_ROUND',
          payload: {
            question,
            answer: userAnswer,
            extractedDimensions: meta.currentDimensions.map((item) => item.key),
            history,
          },
        });
      }

      setDimensions(meta.currentDimensions);
      dispatch({
        type: 'RECEIVE_META',
        payload: {
          done: meta.done,
          currentDimensions: meta.currentDimensions,
        },
      });

      if (meta.done) {
        setCurrentQuestion(assistantAnswer);
        setStreamingContent(assistantAnswer);
        setChips([]);
        closingTimerRef.current = window.setTimeout(() => {
          dispatch({ type: 'CLOSE' });
        }, 2000);
        return;
      }

      setChips(meta.suggestedChips);
      pendingQuestionRef.current = assistantAnswer;
      setCurrentQuestion(assistantAnswer);
      setStreamingContent(assistantAnswer);
    },
    [clearLoadTimeout, dispatch],
  );

  const appendStreamDelta = useCallback((delta: string): void => {
    setStreamingContent((prev) => {
      const next = prev + delta;
      // 同步更新对话流中正在流式渲染的 AI 消息
      const messageId = streamingMessageIdRef.current;
      if (messageId) {
        updateMessageContent(messageId, next);
      }
      return next;
    });
  }, [updateMessageContent]);

  const handleStreamError = useCallback(
    (message: string): void => {
      void message;
      clearLoadTimeout();
      setLoadError(true);
      setChipsLoading(false);
      streamingMessageIdRef.current = null;
    },
    [clearLoadTimeout],
  );

  /**
   * 预设 chip 直写路径：
   * 1. 对话流插入用户消息（chip.label，fromPresetChip=true）
   * 2. 调后端直写接口（不走 LLM）
   * 3. 成功后插入 AI 模板回复消息，更新 chips/dimensions/meta
   */
  const submitPresetChip = useCallback(
    async (chip: ChipOption): Promise<void> => {
      if (isStreaming || state.phase !== 'active') return;

      pendingChipRef.current = chip;
      pendingAnswerRef.current = chip.payload;
      setDuplicateHint(false);
      setLoadError(false);
      setStreamingContent('');
      setChipsLoading(true);
      startLoadTimeout();

      // 1. 立即插入用户消息（营造对话感）
      appendMessage({
        id: createMessageId('chip_user'),
        role: 'user',
        content: chip.label,
        fromPresetChip: true,
        round: state.round,
      });

      try {
        const priorHistory = buildOnboardingHistoryFromRounds(state.rounds);
        const response = await api.submitOnboardingPresetChip({
          chip,
          round: state.round,
          history: [...priorHistory, { role: 'user', content: chip.payload }],
        });

        clearLoadTimeout();
        setChipsLoading(false);

        // 2. 插入 AI 模板回复消息
        appendMessage({
          id: createMessageId('chip_ai'),
          role: 'assistant',
          content: response.aiReply,
          fromPresetChip: true,
          extractedDimensions: response.meta.currentDimensions.map((item) => item.key),
          round: state.round,
        });

        // 3. 更新引导状态
        applyOnboardingMeta(response.meta, response.aiReply, chip.payload);
        pendingChipRef.current = null;
        pendingAnswerRef.current = null;
      } catch {
        clearLoadTimeout();
        setChipsLoading(false);
        setLoadError(true);
        pendingChipRef.current = null;
      }
    },
    [appendMessage, applyOnboardingMeta, clearLoadTimeout, isStreaming, startLoadTimeout, state.phase, state.round, state.rounds],
  );

  /**
   * 自由输入路径：走 LLM 抽取维度 + 生成回复
   * 1. 对话流插入用户消息
   * 2. 插入占位 AI 消息（流式渲染）
   * 3. 走 sendChatStream，流式更新占位消息
   * 4. 完成后固化 AI 消息 + 更新 meta
   */
  const submitFreeInput = useCallback(
    (answer: string) => {
      if (isStreaming || state.phase !== 'active') return;

      pendingAnswerRef.current = answer;
      setDuplicateHint(false);
      setLoadError(false);
      setStreamingContent('');
      setChipsLoading(true);
      startLoadTimeout();

      // 1. 立即插入用户消息
      appendMessage({
        id: createMessageId('free_user'),
        role: 'user',
        content: answer,
        fromPresetChip: false,
        round: state.round,
      });

      // 2. 插入占位 AI 消息（流式渲染用）
      const aiMessageId = createMessageId('free_ai');
      streamingMessageIdRef.current = aiMessageId;
      appendMessage({
        id: aiMessageId,
        role: 'assistant',
        content: '',
        fromPresetChip: false,
        round: state.round,
      });

      // 3. 走 LLM 对话管道
      const priorHistory = buildOnboardingHistoryFromRounds(state.rounds);
      sendChatStream({
        message: answer,
        learning_scope: 'general',
        course_id: null,
        onboarding_history: [...priorHistory, { role: 'user', content: answer }],
      });
    },
    [appendMessage, isStreaming, sendChatStream, startLoadTimeout, state.phase, state.round, state.rounds],
  );

  const retryLoad = useCallback((): void => {
    const chip = pendingChipRef.current;
    if (chip) {
      void submitPresetChip(chip);
      return;
    }
    if (!pendingAnswerRef.current) return;
    setLoadError(false);
    submitFreeInput(pendingAnswerRef.current);
  }, [submitPresetChip, submitFreeInput]);

  const handleSkip = useCallback((): void => {
    dispatch({ type: 'SKIP' });
  }, [dispatch]);

  const handleClose = useCallback((): void => {
    dispatch({ type: 'CLOSE' });
  }, [dispatch]);

  const handleStreamDone = useCallback(
    (payload: { answer: string; meta?: OnboardingMetadata }) => {
      const userAnswer = pendingAnswerRef.current ?? '继续引导';
      const isRestore = userAnswer === '继续引导';
      // 固化流式 AI 消息内容（确保最终内容与 answer 一致）
      const messageId = streamingMessageIdRef.current;
      if (messageId) {
        updateMessageContent(messageId, payload.answer);
      }
      streamingMessageIdRef.current = null;
      applyOnboardingMeta(payload.meta, payload.answer, userAnswer, { recordRound: !isRestore });
      pendingAnswerRef.current = null;
    },
    [applyOnboardingMeta, updateMessageContent],
  );

  /**
   * 处理流式过程中推送的 onboarding_update 中途事件：
   * 仅实时更新右侧标签云维度展示，让用户直观看到"画像正在被构建"（docs/10 第 1.2 节可视反馈目标）。
   * 不记录轮次、不更新 chips/question，那些在 done 事件统一处理，避免中途态与终态竞争。
   */
  const handleOnboardingUpdate = useCallback((meta: OnboardingMetadata): void => {
    if (!meta || !meta.isOnboarding) return;
    if (meta.currentDimensions?.length) {
      setDimensions(meta.currentDimensions);
    }
  }, []);

  // 首次展示或恢复时初始化对话流
  useEffect(() => {
    if (!showWizard) return;
    if (state.rounds.length === 0) {
      pendingQuestionRef.current = ONBOARDING_ROUND1_QUESTION;
      setCurrentQuestion(ONBOARDING_ROUND1_QUESTION);
      setChips(ONBOARDING_ROUND1_CHIPS);
      setChipsLoading(false);
      // 首次进入：插入 AI 欢迎消息
      if (messages.length === 0) {
        appendMessage({
          id: createMessageId('welcome'),
          role: 'assistant',
          content: ONBOARDING_ROUND1_QUESTION,
          round: 1,
        });
      }
      return;
    }
    const lastRound = state.rounds[state.rounds.length - 1];
    const lastAssistant = lastRound.history.find((item) => item.role === 'assistant');
    if (lastAssistant) {
      pendingQuestionRef.current = lastAssistant.content;
      setCurrentQuestion(lastAssistant.content);
      setStreamingContent(lastAssistant.content);
    }
  }, [appendMessage, messages.length, showWizard, state.rounds]);

  // 刷新恢复：从 localStorage 恢复后，若已有轮次记录，向后端请求下一轮
  useEffect(() => {
    if (!showWizard || restoreRequestedRef.current) return;
    if (state.phase !== 'active' || state.rounds.length === 0) return;
    restoreRequestedRef.current = true;
    setChipsLoading(true);
    startLoadTimeout();
    const priorHistory = buildOnboardingHistoryFromRounds(state.rounds);
    sendChatStream({
      message: '继续引导',
      learning_scope: 'general',
      course_id: null,
      onboarding_history: priorHistory,
    });
  }, [showWizard, sendChatStream, startLoadTimeout, state.phase, state.rounds]);

  useEffect(() => {
    return () => {
      clearLoadTimeout();
      if (closingTimerRef.current !== null) {
        window.clearTimeout(closingTimerRef.current);
      }
    };
  }, [clearLoadTimeout]);

  return {
    messages,
    chips,
    dimensions,
    chipsLoading,
    currentQuestion,
    streamingContent,
    duplicateHint,
    loadError,
    inputDisabled: isStreaming || state.phase === 'closing',
    submitPresetChip,
    submitFreeInput,
    retryLoad,
    handleSkip,
    handleClose,
    applyOnboardingMeta,
    appendStreamDelta,
    handleStreamError,
    handleStreamDone,
    handleOnboardingUpdate,
  };
}
