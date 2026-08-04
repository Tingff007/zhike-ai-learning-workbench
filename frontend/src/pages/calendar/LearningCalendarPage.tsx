import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  BookOpenCheck,
  CalendarCheck2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileText,
  Flame,
  Layers,
  MessageCircleQuestion,
  RotateCcw,
  Sparkles,
  Target,
} from 'lucide-react';
import { CourseSwitcher } from '../../components/shared/CourseSwitcher';
import { ErrorState, LoadingState } from '../../components/shared/StateBlock';
import { OverlayPageShell } from '../../components/shared/OverlayPageShell';
import { PageHeaderToolbar } from '../../components/shared/PageHeader';
import { api } from '../../api/endpoints';
import { useCourseQueries } from '../../hooks/useCourseData';
import { useCourseContextStore } from '../../stores/course-context.store';
import { useSessionStore } from '../../stores/session.store';
import type { AnnouncementItem, LearningScheduleItem, PathNode, Resource } from '../../types';
import {
  buildCalendarActionHref,
  buildCalendarAiDraft,
  buildCalendarAssessmentDraft,
} from '../../utils/calendar-action-drafts';
import { semanticClass, toneToSemantic } from './calendarTokens';
import type { CalendarTone } from './calendarTypes';
import { UpcomingTaskList } from './UpcomingTaskList';
import { formatCalendarTaskDisplayTitle, toUpcomingTaskViewModel } from './upcomingTaskUtils';

type CalendarEvent = {
  id: string;
  dateKey: string;
  title: string;
  helper: string;
  timeLabel: string;
  tone: CalendarTone;
  to: string;
  Icon: LucideIcon;
  persistedId?: string;
  status?: string;
  sourceType?: string;
  sourceId?: string | null;
  itemType?: string;
  conceptId?: string | null;
  pathNodeId?: string | null;
};

type CalendarDay = {
  date: Date;
  dateKey: string;
  label: number;
  inMonth: boolean;
  isToday: boolean;
};

type CalendarMetric = {
  label: string;
  value: string;
  helper: string;
  Icon: LucideIcon;
};

const weekdayShortLabels = ['一', '二', '三', '四', '五', '六', '日'] as const;

const monthFormatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' });
const dayFormatter = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number): Date {
  const next = startOfDay(value);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromNullable(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildMonthDays(referenceDate: Date, today: Date): CalendarDay[] {
  const firstDay = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = addDays(firstDay, -mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    const dateKey = toDateKey(date);
    return {
      date,
      dateKey,
      label: date.getDate(),
      inMonth: date.getMonth() === referenceDate.getMonth(),
      isToday: dateKey === toDateKey(today),
    };
  });
}

function getNodeStatusLabel(status: PathNode['status'] | undefined): string {
  const labels: Record<string, string> = {
    learning: '进行中',
    review: '待复盘',
    needs_remedial: '需补救',
    not_started: '待开始',
    mastered: '已掌握',
  };
  return labels[status ?? ''] ?? '学习节点';
}

function pickFocusNode(nodes: PathNode[]): PathNode | undefined {
  const priority: PathNode['status'][] = ['learning', 'review', 'needs_remedial', 'not_started'];
  return priority.map((status) => nodes.find((node) => node.status === status)).find(Boolean) ?? nodes[0];
}

function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((first, second) => {
    if (first.dateKey !== second.dateKey) return first.dateKey.localeCompare(second.dateKey);
    return first.timeLabel.localeCompare(second.timeLabel);
  });
}

