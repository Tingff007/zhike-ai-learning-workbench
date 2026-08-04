import { Link } from 'react-router-dom';
import { FlaskConical, KeyRound } from 'lucide-react';
import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';
import { useChatdocDesignMode } from '../../hooks/useChatdocDesignMode';

export type ChatDocDesignModeBannerProps = {
  className?: string;
  compact?: boolean;
};

export function ChatDocDesignModeBanner({ className = '', compact = false }: ChatDocDesignModeBannerProps): JSX.Element | null {
  const { designMode, isLoading } = useChatdocDesignMode();

  if (isLoading || !designMode) return null;

  return (
    <div
      className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950 ${className}`.trim()}
    >
      <div className="flex min-w-0 items-start gap-2">
        <FlaskConical className="mt-0.5 shrink-0 text-violet-600" size={18} />
        <div className="min-w-0">
          <div className="font-semibold">{kb.designModeTitle}</div>
          <p className={`mt-1 text-violet-900/80 ${compact ? 'text-xs' : 'text-sm leading-relaxed'}`}>
            {kb.designModeOffline}
            {!compact && (
              <>
                {' '}
                设计说明见仓库 <code className="rounded bg-white/70 px-1 py-0.5 text-xs">docs/CHATDOC_OFFLINE_DESIGN.md</code>。
              </>
            )}
          </p>
        </div>
      </div>
      <Link to={kb.credentialsRoute} className="btn-secondary h-9 shrink-0 gap-2 px-3 text-xs">
        <KeyRound size={14} />
        {kb.credentialsLink}
      </Link>
    </div>
  );
}
