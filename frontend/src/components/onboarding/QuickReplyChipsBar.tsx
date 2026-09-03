import type { ChipOption } from '../../types/onboarding';

export interface QuickReplyChipsBarProps {
  chips: ChipOption[];
  /** chip 点击回调：传完整 chip 对象，由上层决定走预设直写还是 Text Injection */
  onChipClick: (chip: ChipOption) => void;
  visible: boolean;
  loading: boolean;
}

/** 快捷回复卡片栏：支持骨架屏占位与渐显过渡 */
export function QuickReplyChipsBar({
  chips,
  onChipClick,
  visible,
  loading,
}: QuickReplyChipsBarProps): JSX.Element | null {
  if (!visible) return null;

  if (loading) {
    return (
      <div className="onboarding-chips onboarding-chips--loading" aria-busy="true" aria-label="加载快捷选项">
        {[0, 1, 2].map((index) => (
          <span key={index} className="onboarding-chips__skeleton" />
        ))}
      </div>
    );
  }

  if (!chips.length) return null;

  return (
    <div className="onboarding-chips onboarding-chips--ready">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          className="onboarding-chips__pill"
          onClick={() => onChipClick(chip)}
        >
          {chip.icon ? <span className="onboarding-chips__icon">{chip.icon}</span> : null}
          <span>{chip.label}</span>
        </button>
      ))}
    </div>
  );
}
