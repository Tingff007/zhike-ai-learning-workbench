import { useMemo, useState, type CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BookOpen, FileText, Route, ShieldCheck, X } from 'lucide-react';
import type { AgentTraceEvent } from '../types';
import { defaultAgentTraceEvents } from './workspaceDialogueUtils';

type AgentTraceVisualStyle = 'studio';

type AgentRoleKey = 'router' | 'retriever' | 'writer' | 'verifier';

type NormalizedAgentStatus = 'queued' | 'running' | 'completed' | 'blocked' | 'skipped';

type AgentRoleDefinition = {
  key: AgentRoleKey;
  name: string;
  title: string;
  shortLabel: string;
  accent: string;
  Icon: LucideIcon;
  patterns: RegExp[];
};

type AgentPortraitState = AgentRoleDefinition & {
  status: NormalizedAgentStatus;
  detail: string;
  active: boolean;
};

type AgentTraceCapsuleProps = {
  events: AgentTraceEvent[];
};

const defaultAgentTraceVisualStyle: AgentTraceVisualStyle = 'studio';

const agentRoleDefinitions: AgentRoleDefinition[] = [
  {
    key: 'router',
    name: 'Router',
    title: '任务调度',
    shortLabel: '分配上下文',
    accent: '#2563eb',
    Icon: Route,
    patterns: [/router/i, /intent/i, /路由/, /意图/, /上下文/],
  },
  {
    key: 'retriever',
    name: 'Retriever',
    title: '资料检索',
    shortLabel: '整理证据卡',
    accent: '#0f766e',
    Icon: BookOpen,
    patterns: [/retrieve/i, /retriever/i, /rag/i, /检索/, /知识库/, /课程资料/, /证据/],
  },
  {
    key: 'writer',
    name: 'Writer',
    title: '草稿写作',
    shortLabel: '写入 Markdown',
    accent: '#c2410c',
    Icon: FileText,
    patterns: [/generate/i, /generator/i, /writer/i, /resource/i, /生成/, /正文/, /写作/, /资源/],
  },
  {
    key: 'verifier',
    name: 'Verifier',
    title: '引用核验',
    shortLabel: '检查质量',
    accent: '#15803d',
    Icon: ShieldCheck,
    patterns: [/verify/i, /verifier/i, /safety/i, /核验/, /引用/, /安全/, /审查/, /检查/],
  },
];

function normalizeAgentStatus(status: string): NormalizedAgentStatus {
  if (/skipped|skip|cancelled|canceled|跳过|跳過|取消|不检索|不檢索/i.test(status)) return 'skipped';
  if (/blocked|failed|error|阻断|失败|错误|不可用/i.test(status)) return 'blocked';
  if (/running|progress|processing|stream|正在|处理中|生成中/i.test(status)) return 'running';
  if (/completed|done|success|finished|完成|成功|已/i.test(status)) return 'completed';
  return 'queued';
}

function getAgentStatusText(status: NormalizedAgentStatus): string {
  const statusText: Record<NormalizedAgentStatus, string> = {
    queued: '待命',
    running: '进行中',
    completed: '已完成',
    blocked: '需处理',
    skipped: '已跳过',
  };
  return statusText[status];
}

function getAgentStatusAction(role: AgentRoleKey, status: NormalizedAgentStatus): string {
  const actionText: Record<AgentRoleKey, Record<NormalizedAgentStatus, string>> = {
    router: {
      queued: '等待学习任务进入队列',
      running: '正在判断意图并分配上下文',
      completed: '已完成任务分发',
      blocked: '路由判断需要处理',
      skipped: '本轮无需重新路由',
    },
    retriever: {
      queued: '等待课程资料检索',
      running: '正在整理课程证据卡',
      completed: '已完成证据整理',
      blocked: '资料检索需要处理',
      skipped: '本轮不调用课程资料检索',
    },
    writer: {
      queued: '草稿纸已准备',
      running: '正在写入 Markdown 草稿',
      completed: '草稿已生成',
      blocked: '写作任务需要处理',
      skipped: '本轮没有写作输出',
    },
    verifier: {
      queued: '等待引用与质量核验',
      running: '正在检查引用和难度',
      completed: '质量核验已完成',
      blocked: '核验发现需处理项',
      skipped: '本轮不需要引用核验',
    },
  };
  return actionText[role][status];
}

