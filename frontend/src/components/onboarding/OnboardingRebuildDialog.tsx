import { useReducer, useRef } from 'react';
import {
  initialOnboardingState,
  onboardingReducer,
} from '../../hooks/useOnboardingWizard';
import {
  useOnboardingDialogue,
  type UseOnboardingDialogueResult,
} from '../../hooks/useOnboardingDialogue';
import { useChatStream } from '../../hooks/useChatStream';
import { ProfileOnboardingWizard } from './ProfileOnboardingWizard';

export interface OnboardingRebuildDialogProps {
  /** 是否展示重塑画像 overlay */
  open: boolean;
  /** 关闭弹窗（不刷新画像），用于跳过/取消场景 */
  onClose: () => void;
  /** 引导完成后回调，供调用方刷新画像数据并关闭弹窗 */
  onCompleted: () => void;
}

/**
 * 画像重塑弹窗：在 /learning-profile 页面内嵌引导对话，复用首页冷启动引导的
 * ProfileOnboardingWizard + useOnboardingDialogue + useChatStream 三件套。
 *
 * 与首页冷启动的关键差异：
 * - 使用独立 reducer 实例，强制 phase='active'，不经过 useOnboardingWizard 的
 *   冷启动检测与 localStorage 持久化，避免污染首页冷启动状态。
 * - 通过 sendChatStream 包装层给每次自由输入请求注入 force_onboarding=true，
 *   让后端跳过冷启动检测强制进入 onboarding 模式（已画像用户也能触发）。
 * - 预设 chip 直写接口不经 WebSocket，无需 force_onboarding。
 */
export function OnboardingRebuildDialog({
  open,
  onClose,
  onCompleted,
}: OnboardingRebuildDialogProps): JSX.Element | null {
  // 独立引导状态：强制 active，round=1，rounds 空，不写 localStorage
  const [state, dispatch] = useReducer(onboardingReducer, {
    ...initialOnboardingState,
    phase: 'active',
  });
  const handlersRef = useRef<UseOnboardingDialogueResult | null>(null);

  const chatStream = useChatStream({
    onDelta: (delta) => handlersRef.current?.appendStreamDelta(delta),
    onDone: (payload) =>
      handlersRef.current?.handleStreamDone({
        answer: payload.answer,
        meta: payload.onboardingMeta,
      }),
    onError: (message) => handlersRef.current?.handleStreamError(message),
  });

  const dialogue = useOnboardingDialogue({
    state,
    dispatch,
    showWizard: open,
    // 自由输入路径强制带 force_onboarding=true，让后端进入引导模式
    sendChatStream: (request) => chatStream.send({ ...request, force_onboarding: true }),
    isStreaming: chatStream.isStreaming,
  });
  handlersRef.current = dialogue;

  if (!open) return null;

  // 跳过引导：直接关闭弹窗，不刷新画像
  const handleSkip = (): void => {
    onClose();
  };

  // 完成引导（用户点击「开始学习」）：刷新画像并关闭弹窗
  const handleComplete = (): void => {
    onCompleted();
  };

  return (
    <div
      className="onboarding-rebuild-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="重塑学习画像"
    >
      <ProfileOnboardingWizard
        open={open}
        round={state.round}
        isClosing={state.phase === 'closing'}
        messages={dialogue.messages}
        chips={dialogue.chips}
        dimensions={dialogue.dimensions}
        chipsLoading={dialogue.chipsLoading}
        inputDisabled={dialogue.inputDisabled}
        duplicateHint={dialogue.duplicateHint}
        loadError={dialogue.loadError}
        onRetry={dialogue.retryLoad}
        onPresetChipClick={dialogue.submitPresetChip}
        onFreeInputSubmit={dialogue.submitFreeInput}
        onSkip={handleSkip}
        onClose={handleComplete}
      />
    </div>
  );
}
