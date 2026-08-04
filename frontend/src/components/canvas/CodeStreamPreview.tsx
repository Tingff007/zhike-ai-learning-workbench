import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, CircleDot, Code2, FileCode2, FlaskConical, ListChecks, PlayCircle } from 'lucide-react';

type CodeStreamPreviewProps = {
  filename?: string;
  content: string;
  streaming?: boolean;
};

type LabBriefSection = {
  key: 'goal' | 'environment' | 'files' | 'steps';
  title: string;
  lines: string[];
};

type CodeBlock = {
  title: string;
  language: string;
  code: string;
};

const FALLBACK_BRIEF: LabBriefSection[] = [
  { key: 'goal', title: '实验目标', lines: ['读取草稿中的实验目标并组织为可执行代码实验。'] },
  { key: 'environment', title: '运行环境', lines: ['Python 3.6+', 'PyTorch', 'NumPy'] },
  { key: 'files', title: '工程文件', lines: ['lab_draft.py'] },
  { key: 'steps', title: '执行流程', lines: ['阅读实验说明', '补全 TODO 代码', '运行脚本并观察输出'] },
];

const SECTION_TITLES: Record<LabBriefSection['key'], string[]> = {
  goal: ['实验目标', '目标'],
  environment: ['环境要求', '运行环境', '环境'],
  files: ['文件结构', '工程结构', '文件'],
  steps: ['实验步骤', '操作步骤', '步骤'],
};

const FILE_COMMENT_PATTERN = /^#\s*([\w./-]+\.(?:py|ipynb|md|txt|json|ya?ml))\b/i;

/**
 * 将 Markdown 小节内容清洗为侧栏中可快速浏览的条目。
 */
function cleanBriefLine(line: string): string {
  return line
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+[.)、]\s*/, '')
    .replace(/^#+\s*/, '')
    .trim();
}

/**
 * 从代码实验草稿中提取指定标题的小节。
 */
function extractSectionLines(content: string, aliases: string[]): string[] {
  const lines = content.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => {
    const heading = line.match(/^#{1,3}\s*(.+?)\s*$/);
    if (!heading) return false;
    return aliases.some((alias) => heading[1].includes(alias));
  });

  if (startIndex < 0) return [];

  const result: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^#{1,3}\s+/.test(lines[index])) break;
    const cleaned = cleanBriefLine(lines[index]);
    if (!cleaned || cleaned.startsWith('```')) continue;
    result.push(cleaned);
  }

  return result.slice(0, 5);
}

/**
 * 从草稿中抽取实验概览区域，缺失时使用稳定的默认结构。
 */
function buildLabBrief(content: string): LabBriefSection[] {
  return FALLBACK_BRIEF.map((section) => {
    const lines = extractSectionLines(content, SECTION_TITLES[section.key]);
    return {
      ...section,
      lines: lines.length ? lines : section.lines,
    };
  });
}

/**
 * 根据代码块首行注释推断文件名，避免界面只显示笼统的代码片段。
 */
function inferBlockTitle(code: string, fallback: string): string {
  const firstMatch = code
    .split(/\r?\n/)
    .slice(0, 4)
    .map((line) => line.match(FILE_COMMENT_PATTERN)?.[1])
    .find(Boolean);
  return firstMatch ?? fallback;
}

/**
 * 给真正可执行的代码块更高优先级，避免默认停留在文件结构说明上。
 */
