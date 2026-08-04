import { X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { GatewayKnowledgeCredentialsPanel } from '../model-gateway/GatewayKnowledgeCredentialsPanel';
import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';

/** @deprecated 请使用网关中心「知识向量化」页签；保留抽屉以兼容旧入口 */
export type KnowledgeCredentialsDrawerProps = {
  open: boolean;
  onClose: () => void;
};

export function KnowledgeCredentialsDrawer({ open, onClose }: KnowledgeCredentialsDrawerProps): JSX.Element | null {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/25 backdrop-blur-[1px]">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="关闭凭证配置" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{kb.credentialsTitle}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {kb.credentialsDrawerHint}{' '}
              <Link to={kb.credentialsRoute} className="text-primary hover:underline" onClick={onClose}>
                网关中心
              </Link>
            </p>
          </div>
          <button type="button" className="rounded-md p-2 text-slate-500 hover:bg-slate-100" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <GatewayKnowledgeCredentialsPanel enabled={open} variant="embedded" />
        </div>
      </aside>
    </div>
  );
}
