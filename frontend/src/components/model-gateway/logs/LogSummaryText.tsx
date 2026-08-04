import { logSummaryTextClass } from '../GatewayStatusPill';
import { SUMMARY_HIGHLIGHT_KEYWORDS } from './logTableUtils';

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function LogSummaryText({
  text,
  status,
  clamp = true,
  className = '',
}: {
  text?: string | null;
  status?: string;
  clamp?: boolean;
  className?: string;
}): JSX.Element {
  const content = text?.trim() || '-';
  const tone = logSummaryTextClass(status);
  const shouldHighlight =
    status === 'failed' || status === 'down' || status === 'unhealthy' || status === 'fallback';

  const clampClass = clamp ? 'line-clamp-2' : '';

  if (!shouldHighlight || content === '-') {
    return <p className={`text-[11px] leading-snug ${tone} ${clampClass} ${className}`}>{content}</p>;
  }

  const pattern = new RegExp(SUMMARY_HIGHLIGHT_KEYWORDS.map(escapeRegExp).join('|'), 'gi');
  const segments: { text: string; highlight: boolean }[] = [];
  let lastIndex = 0;
  for (const match of content.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) segments.push({ text: content.slice(lastIndex, index), highlight: false });
    segments.push({ text: match[0], highlight: true });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < content.length) segments.push({ text: content.slice(lastIndex), highlight: false });

  return (
    <p className={`text-[11px] leading-snug ${tone} ${clampClass} ${className}`} title={content}>
      {segments.map((part, index) =>
        part.highlight ? (
          <mark key={index} className="rounded bg-amber-100 px-0.5 font-medium text-amber-900">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </p>
  );
}