function buildGeneralEvents(today: Date): CalendarEvent[] {
  const dateKeys = Array.from({ length: 6 }, (_, index) => toDateKey(addDays(today, index)));
  return [
    {
      id: 'general-focus',
      dateKey: dateKeys[0],
      title: '确定本周学习主题',
      helper: '先把目标压缩成一个 25 分钟可完成的主题，避免一上来铺太大。',
      timeLabel: '09:30',
      tone: 'focus',
      to: '/ai-room',
      Icon: Target,
      sourceType: 'general_plan',
      sourceId: 'general-focus',
      itemType: 'focus',
    },
    {
      id: 'general-plan',
      dateKey: dateKeys[1],
      title: '让 AI 拆一条轻量计划',
      helper: '把主题拆成讲义、练习和复盘三个动作，形成连续学习流。',
      timeLabel: '10:00',
      tone: 'open',
      to: '/dashboard',
      Icon: Sparkles,
      sourceType: 'general_plan',
      sourceId: 'general-plan',
      itemType: 'open',
    },
    {
      id: 'general-resource',
      dateKey: dateKeys[2],
      title: '生成一份个人讲义',
      helper: '用通用资源生成能力沉淀 Markdown 资料，后续可归档到课程。',
      timeLabel: '14:30',
      tone: 'resource',
      to: '/ai-room',
      Icon: FileText,
      sourceType: 'general_plan',
      sourceId: 'general-resource',
      itemType: 'resource',
    },
    {
      id: 'general-review',
      dateKey: dateKeys[4],
      title: '回看错点和遗留问题',
      helper: '把最近的问题整理成复盘卡，更新全局学习画像。',
      timeLabel: '19:40',
      tone: 'review',
      to: '/learning-profile',
      Icon: RotateCcw,
      sourceType: 'general_plan',
      sourceId: 'general-review',
      itemType: 'review',
    },
  ];
}

function mapScheduleEvents(items: LearningScheduleItem[]): CalendarEvent[] {
  const iconByType: Record<string, LucideIcon> = {
    focus: BookOpenCheck,
    review: RotateCcw,
    resource: FileText,
    assessment: ClipboardCheck,
    notice: Bell,
    open: Target,
  };
  return items.map((item) => {
    const itemType = item.item_type || 'focus';
    const tone = (['focus', 'review', 'resource', 'assessment', 'notice', 'open'].includes(itemType) ? itemType : 'focus') as CalendarTone;
    return {
      id: `saved-${item.id}`,
      persistedId: item.id,
      dateKey: item.scheduled_date,
      title: item.title,
      helper: item.description || (item.status === 'completed' ? '已完成的学习安排。' : '已保存到学习日程。'),
      timeLabel: item.time_label || '日程',
      tone,
      to: item.path_node_id
        ? buildPathNodeHref(item.path_node_id, item.concept_id)
        : item.resource_id
          ? `/resource-hall?preview=${encodeURIComponent(item.resource_id)}`
          : '/ai-room',
      Icon: iconByType[itemType] ?? BookOpenCheck,
      status: item.status,
      sourceType: item.source_type,
      sourceId: item.source_id,
      itemType,
      conceptId: item.concept_id,
      pathNodeId: item.path_node_id,
    };
  });
}

