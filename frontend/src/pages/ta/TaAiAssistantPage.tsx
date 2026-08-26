import { useEffect, useRef, useState } from 'react';
import { Bot, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { taAgentMessage, type TaAgentMessageResponse, type TaAgentDataFact } from '../../api/ta';
import { PageHeader, PageHeaderToolbar } from '../../components/shared/PageHeader';
import { CitationEvidencePanel } from '../../components/citation/CitationEvidencePanel';
import type { Citation } from '../../types';

/** 教师端对话消息：用户提问或 Agent 回答（含引用、数据事实与步骤轨迹）。 */
type TaChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  dataFacts: TaAgentDataFact[];
  trace: Array<{ step: string; status: string; detail?: string | null }>;
  refused: boolean;
  route: string;
};

const AGENT_STEPS = ['安全审查', '意图路由', '课程解析', '本地知识库检索', '回答生成', '引用核验'];

/** 把 Agent 步骤轨迹按固定步骤顺序归并，未执行的步骤保持待触发状态。 */
function normalizeTrace(trace: TaChatMessage['trace']): Array<{ step: string; status: string; detail?: string | null }> {
  const byStep = new Map<string, { step: string; status: string; detail?: string | null }>();
  for (const item of trace) byStep.set(item.step, item);
  return AGENT_STEPS.map((step) => byStep.get(step) ?? { step, status: 'pending' });
}

function TraceSteps({ trace }: { trace: TaChatMessage['trace'] }): JSX.Element {
  const steps = normalizeTrace(trace);
  return (
    <div className="mt-3 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
        <ShieldCheck className="h-3.5 w-3.5" />
        Agent 执行轨迹（零幻觉防线）
      </div>
      <ol className="space-y-1.5">
        {steps.map((item) => (
          <li key={item.step} className="flex items-start gap-2 text-xs">
            <span
              className={`mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                item.status === 'completed'
                  ? 'bg-emerald-500'
                  : item.status === 'blocked'
                    ? 'bg-red-500'
                    : item.status === 'warning'
                      ? 'bg-amber-500'
                      : 'bg-zinc-300'
              }`}
            />
            <span className="text-zinc-600">{item.step}</span>
            {item.detail ? <span className="text-zinc-400">· {item.detail}</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function DataFactCards({ facts }: { facts: TaAgentDataFact[] }): JSX.Element | null {
  if (facts.length === 0) return null;
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {facts.map((fact) => (
        <div key={fact.label} className="rounded-lg border border-zinc-100 bg-white p-3">
          <div className="text-xs text-zinc-400">{fact.label}</div>
          <div className="mt-1 text-lg font-semibold text-zinc-800">{fact.value}</div>
          {fact.detail ? <div className="mt-0.5 text-xs text-zinc-400">{fact.detail}</div> : null}
        </div>
      ))}
    </div>
  );
}

function AssistantBubble({ message }: { message: TaChatMessage }): JSX.Element {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white">
        <Bot className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl rounded-tl-sm border border-zinc-200 bg-white p-4 text-sm leading-relaxed text-zinc-700">
          {message.refused ? (
            <div className="flex items-start gap-2 text-amber-700">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{message.content}</span>
            </div>
          ) : (
            <p className="whitespace-pre-wrap">{message.content}</p>
          )}
        </div>
        <DataFactCards facts={message.dataFacts} />
        {message.citations.length > 0 ? (
          <div className="mt-3">
            <CitationEvidencePanel citations={message.citations} />
          </div>
        ) : null}
        <TraceSteps trace={message.trace} />
      </div>
    </div>
  );
}

function UserBubble({ message }: { message: TaChatMessage }): JSX.Element {
  return (
    <div className="flex items-start justify-end gap-3">
      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-zinc-900 px-4 py-3 text-sm leading-relaxed text-white">
        {message.content}
      </div>
    </div>
  );
}

/**
 * 教师端 AI 教学助手页：基于本地知识库 RAG 的对话式 Agent。
 *
 * 回答强制携带知识库引用（零幻觉防线），业务数据查询返回数据库真实统计卡片；
 * 证据不足时后端拒答并在回答中明确说明。
 */
export function TaAiAssistantPage(): JSX.Element {
  const [messages, setMessages] = useState<TaChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [courseId, setCourseId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const idCounter = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function handleSend(): Promise<void> {
    const text = input.trim();
    if (!text || loading) return;
    setError(null);
    const userMessage: TaChatMessage = {
      id: `u-${idCounter.current++}`,
      role: 'user',
      content: text,
      citations: [],
      dataFacts: [],
      trace: [],
      refused: false,
      route: '',
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    try {
      const response: TaAgentMessageResponse = await taAgentMessage({
        message: text,
        course_id: courseId || null,
        conversation_id: conversationId,
        require_citations: null,
      });
      setConversationId(response.conversation_id);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${idCounter.current++}`,
          role: 'assistant',
          content: response.answer,
          citations: response.citations ?? [],
          dataFacts: response.data_facts ?? [],
          trace: response.agent_trace ?? [],
          refused: response.refused,
          route: response.route,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 助教暂时不可用，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col px-6 py-6">
      <PageHeader
        title="AI 教学助手"
        subtitle="基于本地课程知识库的教师端 Agent：回答强制携带引用，证据不足时拒答，杜绝幻觉。"
      />
      <PageHeaderToolbar variant="actions">
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-500">课程范围</span>
          <select
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          >
            <option value="">自动（按班级关联课程）</option>
            <option value="cs_foundations">计算机科学基础</option>
            <option value="algorithms">算法与数据结构</option>
            <option value="web_engineering">Web 与前端工程</option>
            <option value="data_system">数据与系统设计</option>
            <option value="ai_ml">机器学习与深度学习</option>
            <option value="llm_agents">大模型与 AI Agent</option>
          </select>
        </div>
      </PageHeaderToolbar>

      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50">
        <div className="flex items-center gap-2 border-b border-zinc-200 bg-white px-4 py-2.5 text-xs text-zinc-500">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          零幻觉模式：回答仅基于本地知识库检索证据，业务数据来自数据库真实记录
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 text-white">
                <Bot className="h-7 w-7" />
              </div>
              <div className="text-lg font-semibold text-zinc-700">向 AI 教学助手提问</div>
              <p className="max-w-md text-sm text-zinc-400">
                例如：「什么是高可用系统」，「帮我梳理 Transformer 注意力机制的教学要点」，
                「我们班作业完成情况如何」
              </p>
            </div>
          ) : (
            messages.map((message) =>
              message.role === 'user' ? (
                <UserBubble key={message.id} message={message} />
              ) : (
                <AssistantBubble key={message.id} message={message} />
              ),
            )
          )}
          {loading ? (
            <div className="flex items-center gap-2 px-1 text-sm text-zinc-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-400" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-400" style={{ animationDelay: '0.15s' }} />
              <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-400" style={{ animationDelay: '0.3s' }} />
              正在检索本地知识库…
            </div>
          ) : null}
          {error ? <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div> : null}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-zinc-200 bg-white p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              rows={2}
              placeholder="输入你的教学问题，Enter 发送，Shift+Enter 换行"
              className="min-h-[44px] flex-1 resize-none rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={loading || !input.trim()}
              className="flex h-11 items-center gap-2 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
