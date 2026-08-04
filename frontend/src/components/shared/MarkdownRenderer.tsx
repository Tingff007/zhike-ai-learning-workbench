import { useMemo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { normalizeMarkdown } from '../../utils/normalize-markdown';

type MarkdownRendererProps = {
  content: string;
  className?: string;
  components?: Parameters<typeof ReactMarkdown>[0]['components'];
};

export function MarkdownRenderer({ content, className = 'ai-markdown-preview', components }: MarkdownRendererProps): JSX.Element {
  const markdown = useMemo(() => normalizeMarkdown(content), [content]);

  return (
    <article className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </article>
  );
}

export type { ReactNode };