function buildCourseEvents(
  today: Date,
  nodes: PathNode[],
  resources: Resource[],
  announcements: AnnouncementItem[],
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const focusNode = pickFocusNode(nodes);

  if (focusNode) {
    events.push({
      id: `focus-${focusNode.id}`,
      dateKey: toDateKey(today),
      title: `继续学习：${focusNode.title}`,
      helper: `${getNodeStatusLabel(focusNode.status)} · 掌握度 ${Math.round(focusNode.mastery)}%，优先完成当前最小学习单元。`,
      timeLabel: '09:20',
      tone: focusNode.status === 'review' || focusNode.status === 'needs_remedial' ? 'review' : 'focus',
      to: buildPathNodeHref(focusNode.id, focusNode.concept_id),
      Icon: BookOpenCheck,
      sourceType: 'path_node',
      sourceId: focusNode.id,
      itemType: focusNode.status === 'review' || focusNode.status === 'needs_remedial' ? 'review' : 'focus',
      conceptId: focusNode.concept_id,
      pathNodeId: focusNode.id,
    });

    events.push({
      id: `assessment-${focusNode.id}`,
      dateKey: toDateKey(addDays(today, 2)),
      title: `小测：${focusNode.title}`,
      helper: '用 5 道题确认关键概念，结果会反哺掌握度和补救建议。',
      timeLabel: '20:00',
      tone: 'assessment',
      to: '/assessment',
      Icon: ClipboardCheck,
      sourceType: 'path_node',
      sourceId: focusNode.id,
      itemType: 'assessment',
      conceptId: focusNode.concept_id,
      pathNodeId: focusNode.id,
    });
  } else {
    events.push({
      id: 'course-empty-path',
      dateKey: toDateKey(today),
      title: '初始化课程学习路径',
      helper: '当前课程还没有路径节点，先进入学习路径页生成章节与下一步任务。',
      timeLabel: '10:00',
      tone: 'open',
      to: '/learning-path',
      Icon: Layers,
    });
  }

  nodes
    .filter((node) => node.status === 'review' || node.status === 'needs_remedial')
    .slice(0, 4)
    .forEach((node, index) => {
      events.push({
        id: `review-${node.id}`,
        dateKey: toDateKey(addDays(today, index + 1)),
        title: `复盘：${node.title}`,
        helper: `${getNodeStatusLabel(node.status)} · 用补救卡或课程资料问答补齐薄弱点。`,
        timeLabel: index % 2 === 0 ? '16:30' : '19:30',
        tone: 'review',
        to: buildPathNodeHref(node.id, node.concept_id),
        Icon: RotateCcw,
        sourceType: 'path_node',
        sourceId: node.id,
        itemType: 'review',
        conceptId: node.concept_id,
        pathNodeId: node.id,
      });
    });

  nodes
    .filter((node) => node.status === 'not_started')
    .slice(0, 5)
    .forEach((node, index) => {
      events.push({
        id: `next-${node.id}`,
        dateKey: toDateKey(addDays(today, index + 1)),
        title: `预习：${node.title}`,
        helper: '提前浏览概念定义和前置知识，降低下一关启动成本。',
        timeLabel: index % 2 === 0 ? '10:30' : '15:00',
        tone: 'open',
        to: buildPathNodeHref(node.id, node.concept_id),
        Icon: Target,
        sourceType: 'path_node',
        sourceId: node.id,
        itemType: 'open',
        conceptId: node.concept_id,
        pathNodeId: node.id,
      });
    });

  resources.slice(0, 5).forEach((resource, index) => {
    const resourceDate = dateFromNullable(resource.updated_at);
    const dateKey = resourceDate ? toDateKey(resourceDate) : toDateKey(addDays(today, index + 1));
    events.push({
      id: `resource-${resource.id}`,
      dateKey,
      title: `资源复习：${resource.title}`,
      helper: resource.summary || '打开资源详情，结合课程进度补充学习材料。',
      timeLabel: index % 2 === 0 ? '13:40' : '18:20',
      tone: 'resource',
      to: `/resource-hall?preview=${encodeURIComponent(resource.id)}`,
      Icon: FileText,
      sourceType: 'resource',
      sourceId: resource.id,
      itemType: 'resource',
    });
  });

  announcements.slice(0, 4).forEach((announcement) => {
    const announcementDate = dateFromNullable(announcement.effective_at ?? announcement.created_at) ?? today;
    events.push({
      id: `notice-${announcement.id}`,
      dateKey: toDateKey(announcementDate),
      title: announcement.title,
      helper: announcement.summary,
      timeLabel: '公告',
      tone: 'notice',
      to: `/announcements?active=${encodeURIComponent(announcement.id)}`,
      Icon: Bell,
      sourceType: 'announcement',
      sourceId: announcement.id,
      itemType: 'notice',
    });
  });

  return events;
}

function buildPathNodeHref(pathNodeId: string, conceptId?: string | null): string {
  const params = new URLSearchParams({ path_node: pathNodeId });
  if (conceptId) params.set('concept', conceptId);
  return `/learning-path?${params.toString()}`;
}

