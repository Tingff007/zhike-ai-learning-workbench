import type { OnboardingRound } from '../../types/onboarding';

export interface OnboardingMessageStreamProps {
  messages: OnboardingRound[];
  currentRound: number;
  streamingQuestion?: string;
  showStreamingCursor?: boolean;
}

/** 引导消息流：精简渲染，不含资源卡片等复杂元素 */
export function OnboardingMessageStream({
  messages,
  currentRound,
  streamingQuestion,
  showStreamingCursor = false,
}: OnboardingMessageStreamProps): JSX.Element {
  return (
    <div className="onboarding-messages">
      {messages.map((round) => (
        <div key={`round-${round.round}`} className="onboarding-messages__round">
          <div className="onboarding-messages__badge">第 {round.round} 轮</div>
          <div className="onboarding-messages__item onboarding-messages__item--assistant">
            <div className="onboarding-messages__avatar">✨</div>
            <div className="onboarding-messages__bubble">{round.question}</div>
          </div>
          <div className="onboarding-messages__item onboarding-messages__item--user">
            <div className="onboarding-messages__bubble">{round.answer}</div>
          </div>
        </div>
      ))}

      {streamingQuestion ? (
        <div className="onboarding-messages__round onboarding-messages__round--active">
          <div className="onboarding-messages__badge">第 {currentRound} 轮</div>
          <div className="onboarding-messages__item onboarding-messages__item--assistant">
            <div className="onboarding-messages__avatar">✨</div>
            <div className="onboarding-messages__bubble">
              {streamingQuestion}
              {showStreamingCursor ? <span className="onboarding-messages__cursor">▍</span> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