function getAgentFallbackDetail(role: AgentRoleKey): string {
  const fallbackText: Record<AgentRoleKey, string> = {
    router: '等待用户输入并绑定学习上下文',
    retriever: '课程资料检索尚未触发',
    writer: '资源或回答生成尚未触发',
    verifier: '引用核验尚未触发',
  };
  return fallbackText[role];
}

function resolveAgentRoleKey(step: string): AgentRoleKey {
  const definition = agentRoleDefinitions.find((item) => item.patterns.some((pattern) => pattern.test(step)));
  return definition?.key ?? 'router';
}

function compactAgentDetail(value: string | null | undefined, fallback: string): string {
  const text = value?.trim() || fallback;
  return text.length > 46 ? `${text.slice(0, 46)}...` : text;
}

function resolveActiveTraceEvent(events: AgentTraceEvent[]): AgentTraceEvent {
  const source = events.length ? events : defaultAgentTraceEvents;
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const status = normalizeAgentStatus(source[index].status);
    if (status === 'running' || status === 'blocked') return source[index];
  }
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const status = normalizeAgentStatus(source[index].status);
    if (status === 'completed' || status === 'skipped') return source[index];
  }
  return source[0];
}

function buildAgentPortraits(events: AgentTraceEvent[], activeRoleKey: AgentRoleKey): AgentPortraitState[] {
  return agentRoleDefinitions.map((definition) => {
    const matchedEvents = events.filter((event) => resolveAgentRoleKey(event.step) === definition.key);
    const latestEvent = matchedEvents.length ? matchedEvents[matchedEvents.length - 1] : null;
    const status = latestEvent ? normalizeAgentStatus(latestEvent.status) : 'queued';

    return {
      ...definition,
      status,
      detail: compactAgentDetail(latestEvent?.detail, getAgentFallbackDetail(definition.key)),
      active: definition.key === activeRoleKey,
    };
  });
}

function buildWritingPreviewLines(portraits: AgentPortraitState[]): string[] {
  const retriever = portraits.find((item) => item.key === 'retriever');
  const writer = portraits.find((item) => item.key === 'writer');
  const verifier = portraits.find((item) => item.key === 'verifier');
  const writerStatus = writer?.status ?? 'queued';
  const titleLine = writerStatus === 'completed' ? '# 草稿已生成' : writerStatus === 'running' ? '# 正在生成学习资源' : '# 等待写作任务';

  return [
    titleLine,
    `- 写作：${writer ? getAgentStatusAction('writer', writer.status) : getAgentFallbackDetail('writer')}`,
    `- 依据：${retriever?.detail ?? getAgentFallbackDetail('retriever')}`,
    `- 核验：${verifier ? getAgentStatusAction('verifier', verifier.status) : getAgentFallbackDetail('verifier')}`,
  ];
}