function getEventsByDay(events: CalendarEvent[], dateKey: string): CalendarEvent[] {
  return sortEvents(events.filter((event) => event.dateKey === dateKey));
}

function buildMetrics(
  events: CalendarEvent[],
  nodes: PathNode[],
  selectedEvents: CalendarEvent[],
  visibleMonth: Date,
  isCourseMode: boolean,
): CalendarMetric[] {
  const monthPrefix = `${visibleMonth.getFullYear()}-${String(visibleMonth.getMonth() + 1).padStart(2, '0')}`;
  const monthEventCount = events.filter((event) => event.dateKey.startsWith(monthPrefix)).length;
  const focusCount = events.filter((event) => event.tone === 'focus' || event.tone === 'review').length;
  const completedNodes = nodes.filter((node) => node.status === 'mastered').length;

  return [
    {
      label: '本月安排',
      value: `${monthEventCount}`,
      helper: '学习、复盘、资源与公告',
      Icon: CalendarCheck2,
    },
    {
      label: '待关注',
      value: `${focusCount}`,
      helper: isCourseMode ? '进行中和需补救节点' : '重点学习与复盘安排',
      Icon: Flame,
    },
    {
      label: '已掌握',
      value: nodes.length ? `${completedNodes}/${nodes.length}` : '0/0',
      helper: isCourseMode ? '来自课程学习路径' : '选择课程后显示掌握度',
      Icon: CheckCircle2,
    },
    {
      label: '选中日期',
      value: `${selectedEvents.length}`,
      helper: '当天可执行事项',
      Icon: Clock3,
    },
  ];
}

type CalendarTaskRowProps = {
  event: CalendarEvent;
  actions?: ReactNode;
};

/** 今日待办行：圆圈勾选 + 单行完整标题 + 右侧文字操作，不含进度 */
function CalendarTaskRow({ event, actions }: CalendarTaskRowProps): JSX.Element {
  const completed = event.status === 'completed';
  const displayTitle = formatCalendarTaskDisplayTitle(event.title);

  return (
    <article className={`lc-todo-row ${completed ? 'lc-todo-row--done' : ''}`}>
      <span
        className={`lc-todo-check ${completed ? 'lc-todo-check--done' : ''}`}
        aria-label={completed ? '已完成' : '未完成'}
        role="img"
      >
        {completed ? <Check size={11} strokeWidth={3} /> : null}
      </span>
      <Link to={event.to} className="lc-todo-row__title" title={displayTitle}>
        {displayTitle}
      </Link>
      {actions ? <div className="lc-todo-row__actions">{actions}</div> : null}
    </article>
  );
}

