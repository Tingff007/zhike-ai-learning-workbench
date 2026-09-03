import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type CourseRequiredDialogProps = {
  open: boolean;
  onClose: () => void;
  reason?: 'generate' | 'chat';
};

export function CourseRequiredDialog({ open, onClose, reason = 'generate' }: CourseRequiredDialogProps): JSX.Element | null {
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const title = reason === 'generate' ? '无法生成资源' : '无法发起对话';
  const body =
    reason === 'generate'
      ? '当前课程未分配或未选择，无法生成学习资源。请先完成课程分配或选择。'
      : '请先选择已分配的课程，再发起学习对话。';

  return (
    <div className="course-required-dialog" role="dialog" aria-modal="true" aria-labelledby="course-required-title">
      <button type="button" className="course-required-dialog__backdrop" aria-label="关闭" onClick={onClose} />
      <div className="course-required-dialog__panel">
        <div className="course-required-dialog__icon">
          <AlertTriangle size={22} />
        </div>
        <h2 id="course-required-title">{title}</h2>
        <p>{body}</p>
        <ol>
          <li>在顶部导航栏的课程下拉框中选择课程</li>
          <li>若列表为空，前往个人设置查看已分配课程</li>
          <li>仍无课程时，请联系管理员分配</li>
        </ol>
        <div className="course-required-dialog__actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            我知道了
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              onClose();
              navigate('/personal-settings');
            }}
          >
            去查看已分配课程
          </button>
        </div>
        <button type="button" className="course-required-dialog__close" aria-label="关闭" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