/** 展示多智能体流转的折叠式 Trace 弹层。 */
export function AgentTraceCapsule({ events }: AgentTraceCapsuleProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const visibleEvents = useMemo(() => (events.length ? events : defaultAgentTraceEvents), [events]);
  const activeEvent = useMemo(() => resolveActiveTraceEvent(visibleEvents), [visibleEvents]);
  const activeRoleKey = resolveAgentRoleKey(activeEvent.step);
  const portraitStates = useMemo(() => buildAgentPortraits(visibleEvents, activeRoleKey), [activeRoleKey, visibleEvents]);
  const activePortrait = portraitStates.find((item) => item.active) ?? portraitStates[0];
  const activeIndex = Math.max(0, portraitStates.findIndex((item) => item.active));
  const writingPreview = useMemo(() => buildWritingPreviewLines(portraitStates), [portraitStates]);
  const retrieverPortrait = portraitStates.find((item) => item.key === 'retriever');
  const verifierPortrait = portraitStates.find((item) => item.key === 'verifier');
  const visualStyle = defaultAgentTraceVisualStyle;

  return (
    <div className={`agent-trace-wrap agent-trace-wrap--${visualStyle}`}>
      {open && (
        <div className={`agent-trace-popover agent-trace-popover--${visualStyle}`} aria-label="多智能体写作现场">
          <div className="agent-trace-popover__header">
            <div>
              <div className="agent-trace-popover__eyebrow">Agent Trace</div>
              <div className="agent-trace-popover__title">多智能体写作现场</div>
            </div>
            <span className="agent-trace-popover__style-label">小剧场风格</span>
            <button className="ai-icon-button" type="button" title="收起轨迹" onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </div>
          <section className="agent-trace-stage" aria-label="Agent 肖像协作区">
            <div className="agent-trace-stage__status">
              <span className={`agent-trace-stage__pulse agent-trace-stage__pulse--${activePortrait.status}`} />
              <div>
                <span>当前流转</span>
                <strong>{activePortrait.name} · {getAgentStatusAction(activePortrait.key, activePortrait.status)}</strong>
              </div>
            </div>
            <div className="agent-trace-stage__portraits">
              {portraitStates.map((portrait) => {
                const Icon = portrait.Icon;
                return (
                  <article
                    key={portrait.key}
                    className={`agent-portrait agent-portrait--${portrait.key} agent-portrait--${portrait.status} ${portrait.active ? 'is-active' : ''}`}
                    style={{ '--agent-accent': portrait.accent } as CSSProperties}
                  >
                    <div className="agent-portrait__avatar" aria-hidden="true">
                      <Icon size={18} />
                    </div>
                    <div className="agent-portrait__body">
                      <strong>{portrait.name}</strong>
                      <span>{portrait.title}</span>
                    </div>
                    <span className="agent-portrait__status">{getAgentStatusText(portrait.status)}</span>
                  </article>
                );
              })}
            </div>
          </section>
          <section className="agent-writing-desk" aria-label="WriterAgent 写作画面">
            <div className="agent-writing-desk__paper">
              <div className="agent-writing-desk__paper-top">
                <span>Markdown Draft</span>
                <i className={`agent-writing-desk__caret agent-writing-desk__caret--${activePortrait.status}`} />
              </div>
              <div className="agent-writing-desk__lines">
                {writingPreview.map((line, index) => (
                  <p key={`${line}-${index}`}>{line}</p>
                ))}
              </div>
            </div>
            <div className="agent-writing-desk__signals">
              <div>
                <span>证据卡片</span>
                <strong>{retrieverPortrait?.detail ?? getAgentFallbackDetail('retriever')}</strong>
              </div>
              <div>
                <span>核验清单</span>
                <strong>{verifierPortrait?.detail ?? getAgentFallbackDetail('verifier')}</strong>
              </div>
            </div>
          </section>
          <div className="agent-trace-timeline" aria-label="实时 Trace 时间线">
            <div className="agent-trace-timeline__head">
              <span>Trace Timeline</span>
              <strong>{visibleEvents.length} steps</strong>
            </div>
            {visibleEvents.map((event, index) => (
              <div key={`${event.step}-${index}`} className="agent-trace-row">
                <span className={`agent-trace-row__dot agent-trace-row__dot--${normalizeAgentStatus(event.status)}`} />
                <div>
                  <strong>{event.step}</strong>
                  <p>{event.detail ?? event.status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <button className={`agent-trace-capsule ${open ? 'is-open' : ''}`} type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="agent-trace-capsule__chain">
          {['R', 'S', 'G', 'V'].map((item, index) => (
            <i key={item} className={index === activeIndex ? 'is-active' : ''}>{item}</i>
          ))}
        </span>
        <span className="agent-trace-capsule__label">Agent Trace</span>
      </button>
    </div>
  );
}