/** 学习日历页把课程路径、资源和公告聚合为可执行的日期视图。 */
export function LearningCalendarPage(): JSX.Element {
  const queryClient = useQueryClient();
  const today = useMemo(() => startOfDay(new Date()), []);
  const [visibleMonth, setVisibleMonth] = useState<Date>(today);
  const [selectedDateKey, setSelectedDateKey] = useState<string>(toDateKey(today));
  const { currentCourseId, currentCourseTitle, learningScope } = useCourseContextStore();
  const user = useSessionStore((state) => state.user);
  const isCourseMode = learningScope === 'course' && Boolean(currentCourseId);
  const { path, mastery, resources } = useCourseQueries();
  const announcementQuery = useQuery({
    queryKey: ['calendar-announcements'],
    queryFn: () => api.announcements({ limit: 30 }),
    enabled: Boolean(user),
    staleTime: 60_000,
  });
  const monthDays = useMemo(() => buildMonthDays(visibleMonth, today), [today, visibleMonth]);
  const scheduleStartDate = monthDays[0]?.dateKey;
  const scheduleEndDate = monthDays[monthDays.length - 1]?.dateKey;
  const scheduleQuery = useQuery({
    queryKey: ['learning-schedules', currentCourseId ?? 'general', scheduleStartDate, scheduleEndDate],
    queryFn: () => api.learningSchedules({
      courseId: isCourseMode ? currentCourseId : null,
      startDate: scheduleStartDate,
      endDate: scheduleEndDate,
    }),
    enabled: Boolean(user && scheduleStartDate && scheduleEndDate),
    staleTime: 30_000,
  });
  const saveScheduleMutation = useMutation({
    mutationFn: (event: CalendarEvent) => api.createLearningSchedule({
      course_id: isCourseMode ? currentCourseId : null,
      concept_id: event.sourceType === 'path_node' ? event.sourceId : null,
      path_node_id: event.sourceType === 'path_node' ? event.sourceId : null,
      resource_id: event.sourceType === 'resource' ? event.sourceId : null,
      source_type: event.sourceType ?? 'calendar_suggestion',
      source_id: event.sourceId ?? event.id,
      item_type: event.itemType ?? event.tone,
      title: event.title,
      description: event.helper,
      scheduled_date: event.dateKey,
      time_label: event.timeLabel,
      priority: event.tone === 'focus' ? 80 : event.tone === 'review' ? 70 : 50,
      meta_json: { target_href: event.to, generated_from: 'learning_calendar' },
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learning-schedules'] });
    },
  });
  const updateScheduleMutation = useMutation({
    mutationFn: ({ itemId, status }: { itemId: string; status: 'planned' | 'completed' }) => api.updateLearningSchedule(itemId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learning-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['mastery', currentCourseId] });
      queryClient.invalidateQueries({ queryKey: ['path', currentCourseId] });
    },
  });

  const nodes = path.data?.items ?? [];
  const resourceItems = resources.data?.items ?? [];
  const announcementItems = announcementQuery.data?.items ?? [];
  const scheduleItems = scheduleQuery.data?.items ?? [];
  const generatedEvents = useMemo(
    () => sortEvents(isCourseMode
      ? buildCourseEvents(today, nodes, resourceItems, announcementItems)
      : buildGeneralEvents(today)),
    [announcementItems, isCourseMode, nodes, resourceItems, today],
  );
  const persistedEvents = useMemo(() => mapScheduleEvents(scheduleItems), [scheduleItems]);
  const events = useMemo(
    () => sortEvents([...persistedEvents, ...generatedEvents]),
    [generatedEvents, persistedEvents],
  );
  const selectedDate = useMemo(() => {
    const [year, month, day] = selectedDateKey.split('-').map(Number);
    return new Date(year, month - 1, day);
  }, [selectedDateKey]);
  const selectedEvents = useMemo(() => getEventsByDay(events, selectedDateKey), [events, selectedDateKey]);
  const upcomingEvents = useMemo(
    () => events.filter((event) => event.dateKey >= toDateKey(today)).slice(0, 7),
    [events, today],
  );
  const upcomingTasks = useMemo(
    () => upcomingEvents.map((event) => toUpcomingTaskViewModel(event, nodes)),
    [nodes, upcomingEvents],
  );
  const actionContext = useMemo(() => {
    const focusEvent = selectedEvents.find((event) => event.conceptId || event.pathNodeId)
      ?? upcomingEvents.find((event) => event.conceptId || event.pathNodeId)
      ?? selectedEvents[0]
      ?? upcomingEvents[0];
    const selectedEventTitles = selectedEvents.map((event) => event.title);
    return {
      currentCourseTitle,
      selectedDateKey,
      selectedEventTitles,
      focusTitle: focusEvent?.title,
      conceptId: focusEvent?.conceptId,
      pathNodeId: focusEvent?.pathNodeId,
    };
  }, [currentCourseTitle, selectedDateKey, selectedEvents, upcomingEvents]);
  const aiActionHref = useMemo(
    () => buildCalendarActionHref('/ai-room', buildCalendarAiDraft(actionContext), actionContext),
    [actionContext],
  );
  const assessmentActionHref = useMemo(
    () => isCourseMode
      ? buildCalendarActionHref('/assessment', buildCalendarAssessmentDraft(actionContext), actionContext)
      : '/learning-profile',
    [actionContext, isCourseMode],
  );
  const metrics = useMemo(
    () => buildMetrics(events, nodes, selectedEvents, visibleMonth, isCourseMode),
    [events, isCourseMode, nodes, selectedEvents, visibleMonth],
  );
  const loading = (isCourseMode && (path.isLoading || resources.isLoading)) || scheduleQuery.isLoading;
  const hasError = (isCourseMode && (path.isError || resources.isError)) || scheduleQuery.isError;
  const monthTitle = monthFormatter.format(visibleMonth);
  const overallMastery = Math.round(mastery.data?.overall ?? 0);

  // 进入页面时拉取最新路径与掌握度，保证侧栏进度与详情页一致
  useEffect(() => {
    if (!isCourseMode || !currentCourseId) return;
    void queryClient.refetchQueries({ queryKey: ['path', currentCourseId] });
    void queryClient.refetchQueries({ queryKey: ['mastery', currentCourseId] });
  }, [currentCourseId, isCourseMode, queryClient]);

  function moveMonth(offset: number): void {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function resetToday(): void {
    setVisibleMonth(today);
    setSelectedDateKey(toDateKey(today));
  }

  return (
    <OverlayPageShell
      pageClassName="learning-calendar-page"
      cardClassName="learning-calendar-page__card"
      title="学习日历"
      subtitle="按课程路径、测评与资源安排整理学习任务，支持月视图查看与跟进掌握进度。"
    >
      <div className="lc-layout">
        <div className="lc-layout__fixed">
          <PageHeaderToolbar variant="actions">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 overflow-hidden">
              <div className="learning-calendar-course-switcher min-w-0 max-w-[min(280px,36vw)]">
                <CourseSwitcher />
              </div>
              {isCourseMode && (
                <span className="lc-toolbar-chip hidden min-w-0 truncate xl:inline-flex">
                  <Target size={12} />
                  <span className="truncate">掌握度 {overallMastery}%</span>
                </span>
              )}
            </div>
            <div className="lc-month-nav" aria-label="日历月份控制">
              <button type="button" title="上一月" className="lc-month-nav__btn" onClick={() => moveMonth(-1)}>
                <ChevronLeft size={16} />
              </button>
              <strong className="lc-month-nav__label">{monthTitle}</strong>
              <button type="button" title="下一月" className="lc-month-nav__btn" onClick={() => moveMonth(1)}>
                <ChevronRight size={16} />
              </button>
              <button type="button" className="lc-month-nav__today" onClick={resetToday}>
                今天
              </button>
            </div>
          </PageHeaderToolbar>

          <section className="lc-metrics" aria-label="学习日历统计">
            {metrics.map(({ label, value, helper, Icon }) => (
              <article key={label} className="lc-metric">
                <span className="lc-metric__icon">
                  <Icon size={18} />
                </span>
                <div className="lc-metric__body">
                  <span className="lc-metric__label">{label}</span>
                  <strong className="lc-metric__value">{value}</strong>
                  <p className="lc-metric__helper">{helper}</p>
                </div>
              </article>
            ))}
          </section>

          {loading && <LoadingState label="正在整理课程日历…" />}
          {hasError && <ErrorState label="课程日历加载失败，请确认课程路径和资源接口可用。" />}
        </div>

        {!loading && !hasError && (
          <div className="lc-layout__body">
            <div className="lc-main-left scroller-compact" aria-label="学习日历主栏">
              <section className="lc-calendar-widget" aria-label="月份日历">
                <div className="lc-calendar">
                  <div className="lc-calendar__grid">
                    {weekdayShortLabels.map((label, index) => (
                      <span key={`weekday-${index}`} className="lc-calendar__weekday">
                        {label}
                      </span>
                    ))}
                    {monthDays.map((day) => {
                      const dayEvents = getEventsByDay(events, day.dateKey);
                      const active = selectedDateKey === day.dateKey;
                      const uniqueSemantics = [...new Set(dayEvents.map((event) => toneToSemantic(event.tone, event.status)))].slice(0, 4);
                      return (
                        <button
                          key={day.dateKey}
                          type="button"
                          className={`lc-calendar__cell ${!day.inMonth ? 'lc-calendar__cell--muted' : ''} ${active ? 'lc-calendar__cell--active' : ''} ${day.isToday ? 'lc-calendar__cell--today' : ''}`}
                          aria-pressed={active}
                          aria-label={`${day.label}日${dayEvents.length ? `，${dayEvents.length}项安排` : ''}`}
                          onClick={() => setSelectedDateKey(day.dateKey)}
                        >
                          <span className="lc-calendar__cell-inner">
                            <span className="lc-calendar__day">{day.label}</span>
                            {uniqueSemantics.length > 0 && (
                              <span className="lc-calendar__dots">
                                {uniqueSemantics.map((semantic) => (
                                  <i
                                    key={semantic}
                                    className={`lc-dot ${semanticClass(semantic, 'lc-dot')}`}
                                    title={dayEvents.find((event) => toneToSemantic(event.tone, event.status) === semantic)?.title}
                                  />
                                ))}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            </div>

            <aside className="lc-main-right scroller-compact" aria-label="日程安排侧栏">
              <article className="lc-side-card" aria-label="选中日期安排">
                <header className="lc-side-card__head">
                  <span className="lc-side-card__title">{dayFormatter.format(selectedDate)}</span>
                  <span className="lc-side-card__badge">{selectedEvents.length} 项</span>
                </header>
                <div className="lc-task-list">
                  {selectedEvents.length === 0 && (
                    <p className="lc-task-empty">这一天还没有安排，可以从 AI 学习室补一条计划。</p>
                  )}
                  {selectedEvents.map((event) => {
                    const saved = Boolean(event.persistedId);
                    const completed = event.status === 'completed';
                    return (
                      <CalendarTaskRow
                        key={event.id}
                        event={event}
                        actions={saved ? (
                          <button
                            type="button"
                            className="lc-btn lc-btn--ghost"
                            disabled={updateScheduleMutation.isPending}
                            onClick={() => updateScheduleMutation.mutate({ itemId: event.persistedId!, status: completed ? 'planned' : 'completed' })}
                          >
                            {completed ? '重新计划' : '标记完成'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="lc-btn lc-btn--ghost"
                            disabled={saveScheduleMutation.isPending}
                            onClick={() => saveScheduleMutation.mutate(event)}
                          >
                            保存到日程
                          </button>
                        )}
                      />
                    );
                  })}
                </div>
              </article>

              <article className="lc-side-card" aria-label="近期安排">
                <header className="lc-side-card__head">
                  <span className="lc-side-card__title">近期 7 项任务</span>
                  <Link to={isCourseMode ? '/learning-path' : '/ai-room'} className="lc-side-card__link">
                    继续编排
                  </Link>
                </header>
                <UpcomingTaskList
                  tasks={upcomingTasks}
                  emptyMessage="暂无近期任务，可从学习路径或 AI 学习室添加计划。"
                />
              </article>

              <div className="lc-side-actions">
                <Link to={aiActionHref} className="lc-btn lc-btn--secondary">
                  <MessageCircleQuestion size={14} />
                  问 AI 调整计划
                </Link>
                <Link to={assessmentActionHref} className="lc-btn lc-btn--primary">
                  <ClipboardCheck size={14} />
                  {isCourseMode ? '进入测评' : '查看画像'}
                </Link>
              </div>
            </aside>
          </div>
        )}
      </div>
    </OverlayPageShell>
  );
}
