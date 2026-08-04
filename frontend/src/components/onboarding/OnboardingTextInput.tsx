export interface OnboardingTextInputProps {
  placeholder?: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}

/** 引导专用输入框：回车或点击发送提交 */
export function OnboardingTextInput({
  placeholder = '输入你的回答...',
  value,
  disabled = false,
  onChange,
  onSubmit,
}: OnboardingTextInputProps): JSX.Element {
  function handleSubmit(): void {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
  }

  return (
    <div className="onboarding-input">
      <input
        type="text"
        className="onboarding-input__field"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleSubmit();
          }
        }}
      />
      <button
        type="button"
        className="onboarding-input__send"
        disabled={disabled || !value.trim()}
        onClick={handleSubmit}
      >
        发送
      </button>
    </div>
  );
}
