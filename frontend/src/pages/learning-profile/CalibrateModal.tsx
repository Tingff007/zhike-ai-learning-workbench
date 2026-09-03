import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2, Loader2, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import type { ProfileDimension } from '../../types';
import type { OnboardingDimensionBrief } from '../../types/onboarding';
import { useChatStream, type ChatStreamRequest } from '../../hooks/useChatStream';
import { ProfileTagCloudSidebar } from '../../components/onboarding/ProfileTagCloudSidebar';
import {
  DIMENSION_LABELS,
  getDimensionChips,
  getDimensionLabel,
  getDimensionQuestion,
} from './dimensionChips';

/** 校准阶段：选择维度 → 对话式校准 → 完成 */
type CalibratePhase = 'selecting' | 'chatting' | 'done';

/** 对话消息（用户或 AI） */
type CalibrateMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type CalibrateModalProps = {
  open: boolean;
  onClose: () => void;
  /** 当前画像维度，用于维度选择网格 */
  dimensions?: ProfileDimension[];
  /** 初始维度 key；从维度卡片入口进入时直接跳过选择阶段 */
  initialDimensionKey?: string | null;
  /** 校准完成后回调（用于刷新画像查询） */
  onSubmit?: () => void;
};

/** 生成简易唯一 ID，用于消息标识 */
function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 从消息列表构造 onboarding_history，供后端 LLM 恢复上下文 */
function buildOnboardingHistory(messages: CalibrateMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages.map((msg) => ({ role: msg.role, content: msg.content }));
}

/** 截取用户回答摘要，用于标签云展示 */
function summarizeAnswer(answer: string): string {
  const trimmed = answer.trim();
  if (trimmed.length <= 18) return trimmed;
  return `${trimmed.slice(0, 18)}…`;
}

/**
 * 重新校准 AI 分身弹窗。
 *
 * 实现"对话式学习画像自主构建"规格：
 * - 维度驱动：点击某维度后弹出该维度专属的快捷卡片选项。
 * - LLM 处理：用户输入或点击卡片后，通过 WebSocket 发送自然语言到后端，
 *   由 ProfileExtractor 自动抽取画像维度并写入数据库。
 * - 实时画像预览：右侧标签云随对话轮次累积已校准维度。
 * - Text Injection：点击卡片时把自然语言句子注入输入框并发送，
 *   保证所有特征抽取走统一 LLM 语义管道。
 */
