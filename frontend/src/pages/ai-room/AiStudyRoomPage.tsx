import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  BookOpenCheck,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  FileText,
  Loader2,
  MessageSquarePlus,
  MoreVertical,
  Pencil,
  Search,
  Send,
  Sparkles,
  Square,
  Trash2,
  UserRound,
} from 'lucide-react';
import { MarkdownWithMath } from '../../components/chat/MarkdownWithMath';
import { AnswerSourceAttribution } from '../../components/citation/AnswerSourceAttribution';
import { CitationEvidencePanel } from '../../components/citation/CitationEvidencePanel';
import { ChatDocDesignModeBanner } from '../../components/knowledge/ChatDocDesignModeBanner';
import { PageHeader } from '../../components/shared/PageHeader';
import { api } from '../../api/endpoints';
import { isQuizResourceIntent, QUIZ_COMMAND } from '../../config/chat-commands';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { explainResourceError } from '../../utils/workspace-errors';
import { useAdminCourseAccess } from '../../hooks/useAdminCourseAccess';
import { chatdocFixtureCitations } from '../../data/chatdocFixtures';
import { useChatdocDesignMode } from '../../hooks/useChatdocDesignMode';
import { useChatStream } from '../../hooks/useChatStream';
import { useCourseQueries, useGenerateResourceMutation } from '../../hooks/useCourseData';
import { explainChatError, formatErrorContent } from '../../utils/workspace-errors';
import { GENERAL_CONVERSATION_KEY } from '../../constants/learning-scope';
import { readLocalJson, writeLocalJson } from '../../utils/browser-storage';
import { useCourseContextStore } from '../../stores/course-context.store';
import { useSessionStore } from '../../stores/session.store';
import { buildUrlDraftKey } from '../../app/workspaceDialogueUtils';
import type { AgentTraceEvent, Citation, ProfileDimension, SuggestedAction } from '../../types';
import { AgentTracePanel } from '../../components/agent/AgentTracePanel';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type ChatSession = {
  id: string;
  courseId: string;
  title: string;
  conversationId: string | null;
  updatedAt: number;
};

type AssistantTarget = {
  sessionId: string;
  messageId: string;
};

const SESSION_STORAGE_KEY = 'zhike_ai_room_sessions';
const MESSAGE_STORAGE_KEY = 'zhike_ai_room_messages';

const agentSteps = ['课程上下文检索', '证据核验', '安全审查', '生成回答'];
const readyStatusText = '🤖 Agent 就绪 – 可提问、出题或生成资源';
const promptSuggestions = [
  '帮我解释反向传播的链式法则',
  '根据当前课程生成 5 道选择题',
  '我不懂卷积层和池化层的区别',
  '总结当前课程的学习路径',
];
const responseModes = [
  { label: '讲解', template: '请用通俗语言讲解：' },
  { label: '出题', template: '请围绕当前知识点生成 5 道练习题，并给出答案解析：' },
  { label: '生成资源', template: '请基于当前课程生成一份学习资源：' },
  { label: '诊断薄弱点', template: '请根据我的当前学习记录诊断薄弱点，并给出针对性练习建议。' },
];
const contextScopeOptions = ['本知识点', '全课程'];
const resourcePreviewItems = ['课程讲义摘要', '概念速查卡', '实验步骤模板'];
const practicePreviewItems = ['链式法则选择题', '梯度计算填空题', '反向传播应用题'];
const fallbackProfileDimensions: ProfileDimension[] = [
  { key: 'chain_rule', name: '链式法则', score: 38, label: '需强化', confidence: 0.76, evidence: ['步骤推导容易跳步'] },
  { key: 'gradient', name: '梯度传播', score: 46, label: '待巩固', confidence: 0.72, evidence: ['反向传播路径不稳定'] },
  { key: 'cnn', name: '卷积结构', score: 55, label: '可提升', confidence: 0.68, evidence: ['池化与卷积边界易混淆'] },
];
const weaknessDescriptions: Record<string, string> = {
  knowledge_base: '知识基础整体可用，但链式求导、BatchNorm 推理阶段和池化层差异仍需要补强。',
  cognitive_style: '更适合图解、步骤拆分和结构化总结，建议把复杂公式转成流程图后再练题。',
  hands_on: '动手意愿较强，适合用小实验验证概念，但需要补充实验后的错因复盘。',
  risk: '当前风险集中在反向传播概念混淆，建议优先复习梯度流向和链式法则。',
  chain_rule: '链式法则推导还不稳定，建议先做分步求导题，再进入完整反向传播题。',
  gradient: '梯度传播路径容易断层，建议按计算图逐节点标注局部梯度。',
  cnn: '卷积结构理解处于过渡阶段，建议对比卷积、池化和全连接层的输入输出形状。',
};

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && (value.role === 'user' || value.role === 'assistant')
    && typeof value.content === 'string';
}

function isChatSession(value: unknown): value is ChatSession {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.courseId === 'string'
    && typeof value.title === 'string'
    && (typeof value.conversationId === 'string' || value.conversationId === null)
    && typeof value.updatedAt === 'number';
}

function isMessagesBySession(value: unknown): value is Record<string, ChatMessage[]> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((items) => Array.isArray(items) && items.every(isChatMessage));
}

function isChatSessionArray(value: unknown): value is ChatSession[] {
  return Array.isArray(value) && value.every(isChatSession);
}

function safeSessionTitle(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length > 18 ? `${trimmed.slice(0, 18)}...` : trimmed || '新会话';
}

function getWeaknessDescription(item: ProfileDimension): string {
  const evidence = item.evidence?.[0];
  const evidenceText = typeof evidence === 'string' ? `依据：${evidence}` : '';
  return weaknessDescriptions[item.key] ?? `${item.name}当前得分 ${item.score}，建议查看最近错题并补充针对性练习。${evidenceText}`;
}

function resolveStudyRoomCitations(items: Citation[], useDesignModeFixtures: boolean): Citation[] {
  if (items.length > 0) return items;
  if (api.runtimeInfo().mode === 'mock' || useDesignModeFixtures) return chatdocFixtureCitations();
  return [];
}

