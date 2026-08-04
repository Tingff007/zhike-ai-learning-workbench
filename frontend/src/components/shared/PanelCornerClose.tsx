import { X } from 'lucide-react';

/** 与 4-components/panel-close.css 中 --panel-close-size / --panel-notch-gap 保持一致 */
const CLOSE_SIZE = 28;
const NOTCH_GAP = 6;
const BTN_R = CLOSE_SIZE / 2;
const ARC_R = BTN_R + NOTCH_GAP;
const SVG_SIZE = ARC_R + 6;

function buildNotchBorderPath(size: number, arcRadius: number) {
  const startX = size - arcRadius;
  return `M 0 0.5 H ${startX} A ${arcRadius} ${arcRadius} 0 0 1 ${size - 0.5} ${arcRadius + 0.5}`;
}

type PanelCornerCloseProps = {
  onClick: () => void;
  label?: string;
};

/** 右上角半嵌入关闭：容器角点圆弧凹陷，按钮与边框之间留出透明环形空隙 */
export function PanelCornerClose({ onClick, label = '关闭预览并结束生成' }: PanelCornerCloseProps): JSX.Element {
  const borderPath = buildNotchBorderPath(SVG_SIZE, ARC_R);

  return (
    <div className="panel-corner-close" role="presentation">
      <svg
        className="panel-corner-close__frame"
        width={SVG_SIZE}
        height={SVG_SIZE}
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        aria-hidden
      >
        <path className="panel-corner-close__frame-path" d={borderPath} />
      </svg>
      <button type="button" className="panel-corner-close__btn" title={label} aria-label={label} onClick={onClick}>
        <X size={14} strokeWidth={2.25} />
      </button>
    </div>
  );
}