function scoreCodeBlock(block: CodeBlock): number {
  const code = block.code;
  let score = Math.min(code.length / 300, 8);
  if (/python|py/i.test(block.language)) score += 2;
  if (/\b(?:import|from|class|def)\b/.test(code)) score += 8;
  if (/\b(?:torch|nn|optimizer|DataLoader)\b/.test(code)) score += 5;
  if (/TODO/i.test(code)) score += 3;
  if (/^#\s*[\w./-]+\.py\b/m.test(code)) score += 1;
  return score;
}

/**
 * 提取 Markdown 代码块；没有围栏代码时退回到原始草稿。
 */
function extractCodeBlocks(content: string, fallbackFilename: string): CodeBlock[] {
  const blocks = Array.from(content.matchAll(/```([^\n]*)\n([\s\S]*?)```/g));
  if (!blocks.length) {
    return [{ title: fallbackFilename, language: 'python', code: content.trim() || '# 正在等待代码内容' }];
  }

  return blocks
    .map((block, index) => {
      const language = block[1].trim().split(/\s+/)[0] || 'text';
      const code = block[2].trimEnd();
      return {
        title: inferBlockTitle(code, index === 0 ? fallbackFilename : `代码片段 ${index + 1}`),
        language,
        code: code || '# 空代码块',
      };
    })
    .sort((left, right) => scoreCodeBlock(right) - scoreCodeBlock(left));
}

/**
 * 以专业代码实验工作台形式展示生成中的 PyTorch 实操草稿。
 */
export function CodeStreamPreview({
  filename = 'resource_draft.py',
  content,
  streaming = true,
}: CodeStreamPreviewProps): JSX.Element {
  const [visible, setVisible] = useState(streaming ? '' : content);
  const [activeBlockIndex, setActiveBlockIndex] = useState(0);

  useEffect(() => {
    if (!streaming) {
      setVisible(content);
      return undefined;
    }
    let index = 0;
    setVisible('');
    const timer = window.setInterval(() => {
      index = Math.min(content.length, index + Math.max(8, Math.floor(content.length / 48)));
      setVisible(content.slice(0, index));
      if (index >= content.length) window.clearInterval(timer);
    }, 64);
    return () => window.clearInterval(timer);
  }, [content, streaming]);

  const displaySource = visible || (streaming ? '' : content);
  const deferredDisplaySource = useDeferredValue(displaySource);
  const labBrief = useMemo(() => buildLabBrief(deferredDisplaySource), [deferredDisplaySource]);
  const codeBlocks = useMemo(() => extractCodeBlocks(deferredDisplaySource, filename), [deferredDisplaySource, filename]);
  const selectedBlock = codeBlocks[activeBlockIndex] ?? codeBlocks[0];
  const selectedLines = useMemo(() => selectedBlock.code.split(/\r?\n/), [selectedBlock.code]);
  const statusLabel = streaming && visible.length < content.length ? '生成中' : '可运行';

  useEffect(() => {
    if (activeBlockIndex < codeBlocks.length) return;
    setActiveBlockIndex(0);
  }, [activeBlockIndex, codeBlocks.length]);

  const briefIcon = {
    goal: FlaskConical,
    environment: Activity,
    files: FileCode2,
    steps: ListChecks,
  } satisfies Record<LabBriefSection['key'], typeof FlaskConical>;

  return (
    <div className="code-lab-preview">
      <header className="code-lab-preview__masthead">
        <div className="code-lab-preview__title">
          <span>
            <Code2 size={14} />
            PyTorch Code Lab
          </span>
          <h2>数据操作代码实验</h2>
          <p>面向课堂实操的实验说明、工程结构和可运行代码草稿。</p>
        </div>
        <div className={`code-lab-preview__status ${streaming && visible.length < content.length ? 'is-streaming' : ''}`}>
          <CircleDot size={12} />
          {statusLabel}
        </div>
      </header>

      <div className="code-lab-preview__workspace">
        <aside className="code-lab-preview__brief" aria-label="实验概览">
          {labBrief.map((section) => {
            const Icon = briefIcon[section.key];
            return (
              <section key={section.key} className="code-lab-preview__brief-section">
                <h3>
                  <Icon size={15} />
                  {section.title}
                </h3>
                <ul>
                  {section.lines.map((line, index) => (
                    <li key={`${section.key}-${index}`}>{line}</li>
                  ))}
                </ul>
              </section>
            );
          })}
        </aside>

        <main className="code-lab-preview__editor" aria-label="代码预览">
          <div className="code-lab-preview__editor-bar">
            <div>
              <FileCode2 size={15} />
              <strong>{selectedBlock.title}</strong>
              <span>{selectedBlock.language}</span>
            </div>
            <div className="code-lab-preview__checks" aria-label="代码质量检查">
              <span>
                <CheckCircle2 size={12} />
                TODO
              </span>
              <span>
                <PlayCircle size={12} />
                Run
              </span>
            </div>
          </div>

          {codeBlocks.length > 1 ? (
            <div className="code-lab-preview__tabs" role="tablist" aria-label="代码块">
              {codeBlocks.map((block, index) => (
                <button
                  key={`${block.title}-${index}`}
                  type="button"
                  className={index === activeBlockIndex ? 'is-active' : ''}
                  onClick={() => setActiveBlockIndex(index)}
                  role="tab"
                  aria-selected={index === activeBlockIndex}
                >
                  {block.title}
                </button>
              ))}
            </div>
          ) : null}

          <div className="code-lab-preview__code-scroll">
            <ol className="code-lab-preview__code-lines">
              {selectedLines.map((line, index) => (
                <li key={`${selectedBlock.title}-${index}`}>
                  <span>{line || ' '}</span>
                </li>
              ))}
            </ol>
          </div>
        </main>
      </div>
    </div>
  );
}