function formatSessionTime(value: number): string {
  if (!value) return '刚刚';
  const diff = Date.now() - value;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return new Date(value).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

function compactPreview(value: string): string {
  const text = value.trim().replace(/\s+/g, ' ');
  return text.length > 32 ? `${text.slice(0, 32)}...` : text || '暂无消息';
}

function difficultyText(value?: string): string {
  const map: Record<string, string> = {
    basic: '基础',
    medium: '进阶',
    intermediate: '进阶',
    advanced: '挑战',
  };
  return map[value ?? ''] ?? '知识点';
}

function difficultyClass(value?: string): string {
  if (value === 'advanced') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (value === 'medium' || value === 'intermediate') return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function ModeIcon({ label, active }: { label: string; active: boolean }): JSX.Element {
  const className = active ? 'text-[#2F6BFF]' : 'text-[#2F6BFF]';
  if (label === '讲解') return <BookOpenCheck size={15} className={className} />;
  if (label === '出题') return <Sparkles size={15} className={className} />;
  if (label === '生成资源') return <FileText size={15} className={className} />;
  return <UserRound size={15} className={className} />;
}

function AssistantEmptyState({ title, description }: { title: string; description: string }): JSX.Element {
  return (
    <div className="rounded-md border border-dashed border-[#E9ECEF] bg-[#F8F9FA] p-5 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-md border border-[#D7E2FF] bg-white text-[#2F6BFF]">
        <Sparkles size={24} />
      </div>
      <div className="mt-3 text-sm font-semibold text-[#212529]">{title}</div>
      <p className="mt-2 text-xs leading-5 text-[#6C757D]">{description}</p>
    </div>
  );
}
function LoadingDots(): JSX.Element {
  return (
    <span className="inline-flex items-center gap-2 text-[#6C757D]">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#EEF5FF] text-[#2F6BFF]">
        <Loader2 className="animate-spin" size={15} />
      </span>
      智课助手正在查询课程
      <span className="inline-flex items-end gap-1">
        {[0, 1, 2].map((item) => (
          <span key={item} className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#5B8CFF]" style={{ animationDelay: `${item * 90}ms` }} />
        ))}
      </span>
    </span>
  );
}

function GenerationProgress({ isStreaming }: { isStreaming: boolean }): JSX.Element | null {
  if (!isStreaming) {
    return null;
  }
  return (
    <div className="mt-3 grid gap-1.5 text-xs text-[#6C757D]">
      <div>🔍 检索课程资料... ✅</div>
      <div>🧾 核验引用来源... 🔄</div>
      <div>✍️ 生成回答... ⏳</div>
    </div>
  );
}

function MessageContent({ content, citations }: { content: string; citations: Citation[] }): JSX.Element {
  const parts = content.split(/```/);
  return (
    <div className="space-y-3">
      {parts.map((part, index) => {
        const isCode = index % 2 === 1;
        if (isCode) {
          const code = part.replace(/^\w+\n/, '');
          return (
            <div key={index} className="overflow-hidden rounded-xl border border-[#E9ECEF] bg-[#0f172a]">
              <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-xs text-slate-300">
                <span>代码</span>
                <button className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 hover:bg-white/15" onClick={() => navigator.clipboard?.writeText(code)}>
                  <Copy size={13} /> 复制
                </button>
              </div>
              <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 text-slate-100 [font-family:'JetBrains_Mono',ui-monospace,SFMono-Regular,Menlo,monospace]"><code>{code}</code></pre>
            </div>
          );
        }
        return <MarkdownWithMath key={index} content={part} />;
      })}
      <AnswerSourceAttribution citations={citations} maxItems={6} />
    </div>
  );
}

function StepProgress({
  isStreaming,
  hasMessages,
  trace,
  citations,
}: {
  isStreaming: boolean;
  hasMessages: boolean;
  trace: AgentTraceEvent[];
  citations: Citation[];
}): JSX.Element {
  const activeIndex = useMemo(() => {
    if (!hasMessages) return -1;
    if (!isStreaming) return agentSteps.length;
    if (trace.length > 0) return Math.min(agentSteps.length - 1, trace.length - 1);
    if (citations.length > 0) return 1;
    return 0;
  }, [citations.length, hasMessages, isStreaming, trace.length]);

  const progress = !hasMessages ? 0 : !isStreaming ? 100 : Math.max(16, Math.round(((activeIndex + 1) / agentSteps.length) * 100));

  return (
    <div className="space-y-4">
      <div className="h-2 overflow-hidden rounded-full bg-[#E9ECEF]">
        <div className="h-full rounded-full bg-[#2F6BFF] transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>
      <div className="space-y-3">
        {agentSteps.map((step, index) => {
          const done = hasMessages && (!isStreaming || index < activeIndex);
          const active = hasMessages && isStreaming && index === activeIndex;
          return (
            <div key={step} className="flex items-start gap-3">
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                done ? 'bg-emerald-600 text-white' : active ? 'bg-[#2F6BFF] text-white' : 'bg-[#E9ECEF] text-[#6C757D]'
              }`}>
                {done ? <CheckCircle2 size={14} /> : active ? <Loader2 className="animate-spin" size={13} /> : index + 1}
              </span>
              <div>
                <div className="text-sm font-medium text-[#212529]">{step}</div>
                <div className="mt-1 text-xs text-[#6C757D]">
                  {done ? '已完成' : active ? '处理中' : hasMessages ? '等待中' : '待触发'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {trace.length > 0 && (
        <div className="rounded-md border border-[#E9ECEF] bg-white p-3">
          <div className="mb-2 text-xs font-semibold text-[#6C757D]">实时事件</div>
          <div className="space-y-2">
            {trace.slice(-4).map((event, index) => (
              <div key={`${event.step}-${index}`} className="text-xs leading-5 text-[#6C757D]">
                <span className="font-medium text-[#212529]">{event.step}</span>
                {event.detail ? `：${event.detail}` : `：${event.status}`}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AiStudyRoomPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { isAdminUser: canManageCourses } = useAdminCourseAccess();
  const { active: chatdocDesignMode } = useChatdocDesignMode();
  const { currentCourseId, currentCourseTitle, learningScope, setCurrentCourse, setGeneralMode } = useCourseContextStore();
  const isCourseMode = learningScope === 'course' && Boolean(currentCourseId);
  const activeCourseKey = isCourseMode ? currentCourseId : GENERAL_CONVERSATION_KEY;
  const { concepts, profile, mastery, resources, path } = useCourseQueries();
  const generateResource = useGenerateResourceMutation();
  const isOnline = useOnlineStatus();
  const assistantTargetRef = useRef<AssistantTarget | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const coursePickerRef = useRef<HTMLDivElement | null>(null);
  const consumedUrlDraftRef = useRef<string | null>(null);

  const [conceptId, setConceptId] = useState('');
  const [input, setInput] = useState('');
  const [citations, setCitations] = useState<Citation[]>([]);
  const [trace, setTrace] = useState<AgentTraceEvent[]>([]);
  const [streamStatus, setStreamStatus] = useState(readyStatusText);
  const [courseSearch, setCourseSearch] = useState('');
  const [sessionSearch, setSessionSearch] = useState('');
  const [contextScope, setContextScope] = useState(contextScopeOptions[0]);
  const [sessions, setSessions] = useState<ChatSession[]>(() => readLocalJson<ChatSession[]>(SESSION_STORAGE_KEY, [], isChatSessionArray));
  const [messagesBySession, setMessagesBySession] = useState<Record<string, ChatMessage[]>>(() => readLocalJson<Record<string, ChatMessage[]>>(MESSAGE_STORAGE_KEY, {}, isMessagesBySession));
  const [currentSessionId, setCurrentSessionId] = useState('');
  const [notice, setNotice] = useState('');
  const [assistantProfileOpen, setAssistantProfileOpen] = useState(true);
  const [assistantReferencesOpen, setAssistantReferencesOpen] = useState(true);
  const [activeMode, setActiveMode] = useState(responseModes[0].label);
  const [toolsCollapsed, setToolsCollapsed] = useState(false);
  const [isAgentPanelOpen, setIsAgentPanelOpen] = useState(false);
  const [weaknessDiagnosed, setWeaknessDiagnosed] = useState(false);
  const [openSessionMenuId, setOpenSessionMenuId] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState('');
  const [renameTargetId, setRenameTargetId] = useState('');
  const [renameDraft, setRenameDraft] = useState('');
  const [coursePickerOpen, setCoursePickerOpen] = useState(false);
  const [profileDetailKey, setProfileDetailKey] = useState('');
  const [resourceOpen, setResourceOpen] = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [suggestedActions, setSuggestedActions] = useState<SuggestedAction[]>([]);
  const sessionOpsRef = useRef<{
    updateSessionMessages: (sessionId: string, updater: (items: ChatMessage[]) => ChatMessage[]) => void;
    patchSession: (sessionId: string, patch: Partial<ChatSession>) => void;
  }>({
    updateSessionMessages: () => undefined,
    patchSession: () => undefined,
  });
  const chatStream = useChatStream({
    onTrace: (event): void => {
      setTrace((items) => [...items, event]);
      setStreamStatus(`${event.step}：${event.status}`);
    },
    onCitation: (items): void => {
      const resolved = resolveStudyRoomCitations(items, chatdocDesignMode);
      setCitations(resolved);
      setStreamStatus(
        resolved.length
          ? `已更新 ${resolved.length} 条课程引用${items.length === 0 && resolved.length > 0 ? '（设计模式 Fixture）' : ''}`
          : '未检索到课程引用',
      );
    },
    onDelta: (delta): void => {
      const target = assistantTargetRef.current;
      if (!target) return;
      sessionOpsRef.current.updateSessionMessages(target.sessionId, (items) =>
        items.map((item) => (item.id === target.messageId ? { ...item, content: `${item.content}${delta}` } : item)),
      );
    },
    onSuggestedActions: setSuggestedActions,
    onSessionStarted: (conversationId): void => {
      const target = assistantTargetRef.current;
      if (target) sessionOpsRef.current.patchSession(target.sessionId, { conversationId });
      setStreamStatus(`会话 ${conversationId} 已建立`);
    },
    onDone: (payload): void => {
      const target = assistantTargetRef.current;
      if (target) sessionOpsRef.current.patchSession(target.sessionId, { conversationId: payload.conversationId });
      setCitations(resolveStudyRoomCitations(payload.citations, chatdocDesignMode));
      if (payload.agentTrace.length) setTrace(payload.agentTrace);
      setStreamStatus(readyStatusText);
      setAssistantProfileOpen(true);
      assistantTargetRef.current = null;
    },
    onError: (message): void => {
      const explained = explainChatError(message, { hasCourse: Boolean(currentCourseId), isUserMode: true });
      const content = formatErrorContent(explained);
      const target = assistantTargetRef.current;
      if (target) {
        sessionOpsRef.current.updateSessionMessages(target.sessionId, (items) =>
          items.map((item) => (item.id === target.messageId ? { ...item, content } : item)),
        );
      }
      setStreamStatus(explained.summary);
      assistantTargetRef.current = null;
    },
  });
  const isStreaming = chatStream.isStreaming;

  const coursesQuery = useQuery({
    queryKey: ['ai-room-courses', canManageCourses ? 'admin' : 'mine'],
    queryFn: canManageCourses ? api.adminCourses : api.myCourses,
  });
  const knowledgeCoursesQuery = useQuery({
    queryKey: ['knowledge-courses'],
    queryFn: api.coursesWithKnowledge,
    staleTime: 60_000,
  });
  const knowledgeCourseIds = new Set(knowledgeCoursesQuery.data?.course_ids ?? []);
  const courses = (coursesQuery.data?.items ?? []).filter((course) => knowledgeCourseIds.has(course.id));
  const conceptOptions = concepts.data?.items ?? [];
  const selectedConcept = useMemo(() => conceptOptions.find((item) => item.id === conceptId) ?? conceptOptions[0], [conceptId, conceptOptions]);
  const selectedPathNodeId = useMemo(() => {
    const nodes = path.data?.items ?? [];
    const matched = nodes.find((node) => node.concept_id === selectedConcept?.id);
    return matched?.id ?? null;
  }, [path.data?.items, selectedConcept?.id]);
  const routeConceptId = searchParams.get('concept') ?? '';
  const selectedConceptIndex = selectedConcept ? conceptOptions.findIndex((item) => item.id === selectedConcept.id) : -1;
  const selectedConceptOrder = selectedConcept?.recommended_order ?? (selectedConceptIndex >= 0 ? selectedConceptIndex + 1 : 0);
  const selectedMastery = selectedConcept?.title ? mastery.data?.dimensions?.[selectedConcept.title] : undefined;
  const relatedResourceCount = selectedConcept
    ? (resources.data?.items ?? []).filter((item) => item.concept_id === selectedConcept.id).length
    : 0;
  const prerequisiteTitles = useMemo(() => {
    if (!selectedConcept?.prerequisites?.length) return [];
    return selectedConcept.prerequisites.map((id) => conceptOptions.find((item) => item.id === id)?.title ?? id).slice(0, 3);
  }, [conceptOptions, selectedConcept]);
  const currentSession = sessions.find((session) => session.id === currentSessionId && session.courseId === activeCourseKey);
  const messages = currentSessionId ? messagesBySession[currentSessionId] ?? [] : [];
  const hasMessages = messages.length > 0;
  const userMessageCount = messages.filter((message) => message.role === 'user').length;
  const assistantMessageCount = messages.filter((message) => message.role === 'assistant' && message.content.trim()).length;
  const selectedCourse = courses.find((course) => course.id === currentCourseId);
  const filteredCourses = courses.filter((course) => `${course.title} ${course.id}`.toLowerCase().includes(courseSearch.trim().toLowerCase()));
  const courseSessions = sessions
    .filter((session) => session.courseId === activeCourseKey)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const filteredSessions = courseSessions.filter((session) => session.title.toLowerCase().includes(sessionSearch.trim().toLowerCase()));
  const latestAssistantMessage = [...messages].reverse().find((message) => message.role === 'assistant' && message.content.trim());
  const contextSummary = isCourseMode
    ? `课程：${currentCourseTitle || '未选择'} > ${selectedConcept?.title ?? '未指定'}（${contextScope}）`
    : '通用学习模式 · 不使用课程知识库';
  const profileDimensions = (profile.data?.dimensions ?? []).slice(0, 4);
  const visibleProfileDimensions = profileDimensions.length > 0 ? profileDimensions : (weaknessDiagnosed ? fallbackProfileDimensions : []);
  const selectedProfileDetail = visibleProfileDimensions.find((item) => item.key === profileDetailKey);
  const deleteTargetSession = sessions.find((session) => session.id === deleteTargetId);
  const renameTargetSession = sessions.find((session) => session.id === renameTargetId);

  function sessionPreview(sessionId: string): string {
    const items = messagesBySession[sessionId] ?? [];
    const last = [...items].reverse().find((item) => item.content.trim());
    return compactPreview(last?.content ?? '暂无消息');
  }

  useEffect(() => {
    writeLocalJson(SESSION_STORAGE_KEY, sessions);
  }, [sessions]);

  useEffect(() => {
    writeLocalJson(MESSAGE_STORAGE_KEY, messagesBySession);
  }, [messagesBySession]);

  useEffect(() => {
    return () => {
      chatStream.stop();
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    };
  }, [chatStream]);

  useEffect(() => {
    if (!coursePickerOpen) return;
    function handlePointerDown(event: MouseEvent): void {
      const target = event.target;
      if (!(target instanceof Node) || !coursePickerRef.current?.contains(target)) {
        setCoursePickerOpen(false);
      }
    }
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [coursePickerOpen]);

  useEffect(() => {
    if (conceptOptions.length === 0) {
      if (conceptId) setConceptId('');
      return;
    }
    if (!conceptOptions.some((item) => item.id === conceptId)) {
      setConceptId(conceptOptions[0].id);
    }
  }, [conceptId, conceptOptions]);

  useEffect(() => {
    if (!routeConceptId || conceptOptions.length === 0) return;
    if (conceptOptions.some((item) => item.id === routeConceptId)) {
      setConceptId(routeConceptId);
      setContextScope(contextScopeOptions[0]);
    }
  }, [conceptOptions, routeConceptId]);

  useEffect(() => {
    const draftFromUrl = searchParams.get('draft');
    const draftKey = buildUrlDraftKey(searchParams);
    if (!draftFromUrl || consumedUrlDraftRef.current === draftKey) return;
    consumedUrlDraftRef.current = draftKey;
    setInput(draftFromUrl);
  }, [searchParams]);

  useEffect(() => {
    if (currentSessionId && sessions.some((session) => session.id === currentSessionId && session.courseId === activeCourseKey)) return;
    setCurrentSessionId(courseSessions[0]?.id ?? '');
  }, [activeCourseKey, courseSessions, currentSessionId, sessions]);

  function showNotice(message: string): void {
    setNotice(message);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(''), 2600);
  }

  function patchSession(sessionId: string, patch: Partial<ChatSession>): void {
    setSessions((items) => items.map((item) => item.id === sessionId ? { ...item, ...patch, updatedAt: Date.now() } : item));
  }

  function updateSessionMessages(sessionId: string, updater: (items: ChatMessage[]) => ChatMessage[]): void {
    setMessagesBySession((items) => ({
      ...items,
      [sessionId]: updater(items[sessionId] ?? []),
    }));
    patchSession(sessionId, {});
  }

  sessionOpsRef.current = { updateSessionMessages, patchSession };

  function createSession(title = '新会话'): ChatSession {
    const session: ChatSession = {
      id: createId('session'),
      courseId: activeCourseKey,
      title,
      conversationId: null,
      updatedAt: Date.now(),
    };
    setSessions((items) => [session, ...items]);
    setCurrentSessionId(session.id);
    setMessagesBySession((items) => ({ ...items, [session.id]: [] }));
    setCitations([]);
    setTrace([]);
    setStreamStatus(readyStatusText);
    return session;
  }

  function requestRenameSession(session: ChatSession): void {
    setOpenSessionMenuId('');
    setRenameTargetId(session.id);
    setRenameDraft(session.title);
  }

  function renameSession(): void {
    if (!renameTargetSession) return;
    const nextTitle = renameDraft.trim();
    if (nextTitle && nextTitle !== renameTargetSession.title) {
      patchSession(renameTargetSession.id, { title: nextTitle });
    }
    setRenameTargetId('');
    setRenameDraft('');
  }

  function cancelRenameSession(): void {
    setRenameTargetId('');
    setRenameDraft('');
  }

  function requestDeleteSession(session: ChatSession): void {
    setOpenSessionMenuId('');
    setDeleteTargetId(session.id);
  }

  function deleteSession(session = deleteTargetSession ?? currentSession): void {
    if (!session) return;
    if (isStreaming && currentSessionId === session.id) stopStreaming();
    const nextSession = courseSessions.find((item) => item.id !== session.id);
    setSessions((items) => items.filter((item) => item.id !== session.id));
    setMessagesBySession((items) => {
      const next = { ...items };
      delete next[session.id];
      return next;
    });
    if (currentSessionId === session.id) {
      setCurrentSessionId(nextSession?.id ?? '');
      setCitations([]);
      setTrace([]);
      setStreamStatus(readyStatusText);
    }
    setOpenSessionMenuId('');
    setDeleteTargetId('');
  }

  function handleCourseChange(courseId: string): void {
    if (!courseId) {
      setGeneralMode();
      setCoursePickerOpen(false);
      setCourseSearch('');
      setCitations([]);
      setTrace([]);
      setStreamStatus(readyStatusText);
      return;
    }
    const course = courses.find((item) => item.id === courseId);
    if (!course) return;
    setCurrentCourse(course.id, course.title);
    setCoursePickerOpen(false);
    setCourseSearch('');
    api.updateCurrentCourse(course.id).catch(() => undefined);
    queryClient.invalidateQueries();
    setCitations([]);
    setTrace([]);
    setStreamStatus(readyStatusText);
  }

  function selectConcept(nextConceptId: string): void {
    setConceptId(nextConceptId);
    setContextScope(contextScopeOptions[0]);
  }

  function fillConceptPrompt(kind: 'explain' | 'quiz' | 'resource'): void {
    if (!selectedConcept) {
      showNotice('请先选择课程知识点');
      return;
    }
    const title = selectedConcept.title;
    const scope = contextScope === '全课程' ? `全课程，重点关注「${title}」` : `知识点「${title}」`;
    if (kind === 'quiz') {
      setActiveMode('出题');
      setInput(`请围绕${scope}生成 5 道练习题，覆盖基础概念、易错判断和应用题，并给出答案解析。`);
      return;
    }
    if (kind === 'resource') {
      setActiveMode('生成资源');
      setInput(`请基于${scope}生成一份概念速查卡，包含核心定义、关键步骤、常见误区和复习建议。`);
      return;
    }
    setActiveMode('讲解');
    setInput(`请围绕${scope}做分层讲解：先说明核心概念，再给一个小例子，最后列出常见误区。`);
  }

  function appendAssistantDelta(delta: string): void {
    const target = assistantTargetRef.current;
    if (!target) return;
    updateSessionMessages(target.sessionId, (items) => items.map((item) => (
      item.id === target.messageId ? { ...item, content: `${item.content}${delta}` } : item
    )));
  }

  function replaceAssistantMessage(content: string): void {
    const target = assistantTargetRef.current;
    if (!target) return;
    updateSessionMessages(target.sessionId, (items) => items.map((item) => (
      item.id === target.messageId ? { ...item, content } : item
    )));
  }

  function appendTrace(event: AgentTraceEvent): void {
    setTrace((items) => [...items, event]);
    setStreamStatus(`${event.step}：${event.status}`);
  }

  function stopStreaming(): void {
    chatStream.stop();
    setStreamStatus('已停止生成');
  }

  function ensureActiveSession(message: string): ChatSession {
    if (currentSession) return currentSession;
    return createSession(safeSessionTitle(message));
  }

  async function runQuizResourceTask(activeSession: ChatSession, message: string): Promise<void> {
    if (!isCourseMode) {
      const assistantMessage: ChatMessage = { id: createId('assistant'), role: 'assistant', content: '' };
      assistantTargetRef.current = { sessionId: activeSession.id, messageId: assistantMessage.id };
      updateSessionMessages(activeSession.id, (items) => [...items, assistantMessage]);
      chatStream.send({
        course_id: null,
        learning_scope: 'general',
        conversation_id: activeSession.conversationId,
        message,
        require_citations: false,
        intent_type: 'DEFAULT_CHAT',
      });
      return;
    }
    const conceptForTask = selectedConcept?.id ?? conceptId;
    if (!conceptForTask) {
      showNotice('请先选择知识点，再生成测评题');
      return;
    }
    const courseIdForTask = currentCourseId;
    if (!courseIdForTask) {
      showNotice('请先选择课程后再生成测评题');
      return;
    }
    try {
      const task = await generateResource.mutateAsync({
        course_id: courseIdForTask,
        concept_id: conceptForTask,
        path_node_id: contextScope === '全课程' ? null : selectedPathNodeId,
        resource_type: QUIZ_COMMAND.resourceType ?? 'quiz',
        difficulty: QUIZ_COMMAND.difficulty ?? 'medium',
        goal: message,
        requirements: '与 Workbench 阶段测评题一致，需包含评分要点与错因分析。',
        actionType: 'resource_generation',
        needCourseEvidence: true,
      });
      updateSessionMessages(activeSession.id, (items) => [
        ...items,
        {
          id: createId('assistant'),
          role: 'assistant',
          content: `已创建「${QUIZ_COMMAND.label}」资源任务（${task.task_id}）。可在资源工坊查看生成进度与草稿。`,
        },
      ]);
      showNotice('测评题资源任务已进入队列');
    } catch (error) {
      replaceAssistantMessage(explainResourceError(error, { hasCourse: Boolean(courseIdForTask) }).summary);
    }
  }

  async function runSuggestedResourceAction(action: SuggestedAction): Promise<void> {
    if (!isCourseMode) {
      showNotice('请选择课程后使用课程资源生成');
      return;
    }
    const conceptForTask = selectedConcept?.id ?? conceptId;
    if (!conceptForTask || !currentCourseId) {
      showNotice('请先选择课程与知识点');
      return;
    }
    setSuggestedActions([]);
    try {
      const task = await generateResource.mutateAsync({
        course_id: currentCourseId,
        concept_id: conceptForTask,
        path_node_id: contextScope === '全课程' ? null : selectedPathNodeId,
        resource_type: action.resource_type,
        difficulty: 'medium',
        goal: action.reason,
        requirements: '由 AI 建议操作触发，需包含课程引用与练习。',
        actionType: 'resource_generation',
        needCourseEvidence: true,
      });
      showNotice(`已创建「${action.label}」任务：${task.task_id}`);
    } catch (error) {
      showNotice(explainResourceError(error, { hasCourse: Boolean(currentCourseId) }).summary);
    }
  }

  async function handleSend(): Promise<void> {
    const message = input.trim();
    if (!message || isStreaming) return;
    if (!isOnline && api.runtimeInfo().mode === 'live') {
      showNotice('当前处于离线状态，无法连接 AI 服务。请恢复网络后重试。');
      return;
    }

    const activeSession = ensureActiveSession(message);
    if (!activeSession) return;

    const userMessage: ChatMessage = { id: createId('user'), role: 'user', content: message };
    const assistantMessage: ChatMessage = { id: createId('assistant'), role: 'assistant', content: '' };
    assistantTargetRef.current = { sessionId: activeSession.id, messageId: assistantMessage.id };
    updateSessionMessages(activeSession.id, (items) => [...items, userMessage, assistantMessage]);
    if (activeSession.title === '新会话') patchSession(activeSession.id, { title: safeSessionTitle(message) });
    setTrace([]);
    setCitations([]);
    setSuggestedActions([]);
    setInput('');

    if (isQuizResourceIntent(activeMode, message)) {
      await runQuizResourceTask(activeSession, message);
      return;
    }

    chatStream.send({
      course_id: isCourseMode ? currentCourseId : null,
      learning_scope: isCourseMode ? 'course' : 'general',
      conversation_id: activeSession.conversationId,
      concept_id: isCourseMode && contextScope !== '全课程' ? selectedConcept?.id ?? conceptId : null,
      path_node_id: isCourseMode && contextScope !== '全课程' ? selectedPathNodeId : null,
      message,
      require_citations: isCourseMode,
      intent_type: isCourseMode ? 'KNOWLEDGE_QA' : 'DEFAULT_CHAT',
    });
    if (message.includes('薄弱点') || activeMode === '诊断薄弱点') {
      chatStream.setStreamStatus('正在分析薄弱点...');
    }
  }

  function runWeaknessDiagnosis(): void {
    if (!currentCourseId) {
      showNotice('请先选择课程，再诊断薄弱点');
      return;
    }
    const activeSession = currentSession ?? createSession('薄弱点诊断');
    if (!activeSession) return;
    const report = [
      `基于当前课程「${currentCourseTitle || '未选择课程'}」和知识点「${selectedConcept?.title ?? '未指定'}」，先给出一版学习诊断：`,
      '',
      '1. 当前薄弱点集中在概念迁移和步骤推导，建议先补齐核心定义，再进入练习。',
      '2. 推荐先做 3 组基础题确认概念边界，再做 2 组综合题检查应用能力。',
      '3. 下一步可使用底部“出题”快捷动作，按薄弱点继续生成练习。',
    ].join('\n');
    updateSessionMessages(activeSession.id, (items) => [
      ...items,
      { id: createId('assistant'), role: 'assistant', content: report },
    ]);
    setCurrentSessionId(activeSession.id);
    setWeaknessDiagnosed(true);
    setProfileDetailKey(visibleProfileDimensions[0]?.key ?? fallbackProfileDimensions[0].key);
    setAssistantProfileOpen(true);
    setStreamStatus(readyStatusText);
  }

  function handleUploadLecture(): void {
    showNotice('请到课程知识库上传对应讲义');
  }

  function handleContactAdmin(): void {
    showNotice('已记录需求，请联系管理员补充资料');
  }

  return (
    <div className="relative text-[#212529]">
      {notice && (
        <div className="fixed right-8 top-24 z-30 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 shadow-card">
          {notice}
        </div>
      )}
      {deleteTargetSession && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0F172A]/20 px-4 backdrop-blur-[2px]" onMouseDown={() => setDeleteTargetId('')}>
          <div
            className="ai-message-enter w-full max-w-sm rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-session-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500">
                <Trash2 size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div id="delete-session-title" className="text-base font-bold text-[#111827]">删除这个会话？</div>
                <p className="mt-2 text-sm leading-6 text-[#6B7280]">
                  “{deleteTargetSession.title}” 的聊天记录将被移除，此操作不可恢复。
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="h-9 rounded-full border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#374151] transition hover:bg-[#F8FAFC]" onClick={() => setDeleteTargetId('')}>
                取消
              </button>
              <button className="h-9 rounded-full bg-red-500 px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(239,68,68,0.22)] transition hover:-translate-y-0.5 hover:bg-red-600" onClick={() => deleteSession(deleteTargetSession)}>
                删除会话
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Agent 工作流面板 */}
      <AgentTracePanel
        sessionId={currentSessionId || 'default-session'}
        isOpen={isAgentPanelOpen}
        onClose={() => setIsAgentPanelOpen(false)}
      />
      <PageHeader
        title="AI 学习室"
        subtitle="围绕当前课程提问、追问、出题和生成学习材料。"
        className="mb-5"
      />

      <ChatDocDesignModeBanner className="mb-4" compact />

      <div className={`grid h-[calc(100vh-170px)] min-h-[620px] items-stretch gap-5 transition-[grid-template-columns] duration-300 ${toolsCollapsed ? 'grid-cols-[270px_minmax(0,1fr)_56px]' : 'grid-cols-[270px_minmax(0,1fr)_330px]'}`}>
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#E9ECEF] bg-white shadow-[0_18px_70px_rgba(15,23,42,0.05)]">
          <div className="border-b border-[#E9ECEF] px-3 py-2.5">
            <div className="flex items-center gap-2">
              <div className="shrink-0 text-sm font-bold">课程大纲</div>
              <div ref={coursePickerRef} className="relative z-20 min-w-0 flex-1">
              <button
                type="button"
                className="flex h-8 w-full items-center gap-2 rounded-lg border border-[#D7E2FF] bg-[#F8FAFF] px-2.5 text-left transition hover:border-[#BFD0FF] hover:bg-[#EEF5FF] disabled:cursor-not-allowed disabled:border-[#E5E7EB] disabled:bg-[#F8F9FA] disabled:text-[#98A2B3]"
                disabled={coursesQuery.isLoading || courses.length === 0}
                aria-expanded={coursePickerOpen}
                onClick={() => {
                  if (!coursePickerOpen) setCourseSearch('');
                  setCoursePickerOpen((value) => !value);
                }}
              >
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#1E40AF]">
                    {selectedCourse?.title || currentCourseTitle || (coursesQuery.isLoading ? '课程加载中' : '暂无课程')}
                </span>
                <ChevronDown size={14} className={`shrink-0 text-[#6C757D] transition ${coursePickerOpen ? 'rotate-180 text-[#2F6BFF]' : ''}`} />
              </button>
              {coursePickerOpen && (
                <div className="ai-message-enter absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
                  <div className="border-b border-[#EEF2F7] p-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#98A2B3]" size={14} />
                      <input
                        className="h-9 w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] pl-9 pr-3 text-xs outline-none transition placeholder:text-[#98A2B3] focus:border-[#D7E2FF] focus:bg-white"
                        value={courseSearch}
                        onChange={(event) => setCourseSearch(event.target.value)}
                        placeholder="搜索课程"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-56 overflow-y-auto p-2">
                    <button
                      type="button"
                      className={`mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition ${!isCourseMode ? 'bg-[#EEF5FF] text-[#1D4ED8]' : 'text-[#374151] hover:bg-[#F8FAFC]'}`}
                      onClick={() => handleCourseChange('')}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">通用学习 / 不指定课程</span>
                        <span className="mt-0.5 block truncate text-[11px] text-[#98A2B3]">不使用课程知识库</span>
                      </span>
                      {!isCourseMode && <CheckCircle2 size={16} className="shrink-0 text-[#2F6BFF]" />}
                    </button>
                    {filteredCourses.length === 0 && (
                      <div className="rounded-xl bg-[#F8FAFC] px-3 py-4 text-center text-xs text-[#98A2B3]">
                        {coursesQuery.isLoading ? '课程加载中...' : '没有匹配的课程'}
                      </div>
                    )}
                    {filteredCourses.map((course) => {
                      const active = course.id === currentCourseId;
                      return (
                        <button
                          key={course.id}
                          type="button"
                          className={`mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition last:mb-0 ${active ? 'bg-[#EEF5FF] text-[#1D4ED8]' : 'text-[#374151] hover:bg-[#F8FAFC]'}`}
                          onClick={() => handleCourseChange(course.id)}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{course.title}</span>
                            <span className="mt-0.5 block truncate text-[11px] text-[#98A2B3]">{course.id}</span>
                          </span>
                          {active && <CheckCircle2 size={16} className="shrink-0 text-[#2F6BFF]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              </div>
            </div>
          </div>
          <div className="min-h-[220px] max-h-[390px] shrink-0 overflow-y-auto p-3">
            {!isCourseMode && (
              <div className="space-y-2">
                <AssistantEmptyState title="通用学习模式" description="不绑定课程，可直接提问、规划学习、生成 Markdown 资料。" />
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: '提问', action: () => setInput('请帮我解释：') },
                    { label: '学习计划', action: () => setInput('请帮我制定一份 7 天学习计划：') },
                    { label: '资料生成', action: () => { setActiveMode('生成资源'); setInput('请生成一份 Markdown 学习资料：'); } },
                    { label: '题目生成', action: () => { setActiveMode('出题'); setInput('请生成 5 道练习题并附解析：'); } },
                  ].map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className="rounded-xl border border-[#D7E2FF] bg-[#EEF5FF] px-3 py-2 text-xs font-semibold text-[#2F6BFF] transition hover:bg-[#E3EDFF]"
                      onClick={item.action}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {isCourseMode && conceptOptions.length === 0 && <AssistantEmptyState title="暂无课程大纲" description="选择课程后展示知识点。" />}
            {isCourseMode && conceptOptions.map((concept, index) => {
              const active = concept.id === selectedConcept?.id;
              const order = concept.recommended_order ?? index + 1;
              return (
                <button
                  key={concept.id}
                  className={`mb-2 flex w-full items-start gap-2 rounded-xl border px-2.5 py-2.5 text-left transition ${active ? 'border-[#BFD0FF] bg-[#EEF5FF] text-[#1D4ED8] shadow-[0_10px_24px_rgba(47,107,255,0.10)]' : 'border-transparent text-[#6C757D] hover:border-[#E9ECEF] hover:bg-[#F8F9FA] hover:text-[#212529]'}`}
                  onClick={() => selectConcept(concept.id)}
                  aria-pressed={active}
                >
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${active ? 'bg-[#2F6BFF] text-white' : 'bg-[#F1F5F9] text-[#64748B]'}`}>
                    {order}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{concept.title}</span>
                      {active && <CheckCircle2 size={14} className="shrink-0 text-[#2F6BFF]" />}
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-[11px] text-[#98A2B3]">
                      <span className={`rounded-full border px-2 py-0.5 ${difficultyClass(concept.difficulty)}`}>{difficultyText(concept.difficulty)}</span>
                      {concept.prerequisites?.length ? <span className="truncate">前置 {concept.prerequisites.length}</span> : <span>起点</span>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="shrink-0 border-t border-[#E9ECEF] bg-[#FBFCFE] p-3">
            {isCourseMode && selectedConcept ? (
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#6C757D]">学习焦点</div>
                    <div className="mt-1 truncate text-sm font-bold text-[#111827]">{selectedConcept.title}</div>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${difficultyClass(selectedConcept.difficulty)}`}>
                    第 {selectedConceptOrder || '-'} 节
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#6C757D]">
                  {selectedConcept.definition || '该知识点尚未补充定义。'}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
                  <div className="rounded-lg bg-white px-2 py-2 ring-1 ring-[#E9ECEF]">
                    <div className="font-bold text-[#111827]">{Number.isFinite(selectedMastery) ? `${selectedMastery}%` : '-'}</div>
                    <div className="mt-0.5 text-[#98A2B3]">掌握</div>
                  </div>
                  <div className="rounded-lg bg-white px-2 py-2 ring-1 ring-[#E9ECEF]">
                    <div className="font-bold text-[#111827]">{relatedResourceCount}</div>
                    <div className="mt-0.5 text-[#98A2B3]">资源</div>
                  </div>
                  <div className="rounded-lg bg-white px-2 py-2 ring-1 ring-[#E9ECEF]">
                    <div className="font-bold text-[#111827]">{prerequisiteTitles.length}</div>
                    <div className="mt-0.5 text-[#98A2B3]">前置</div>
                  </div>
                </div>
                {prerequisiteTitles.length > 0 && (
                  <div className="mt-2 truncate text-[11px] text-[#98A2B3]">
                    前置：{prerequisiteTitles.join(' / ')}
                  </div>
                )}
                <div className="mt-3 grid grid-cols-2 rounded-xl bg-[#EEF2F7] p-1">
                  {contextScopeOptions.map((scope) => (
                    <button
                      key={scope}
                      className={`h-8 rounded-lg text-xs font-semibold transition ${contextScope === scope ? 'bg-white text-[#2F6BFF] shadow-[0_6px_14px_rgba(15,23,42,0.08)]' : 'text-[#6C757D] hover:text-[#212529]'}`}
                      onClick={() => setContextScope(scope)}
                    >
                      {scope}
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-[#D7E2FF] bg-white text-xs font-semibold text-[#2F6BFF] transition hover:bg-[#EEF5FF]" onClick={() => fillConceptPrompt('explain')}>
                    <BookOpenCheck size={13} />讲解
                  </button>
                  <button className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-white text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50" onClick={() => fillConceptPrompt('quiz')}>
                    <Sparkles size={13} />出题
                  </button>
                  <button className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-[#E9ECEF] bg-white text-xs font-semibold text-[#4B5563] transition hover:bg-[#F8F9FA]" onClick={() => fillConceptPrompt('resource')}>
                    <FileText size={13} />资源
                  </button>
                </div>
              </div>
            ) : (
              <AssistantEmptyState title="未选择知识点" description="选择课程后可指定学习焦点。" />
            )}
          </div>
          <div className="flex min-h-0 flex-1 flex-col border-t border-[#E9ECEF] p-4">
            <div className="mb-3 text-sm font-bold text-[#111827]">会话列表</div>
            <div className="mb-3 flex items-center gap-2">
              <button className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-[#D7E2FF] bg-[#EEF5FF] px-3 text-xs font-semibold text-[#2F6BFF] shadow-[0_8px_20px_rgba(47,107,255,0.10)] transition hover:-translate-y-0.5 hover:bg-[#E3EDFF]" onClick={() => createSession()}>
                <MessageSquarePlus size={14} /> 新会话
              </button>
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6C757D]" size={15} />
                <input className="input h-9 w-full rounded-full border-[#E9ECEF] bg-white pl-9 pr-2 text-xs" value={sessionSearch} onChange={(event) => setSessionSearch(event.target.value)} placeholder="搜索会话" aria-label="搜索会话" />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {filteredSessions.length === 0 && <div className="rounded-xl border border-dashed border-[#E9ECEF] p-3 text-xs text-[#6C757D]">暂无会话，点击“新会话”开始。</div>}
              {filteredSessions.map((session) => (
                <div key={session.id} className="group relative mb-2">
                  {renameTargetId === session.id ? (
                    <div className={`w-full rounded-xl border-l-2 px-3 py-2.5 pr-10 text-left transition ${session.id === currentSessionId ? 'border-l-[#2F6BFF] bg-[#F8FAFC]' : 'border-l-transparent bg-[#F8FAFC]'}`}>
                      <input
                        className="h-7 w-full rounded-lg border border-[#D7E2FF] bg-white px-2 text-sm font-semibold text-[#1E40AF] outline-none transition focus:border-[#2F6BFF] focus:ring-2 focus:ring-[#D7E2FF]/70"
                        value={renameDraft}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onFocus={(event) => event.currentTarget.select()}
                        onBlur={renameSession}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            renameSession();
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            cancelRenameSession();
                          }
                        }}
                        maxLength={40}
                        aria-label="编辑会话名称"
                        autoFocus
                      />
                      <span className="mt-1 flex items-center justify-between gap-2 text-[11px] text-[#98A2B3]">
                        <span className="min-w-0 truncate">{sessionPreview(session.id)}</span>
                        <span className="shrink-0">{formatSessionTime(session.updatedAt)}</span>
                      </span>
                    </div>
                  ) : (
                    <button
                      className={`w-full rounded-xl border-l-2 px-3 py-2.5 pr-10 text-left transition ${session.id === currentSessionId ? 'border-l-[#2F6BFF] bg-[#F8FAFC]' : 'border-l-transparent text-[#6C757D] hover:bg-[#F8F9FA]'}`}
                      onClick={() => {
                        setCurrentSessionId(session.id);
                        setTrace([]);
                        setCitations([]);
                        setStreamStatus(readyStatusText);
                        setOpenSessionMenuId('');
                      }}
                    >
                      <span className={`block truncate text-sm font-semibold ${session.id === currentSessionId ? 'text-[#1E40AF]' : 'text-[#212529]'}`}>{session.title}</span>
                      <span className="mt-1 flex items-center justify-between gap-2 text-[11px] text-[#98A2B3]">
                        <span className="min-w-0 truncate">{sessionPreview(session.id)}</span>
                        <span className="shrink-0">{formatSessionTime(session.updatedAt)}</span>
                      </span>
                    </button>
                  )}
                  <button
                    className={`absolute right-2 top-3 hidden h-7 w-7 items-center justify-center rounded-md text-[#6C757D] hover:bg-white hover:text-[#2F6BFF] group-hover:flex ${openSessionMenuId === session.id ? '!flex' : ''}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenSessionMenuId((value) => value === session.id ? '' : session.id);
                    }}
                    aria-label="会话更多操作"
                  >
                    <MoreVertical size={15} />
                  </button>
                  {openSessionMenuId === session.id && (
                    <div className="absolute right-2 top-9 z-20 w-28 overflow-hidden rounded-md border border-[#E9ECEF] bg-white py-1 text-xs shadow-card">
                      <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-[#212529] hover:bg-[#F8F9FA]" onClick={() => requestRenameSession(session)}>
                        <Pencil size={13} /> 重命名
                      </button>
                      <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-500 hover:bg-red-50" onClick={() => requestDeleteSession(session)}>
                        <Trash2 size={13} /> 删除
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#E9ECEF] bg-white shadow-[0_24px_90px_rgba(15,23,42,0.07)]">
          <div className="bg-[#FBFCFE] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="text-sm font-medium text-[#212529]">{contextSummary}</div>
                <button
                  onClick={() => setIsAgentPanelOpen(true)}
                 className="inline-flex items-center gap-1.5 rounded-full border border-[#D7E2FF] bg-white px-3 py-1 text-[11px] font-medium text-[#2F6BFF] transition hover:bg-[#EEF5FF] hover:-translate-y-0.5"
                 title="查看 Agent 工作流"
              >
                🤖 Agent 工作流
              </button>
            </div>
            <div className="inline-flex max-w-[260px] items-center gap-2 rounded-full border border-[#D7E2FF] bg-[#EEF5FF] px-3 py-1 text-[11px] font-medium text-[#2F6BFF]">
              <Bot size={13} />
              <span className="truncate">智课助手 · {streamStatus === readyStatusText ? '实时生成' : streamStatus}</span>
           </div>
         </div>
        </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,#FFFFFF,#F8FAFF)] p-5">
            {!hasMessages && (
                    <div className="flex min-h-[430px] items-center justify-center p-8 text-center">
                <div className="max-w-2xl">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF5FF] text-[#2F6BFF]">
                    <Sparkles size={25} />
                  </div>
                  <h2 className="mt-4 text-xl font-bold text-[#212529]">🤖 智课助手就绪，随时提问</h2>
                  <p className="mt-2 text-sm text-[#6C757D]">可以输入课程问题、资源生成指令，或从下方建议开始。</p>
                  <div className="mt-5 grid grid-cols-2 gap-3 text-left">
                    {promptSuggestions.map((prompt) => (
                      <button
                        key={prompt}
                        className="rounded-xl border border-[#E9ECEF] bg-white px-4 py-3 text-sm text-[#212529] transition hover:-translate-y-0.5 hover:border-[#D7E2FF] hover:bg-[#EEF5FF] hover:text-[#2F6BFF]"
                        onClick={() => setInput(prompt)}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {messages.map((message, index) => {
              const isUser = message.role === 'user';
              const isAssistant = message.role === 'assistant';
              const isActiveAssistant = assistantTargetRef.current?.messageId === message.id && isStreaming;
              const previousSameSender = messages[index - 1]?.role === message.role;
              const nextSameSender = messages[index + 1]?.role === message.role;
              const hasAssistantAnswer = isAssistant && Boolean(message.content.trim());
              const isAssistantError = hasAssistantAnswer && (
                message.content.startsWith('请求失败') ||
                message.content.includes('WebSocket 连接失败') ||
                message.content.includes('当前课程知识库没有找到可靠依据')
              );
              const showActions = hasAssistantAnswer && !isStreaming && !isAssistantError;
              const needsKnowledgeBaseActions = isAssistant && message.content.includes('当前课程知识库没有找到可靠依据');
              const groupedRadius = isUser
                ? `${previousSameSender ? 'rounded-tr-xl' : ''} ${nextSameSender ? 'rounded-br-xl' : ''}`
                : `${previousSameSender ? 'rounded-tl-xl' : ''} ${nextSameSender ? 'rounded-bl-xl' : ''}`;
              const bubbleClass = isUser
                ? `ai-message-enter rounded-[18px] border border-[#E5E7EB] bg-[#F3F4F6] px-5 py-3.5 text-sm leading-7 text-[#111827] shadow-[0_12px_30px_rgba(15,23,42,0.06)] transition duration-150 hover:-translate-y-0.5 hover:bg-[#EEF0F3] hover:shadow-[0_16px_38px_rgba(15,23,42,0.08)] ${groupedRadius}`
                : `ai-message-enter rounded-[18px] border border-[#E5E7EB] bg-white px-5 py-4 text-sm leading-7 text-[#374151] shadow-[0_16px_48px_rgba(15,23,42,0.07)] transition duration-150 hover:-translate-y-0.5 ${groupedRadius}`;
              return (
                <div key={message.id} className={`relative ${nextSameSender ? 'mb-1' : 'mb-5'} flex ${isUser ? 'justify-end' : 'justify-start'} ${showActions ? 'z-10 hover:z-[80] focus-within:z-[80]' : 'z-0'}`}>
                  <div className={`flex max-w-[88%] min-w-0 flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                      <div className={bubbleClass}>
                      {isAssistant && (
                        <div className="mb-2 flex items-center gap-2">
                          <span className="font-semibold text-[#2F6BFF]">智课助手</span>
                          <span className="rounded-full bg-[#EEF5FF] px-2 py-0.5 text-[11px] leading-4 text-[#2F6BFF]">{isActiveAssistant ? '查询中' : isAssistantError ? '需处理' : '已生成'}</span>
                        </div>
                      )}
                      {message.content ? <MessageContent content={message.content} citations={isAssistant ? citations : []} /> : (isAssistant && isStreaming ? <LoadingDots /> : '')}
                      {isActiveAssistant && message.content && <span className="ml-0.5 inline-block h-4 w-1 animate-pulse rounded bg-[#2F6BFF] align-text-bottom" />}
                      {needsKnowledgeBaseActions && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button className="rounded-full border border-[#D7E2FF] bg-[#EEF5FF] px-3 py-1.5 text-xs font-semibold text-[#2F6BFF] transition hover:-translate-y-0.5 hover:bg-[#D7E2FF]" onClick={handleUploadLecture}>
                            📄 上传讲义
                          </button>
                          <button className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:-translate-y-0.5 hover:border-amber-300" onClick={handleContactAdmin}>
                            📢 联系管理员
                          </button>
                        </div>
                      )}
                      {isAssistant && isActiveAssistant && <GenerationProgress isStreaming={isStreaming} />}
                    </div>
                    {showActions && (
                      <div className="relative z-[70] mt-2 flex flex-wrap gap-1.5">
                        {[
                          { label: '保存为资源', icon: <FileText size={15} /> },
                          { label: '生成练习', icon: <Sparkles size={15} /> },
                          { label: '继续追问', icon: <MessageSquarePlus size={15} /> },
                        ].map((action) => (
                          <button
                            key={action.label}
                            aria-label={action.label}
                            className="group relative z-[70] flex h-7 w-7 items-center justify-center rounded-full border border-[#E5E7EB] bg-white text-[#8A94A6] shadow-[0_6px_16px_rgba(15,23,42,0.06)] transition hover:z-[90] hover:-translate-y-0.5 hover:bg-[#F3F4F6] hover:text-[#4B5563] focus:z-[90]"
                          >
                            {action.icon}
                            <span className="pointer-events-none absolute left-1/2 top-full z-[120] mt-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black px-3 py-1.5 text-[11px] font-medium text-white opacity-0 shadow-[0_10px_24px_rgba(15,23,42,0.18)] transition group-hover:opacity-100 group-focus-visible:opacity-100">
                              {action.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="shrink-0 border-t border-[#E9ECEF] bg-white p-4 shadow-[0_-18px_45px_rgba(15,23,42,0.04)]">
            <div className="rounded-[30px] border border-[#E5E7EB] bg-[#F8FAFC] p-3 shadow-[0_18px_52px_rgba(15,23,42,0.08)]">
              {suggestedActions.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {suggestedActions.map((action) => (
                    <button
                      key={`${action.action}-${action.resource_type}`}
                      type="button"
                      className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                      onClick={() => void runSuggestedResourceAction(action)}
                    >
                      一键生成 · {action.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="mb-3 flex flex-wrap gap-2">
                {responseModes.map((mode) => {
                  const active = activeMode === mode.label;
                  return (
                    <button
                      key={mode.label}
                      className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition duration-75 ${active ? 'border border-[#D7E2FF] bg-[#EEF5FF] text-[#2F6BFF] shadow-[0_8px_20px_rgba(47,107,255,0.10)]' : 'bg-white text-[#4B5563] ring-1 ring-[#E5E7EB] hover:-translate-y-0.5 hover:bg-[#EEF5FF] hover:text-[#2F6BFF] hover:ring-[#D7E2FF]'}`}
                      onClick={() => {
                        setActiveMode(mode.label);
                        setInput(mode.template);
                      }}
                    >
                      <ModeIcon label={mode.label} active={active} />
                      {mode.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-end gap-3">
                <textarea
                  className="min-h-[46px] max-h-[150px] flex-1 resize-none rounded-[22px] border border-transparent bg-white px-4 py-3 text-sm leading-6 text-[#212529] outline-none ring-[#2F6BFF]/15 transition focus:border-[#D7E2FF] focus:ring-4"
                  placeholder="💬 输入课程问题、指令或上传文档…"
                  value={input}
                  rows={1}
                  disabled={isStreaming}
                  onChange={(event) => setInput(event.target.value)}
                  onInput={(event) => {
                    event.currentTarget.style.height = 'auto';
                    event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 150)}px`;
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                />
                {isStreaming ? (
                  <button className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#4B5563] transition hover:-translate-y-0.5 hover:bg-[#F3F4F6]" onClick={stopStreaming}><Square size={16} /> 停止</button>
                ) : (
                  <button className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#2F6BFF,#5B8CFF)] text-white shadow-[0_0_0_7px_rgba(47,107,255,0.10),0_14px_30px_rgba(47,107,255,0.32)] transition hover:-translate-y-0.5 hover:shadow-[0_0_0_8px_rgba(47,107,255,0.14),0_18px_38px_rgba(47,107,255,0.38)] disabled:cursor-not-allowed disabled:opacity-45" disabled={!input.trim() || isStreaming} onClick={() => void handleSend()} title="发送">
                    <Send size={20} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        <aside className="relative min-h-0 overflow-visible">
          <button className={`absolute -left-4 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#D7E2FF] bg-white text-[#6C757D] shadow-[0_10px_24px_rgba(15,23,42,0.10)] transition hover:-translate-y-[calc(50%+2px)] hover:text-[#2F6BFF] ${toolsCollapsed ? 'pointer-events-none opacity-0' : 'opacity-100'}`} onClick={() => setToolsCollapsed((value) => !value)} title={toolsCollapsed ? '展开工具区' : '折叠工具区'}>
            {toolsCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
          <button
            className={`absolute right-2 top-1/2 z-20 flex h-12 w-10 -translate-y-1/2 items-center justify-center rounded-2xl border border-[#D7E2FF] bg-white/95 text-[#2F6BFF] shadow-[0_14px_36px_rgba(47,107,255,0.16)] transition hover:-translate-y-[calc(50%+2px)] hover:bg-[#EEF5FF] ${toolsCollapsed ? 'opacity-100' : 'pointer-events-none translate-x-3 opacity-0'}`}
            onClick={() => setToolsCollapsed(false)}
            title="展开工具区"
            aria-label="展开工具区"
          >
            <ChevronLeft size={16} />
          </button>
          <div className={`absolute inset-y-0 right-0 w-[330px] overflow-hidden rounded-2xl border border-[#E9ECEF] bg-white shadow-[0_18px_70px_rgba(15,23,42,0.05)] transition-[opacity,transform] duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${toolsCollapsed ? 'pointer-events-none translate-x-[calc(100%+24px)] opacity-0' : 'translate-x-0 opacity-100'}`}>
            <div className="h-full space-y-3 overflow-y-auto p-5 pr-4">
              <div className="rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
                <CitationEvidencePanel citations={citations} />
              </div>

              <div className="rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
                <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setResourceOpen((value) => !value)}>
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EEF5FF] text-[#2F6BFF]"><FileText size={17} /></span>
                    <span>
                      <span className="block text-sm font-bold text-[#111827]">资源工坊</span>
                      <span className="text-xs text-[#98A2B3]">{resourcePreviewItems.length} 个可生成资源</span>
                    </span>
                  </span>
                  {resourceOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                <div className={`grid transition-[grid-template-rows,opacity,transform,margin] duration-200 ease-out ${resourceOpen ? 'mt-3 translate-x-0 grid-rows-[1fr] opacity-100' : 'mt-0 pointer-events-none translate-x-5 grid-rows-[0fr] opacity-0'}`}>
                  <div className="min-h-0 overflow-hidden">
                    <div className="space-y-2">
                    {resourcePreviewItems.map((item) => (
                      <button key={item} className="w-full rounded-xl bg-[#F8FAFC] px-3 py-2 text-left text-xs text-[#4B5563] transition hover:-translate-y-0.5 hover:bg-[#EEF5FF] hover:text-[#2F6BFF]" onClick={() => setInput(`生成资源：${item}（${selectedConcept?.title ?? currentCourseTitle}）`)}>
                        {item}
                      </button>
                    ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
                <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setPracticeOpen((value) => !value)}>
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-[#10B981]"><Sparkles size={17} /></span>
                    <span>
                      <span className="block text-sm font-bold text-[#111827]">练习评估</span>
                      <span className="text-xs text-[#98A2B3]">{practicePreviewItems.length} 组练习预览</span>
                    </span>
                  </span>
                  {practiceOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                <div className={`grid transition-[grid-template-rows,opacity,transform,margin] duration-200 ease-out ${practiceOpen ? 'mt-3 translate-x-0 grid-rows-[1fr] opacity-100' : 'mt-0 pointer-events-none translate-x-5 grid-rows-[0fr] opacity-0'}`}>
                  <div className="min-h-0 overflow-hidden">
                    <div className="space-y-2">
                    {practicePreviewItems.map((item) => (
                      <button key={item} className="w-full rounded-xl bg-[#F8FAFC] px-3 py-2 text-left text-xs text-[#4B5563] transition hover:-translate-y-0.5 hover:bg-emerald-50 hover:text-[#047857]" onClick={() => setInput(`出题：请生成${item}，并给出答案解析`)}>
                        {item}
                      </button>
                    ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
                <button className="mb-3 flex w-full items-center justify-between rounded-xl bg-[#F8FAFC] px-3 py-2 text-sm font-semibold" onClick={() => setAssistantProfileOpen((value) => !value)}>
                  <span className="inline-flex items-center gap-2"><UserRound size={17} className="text-[#2F6BFF]" />薄弱点画像</span>
                  {assistantProfileOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                <div className={`grid transition-[grid-template-rows,opacity,transform,margin] duration-200 ease-out ${assistantProfileOpen ? 'translate-x-0 grid-rows-[1fr] opacity-100' : 'pointer-events-none translate-x-5 grid-rows-[0fr] opacity-0'}`}>
                  <div className="min-h-0 overflow-hidden">
                    <div className="space-y-3 text-sm">
                    {visibleProfileDimensions.length === 0 && (
                      <div className="rounded-xl border border-dashed border-[#E9ECEF] bg-[#F8FAFC] p-5 text-center">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#D7E2FF] bg-white text-[#2F6BFF]">
                          <Sparkles size={24} />
                        </div>
                        <div className="mt-3 text-sm font-semibold text-[#212529]">暂无薄弱点</div>
                        <button className="mt-4 inline-flex h-9 items-center justify-center rounded-full bg-[#2F6BFF] px-4 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#2458D8]" onClick={runWeaknessDiagnosis}>
                          诊断薄弱点
                        </button>
                      </div>
                    )}
                    {visibleProfileDimensions.length > 0 && (
                      <div className="space-y-3">
                        {weaknessDiagnosed && (
                          <div className="rounded-xl bg-[#EEF5FF] px-3 py-2 text-xs leading-5 text-[#2F6BFF]">
                            已按当前课程和知识点更新画像，优先关注得分较低的指标。
                          </div>
                        )}
                        <button className="inline-flex h-8 items-center justify-center rounded-full border border-[#D7E2FF] bg-white px-3 text-xs font-semibold text-[#2F6BFF] transition hover:-translate-y-0.5 hover:bg-[#EEF5FF]" onClick={runWeaknessDiagnosis}>
                          诊断薄弱点
                        </button>
                        {visibleProfileDimensions.map((item) => {
                          const score = Math.max(0, Math.min(100, item.score));
                          return (
                            <button key={item.key} className="flex w-full items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-[#D7E2FF] hover:bg-[#F5F9FF]" onClick={() => setProfileDetailKey(item.key)}>
                              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full p-1" style={{ background: `conic-gradient(#2F6BFF ${score * 3.6}deg, #DBEAFE 0deg)` }}>
                                <span className="flex h-full w-full items-center justify-center rounded-full bg-white text-xs font-bold text-[#1E40AF]">{score}</span>
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold text-[#111827]">{item.name}</span>
                                <span className="mt-0.5 block truncate text-xs text-[#98A2B3]">{item.label ?? '查看薄弱点详情'}</span>
                              </span>
                              <ChevronRight size={16} className="text-[#2F6BFF]" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {selectedProfileDetail && !toolsCollapsed && (
            <div className="ai-slide-panel absolute inset-y-0 right-0 z-30 flex w-full flex-col border-l border-[#E5E7EB] bg-white shadow-[-18px_0_48px_rgba(15,23,42,0.12)]">
              <div className="border-b border-[#E5E7EB] p-5">
                <button className="mb-4 inline-flex h-8 items-center gap-1 rounded-full border border-[#D7E2FF] px-3 text-xs font-semibold text-[#2F6BFF] hover:bg-[#EEF5FF]" onClick={() => setProfileDetailKey('')}>
                  <ChevronRight size={14} className="rotate-180" /> 返回画像
                </button>
                <div className="text-lg font-bold text-[#111827]">{selectedProfileDetail.name}</div>
                <div className="mt-1 text-sm text-[#6B7280]">当前分数 {selectedProfileDetail.score} · 置信度 {Math.round((selectedProfileDetail.confidence ?? 0) * 100)}%</div>
              </div>
              <div className="space-y-4 overflow-y-auto p-5 text-sm leading-7 text-[#374151]">
                <div className="rounded-2xl bg-[#EEF5FF] p-4 text-[#1D4ED8]">{getWeaknessDescription(selectedProfileDetail)}</div>
                <div>
                  <div className="mb-2 text-xs font-bold text-[#6B7280]">依据</div>
                  <div className="space-y-2">
                    {selectedProfileDetail.evidence?.length ? selectedProfileDetail.evidence.map((item, index) => (
                      <div key={index} className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2 text-xs text-[#4B5563]">
                        {typeof item === 'string' ? item : JSON.stringify(item)}
                      </div>
                    )) : <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2 text-xs text-[#4B5563]">暂无更多证据。</div>}
                  </div>
                </div>
                <button className="w-full rounded-full bg-[linear-gradient(135deg,#2F6BFF,#5B8CFF)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(47,107,255,0.24)]" onClick={() => setInput(`请围绕${selectedProfileDetail.name}生成一组针对性练习，并给出解析。`)}>
                  基于该薄弱点出题
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
