import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

type Segment =
  | { type: 'text'; value: string }
  | { type: 'math'; value: string; display: boolean };

function splitMathSegments(content: string): Segment[] {
  const segments: Segment[] = [];
  const pattern = /(\$\$[\s\S]+?\$\$|\$(?!\$)[^\n$]+?\$)/g;
  let lastIndex = 0;
  for (const match of content.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, index) });
    }
    const raw = match[0];
    const display = raw.startsWith('$$');
    const value = display ? raw.slice(2, -2).trim() : raw.slice(1, -1).trim();
    segments.push({ type: 'math', value, display });
    lastIndex = index + raw.length;
  }
  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) });
  }
  return segments.length ? segments : [{ type: 'text', value: content }];
}

function renderMath(value: string, display: boolean) {
  try {
    const html = katex.renderToString(value, {
      displayMode: display,
      throwOnError: false,
      strict: 'ignore',
    });
    return display ? (
      <div className="my-3 overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />
    ) : (
      <span className="mx-0.5 inline-block align-middle" dangerouslySetInnerHTML={{ __html: html }} />
    );
  } catch {
    return <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{display ? `$$${value}$$` : `$${value}$`}</code>;
  }
}

export function MarkdownWithMath({ content, className = '' }: { content: string; className?: string }): JSX.Element {
  const segments = useMemo(() => splitMathSegments(content), [content]);
  return (
    <div className={`whitespace-pre-wrap leading-7 text-[#374151] ${className}`.trim()}>
      {segments.map((segment, index) => {
        if (segment.type === 'math') {
          return <span key={`math-${index}`}>{renderMath(segment.value, segment.display)}</span>;
        }
        return <span key={`text-${index}`}>{segment.value}</span>;
      })}
    </div>
  );
}