export function CalibrateModal({
  open,
  onClose,
  dimensions,
  initialDimensionKey,
  onSubmit,
}: CalibrateModalProps): ReactElement | null {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<CalibratePhase>('selecting');
  const [selectedDimensionKey, setSelectedDimensionKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<CalibrateMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [draft, setDraft] = useState('');
  const [chipsVisible, setChipsVisible] = useState(true);
  const [collectedDimensions, setCollectedDimensions] = useState<OnboardingDimensionBrief[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const chipClickTimerRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // 当前维度的专属 chips
  const currentChips = useMemo(() => getDimensionChips(selectedDimensionKey), [selectedDimensionKey]);
  const currentDimensionLabel = useMemo(() => getDimensionLabel(selectedDimensionKey), [selectedDimensionKey]);

  const { send, stop, isStreaming } = useChatStream({
    onDelta: (delta) => {
      setStreamingContent((prev) => `${prev}${delta}`);
    },
    onDone: (payload) => {
      // 把流式累积的内容固化为 AI 消息；若 onDelta 为空则用 done.answer 兜底
      const finalContent = streamingContentRef.current.trim() || payload.answer || '好的，我已记录你的反馈。';
      setMessages((prev) => [...prev, { id: genId('ai'), role: 'assistant', content: finalContent }]);
      setStreamingContent('');
      // 累计已校准维度到右侧标签云
      if (selectedDimensionKey) {
        const lastUserMessage = [...messagesRef.current].reverse().find((m) => m.role === 'user');
        setCollectedDimensions((prev) => {
          const filtered = prev.filter((d) => d.key !== selectedDimensionKey);
          return [
            ...filtered,
            {
              key: selectedDimensionKey,
              name: getDimensionLabel(selectedDimensionKey),
              label: lastUserMessage ? summarizeAnswer(lastUserMessage.content) : '已更新',
              confidence: 0.95,
            },
          ];
        });
      }
    },
    onError: (message) => {
      setErrorMessage(message);
      setStreamingContent('');
    },
  });

  // 用 ref 保存最新的 streamingContent 和 messages，供 onDone 闭包读取
  const streamingContentRef = useRef('');
  const messagesRef = useRef<CalibrateMessage[]>([]);
  useEffect(() => {
    streamingContentRef.current = streamingContent;
  }, [streamingContent]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // 消息流自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, streamingContent]);

  // Modal 打开/关闭时重置状态
  useEffect(() => {
    if (!open) {
      stop();
      setPhase('selecting');
      setSelectedDimensionKey(null);
      setMessages([]);
      setStreamingContent('');
      setDraft('');
      setCollectedDimensions([]);
      setErrorMessage(null);
      setChipsVisible(true);
      return undefined;
    }
    // 若携带初始维度，直接进入对话阶段
    if (initialDimensionKey) {
      setSelectedDimensionKey(initialDimensionKey);
      const question = getDimensionQuestion(initialDimensionKey);
      setMessages([{ id: genId('ai-init'), role: 'assistant', content: question }]);
      setPhase('chatting');
    }
    return undefined;
  }, [open, initialDimensionKey, stop]);

  // ESC 关闭
  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !isStreaming) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isStreaming, onClose]);

  // 清理 chip 点击定时器
  useEffect(() => {
    return () => {
      if (chipClickTimerRef.current !== null) {
        window.clearTimeout(chipClickTimerRef.current);
      }
    };
  }, []);

  // draft 变化时控制 chips 显隐（用户输入时隐藏快捷卡片）
  useEffect(() => {
    setChipsVisible(!draft.trim());
  }, [draft]);

  /** 选择某维度，进入对话阶段 */
  const handleSelectDimension = useCallback((dimensionKey: string | null) => {
    setSelectedDimensionKey(dimensionKey);
    const question = getDimensionQuestion(dimensionKey);
    setMessages([{ id: genId('ai-init'), role: 'assistant', content: question }]);
    setPhase('chatting');
    setErrorMessage(null);
  }, []);

  /** 提交用户回答到后端 LLM */
  const handleSubmit = useCallback(
    (answer: string) => {
      const trimmed = answer.trim();
      if (!trimmed || isStreaming) return;
      setErrorMessage(null);
      setDraft('');
      // 先把用户消息加入流，再发送 WebSocket
      const userMessage: CalibrateMessage = { id: genId('user'), role: 'user', content: trimmed };
      const nextMessages = [...messagesRef.current, userMessage];
      setMessages(nextMessages);

      const request: ChatStreamRequest = {
        message: trimmed,
        learning_scope: 'general',
        course_id: null,
        conversation_id: null,
        onboarding_history: buildOnboardingHistory(nextMessages),
      };
      send(request);
    },
    [isStreaming, send],
  );

  /** Text Injection：点击卡片填充输入框并延迟自动提交 */
  const handleChipClick = useCallback(
    (payload: string) => {
      setDraft(payload);
      if (chipClickTimerRef.current !== null) {
        window.clearTimeout(chipClickTimerRef.current);
      }
      chipClickTimerRef.current = window.setTimeout(() => {
        handleSubmit(payload);
        setDraft('');
      }, 120);
    },
    [handleSubmit],
  );

  /** 继续校准其他维度（保留已收集标签） */
  const handleContinue = useCallback(() => {
    setSelectedDimensionKey(null);
    setMessages([]);
    setStreamingContent('');
    setPhase('selecting');
    setErrorMessage(null);
  }, []);

  /** 完成校准，触发画像刷新并关闭 */
  const handleFinish = useCallback(() => {
    onSubmit?.();
    onClose();
  }, [onSubmit, onClose]);

  if (!open) return null;

  // 维度选择网格：优先展示已有画像维度，补齐预置维度
  const dimensionEntries: Array<{ key: string; label: string; currentLabel?: string }> = (() => {
    const seen = new Set<string>();
    const entries: Array<{ key: string; label: string; currentLabel?: string }> = [];
    dimensions?.forEach((dim) => {
      if (seen.has(dim.key)) return;
      seen.add(dim.key);
      entries.push({ key: dim.key, label: dim.name, currentLabel: dim.label || '未设定' });
    });
    Object.entries(DIMENSION_LABELS).forEach(([key, label]) => {
      if (seen.has(key)) return;
      seen.add(key);
      entries.push({ key, label });
    });
    return entries;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 p-4 backdrop-blur-sm sm:p-6">
      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-indigo-100/80 bg-white/95 shadow-[0_24px_80px_rgba(79,70,229,0.18)] backdrop-blur-xl"
        aria-label="AI 分身校准"
        role="dialog"
        aria-modal="true"
      >
        {/* 头部 */}
        <header className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-indigo-500">AI 分身校准</p>
              <h2 className="mt-0.5 text-base font-semibold text-zinc-900">
                {phase === 'selecting' ? '选择要校准的维度' : phase === 'chatting' ? `校准「${currentDimensionLabel}」` : '校准完成'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40"
            onClick={onClose}
            disabled={isStreaming}
            aria-label="关闭校准弹窗"
          >
            <X size={16} />
          </button>
        </header>

        {/* 主体 */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {phase === 'selecting' && (
            <div className="flex flex-col gap-3 px-5 py-5">
              <p className="text-sm leading-relaxed text-zinc-600">
                点击下方任一维度，AI 会围绕该维度与你展开简短对话并更新画像。也可以直接描述你的变化，无需逐项填写。
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {dimensionEntries.map((entry) => {
                  const collected = collectedDimensions.some((d) => d.key === entry.key);
                  return (
                    <button
                      key={entry.key}
                      type="button"
                      onClick={() => handleSelectDimension(entry.key)}
                      className="group flex flex-col items-start gap-1 rounded-xl border border-zinc-100 bg-white px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-sm"
                    >
                      <span className="text-xs font-medium text-zinc-700 group-hover:text-indigo-700">{entry.label}</span>
                      {entry.currentLabel && (
                        <span className="truncate text-[11px] text-zinc-400" title={entry.currentLabel}>
                          {entry.currentLabel}
                        </span>
                      )}
                      {collected && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600">
                          <CheckCircle2 size={10} />
                          本轮已更新
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => handleSelectDimension(null)}
                className="mt-1 inline-flex items-center gap-1.5 self-start rounded-lg border border-dashed border-zinc-200 px-3 py-2 text-xs text-zinc-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
              >
                <Sparkles size={12} />
                自由描述，不限定维度
              </button>
            </div>
          )}

          {phase === 'chatting' && (
            <div className="grid h-full min-h-[420px] grid-cols-1 lg:grid-cols-3">
              {/* 左侧：对话区 */}
              <div className="flex min-h-0 flex-col lg:col-span-2">
                {/* 消息流 */}
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  <div className="space-y-3">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={
                          msg.role === 'user'
                            ? 'flex justify-end'
                            : 'flex justify-start gap-2.5'
                        }
                      >
                        {msg.role === 'assistant' && (
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-600">
                            ✨
                          </div>
                        )}
                        <div
                          className={
                            msg.role === 'user'
                              ? 'max-w-[80%] rounded-2xl rounded-tr-sm bg-indigo-600 px-3.5 py-2.5 text-sm leading-relaxed text-white'
                              : 'max-w-[80%] rounded-2xl rounded-tl-sm border border-zinc-100 bg-zinc-50/80 px-3.5 py-2.5 text-sm leading-relaxed text-zinc-700'
                          }
                        >
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {/* 流式回复占位 */}
                    {isStreaming && (
                      <div className="flex justify-start gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-600">
                          ✨
                        </div>
                        <div className="max-w-[80%] rounded-2xl rounded-tl-sm border border-zinc-100 bg-zinc-50/80 px-3.5 py-2.5 text-sm leading-relaxed text-zinc-700">
                          {streamingContent ? (
                            <span>
                              {streamingContent}
                              <span className="ml-0.5 inline-block animate-pulse">▍</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
                              <Loader2 size={12} className="animate-spin" />
                              正在分析你的回答…
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {/* 错误提示 */}
                {errorMessage && (
                  <div className="mx-5 mb-2 flex items-center justify-between gap-2 rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs text-amber-700">
                    <span>{errorMessage}</span>
                    <button
                      type="button"
                      onClick={() => setErrorMessage(null)}
                      className="text-amber-500 hover:text-amber-700"
                    >
                      知道了
                    </button>
                  </div>
                )}

                {/* 快捷卡片 + 输入框 + 操作区 */}
                <div className="border-t border-zinc-100 px-5 py-3">
                  {chipsVisible && currentChips.length > 0 && !isStreaming && (
                    <div className="mb-2.5 flex flex-wrap gap-2" role="list" aria-label="快捷校准选项">
                      {currentChips.map((chip) => (
                        <button
                          key={chip.id}
                          type="button"
                          role="listitem"
                          onClick={() => handleChipClick(chip.payload)}
                          className="inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:text-indigo-700 hover:shadow-sm"
                        >
                          {chip.icon && <span aria-hidden>{chip.icon}</span>}
                          <span>{chip.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <form
                    className="flex items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleSubmit(draft);
                    }}
                  >
                    <input
                      type="text"
                      className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-800 outline-none transition-colors placeholder:text-zinc-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      placeholder="或直接描述你想调整的内容…"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      disabled={isStreaming}
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!draft.trim() || isStreaming}
                      className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-indigo-600 px-3.5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-40"
                    >
                      <Send size={13} />
                      发送
                    </button>
                  </form>

                  {/* 对话结束后提供"继续/完成"操作 */}
                  {!isStreaming && messages.length >= 2 && (
                    <div className="mt-2.5 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={handleContinue}
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-50"
                      >
                        <RotateCcw size={12} />
                        校准其他维度
                      </button>
                      <button
                        type="button"
                        onClick={handleFinish}
                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
                      >
                        <CheckCircle2 size={12} />
                        完成并查看画像
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 右侧：实时画像标签云 */}
              <aside className="hidden border-l border-zinc-100 bg-zinc-50/40 lg:block">
                <ProfileTagCloudSidebar
                  dimensions={collectedDimensions}
                  totalTarget={6}
                  animationKey={collectedDimensions.map((d) => d.key).join(',')}
                />
              </aside>
            </div>
          )}

          {phase === 'done' && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-3 px-5 py-10 text-center"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 size={22} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-800">校准完成，画像已更新</p>
                <p className="text-xs text-zinc-500">变化维度已高亮，可在雷达图与详情面板中查看</p>
              </div>
              <button
                type="button"
                onClick={handleFinish}
                className="mt-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
              >
                查看画像
              </button>
            </motion.div>
          )}
        </div>
      </motion.section>
    </div>
  );
}
