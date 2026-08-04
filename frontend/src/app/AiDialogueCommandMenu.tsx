import { ChevronRight } from 'lucide-react';
import { menuCommandOptions, type MenuCommandOption } from './aiDialogueConfig';

export type AiDialogueCommandMenuProps = {
  onSelectCommand: (command: MenuCommandOption) => void;
};

/** 渲染 AI 对话舱快捷命令菜单，仅负责展示命令并派发选择事件。 */
export function AiDialogueCommandMenu({ onSelectCommand }: AiDialogueCommandMenuProps): JSX.Element {
  return (
    <div className="ai-command-menu border-none" aria-label="AI 能力快捷菜单">
      {menuCommandOptions.map((command) => {
        const { key, label, Icon } = command;
        return (
          <button key={key} type="button" onClick={() => onSelectCommand(command)}>
            <Icon size={16} />
            <span>{label}</span>
            <ChevronRight size={14} />
          </button>
        );
      })}
    </div>
  );
}
