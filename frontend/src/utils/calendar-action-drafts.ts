export type CalendarActionDraftContext = {
  currentCourseTitle?: string | null;
  selectedDateKey: string;
  selectedEventTitles: string[];
  focusTitle?: string | null;
  conceptId?: string | null;
  pathNodeId?: string | null;
};

function compactTitles(titles: string[]): string {
  const normalized = titles.map((title) => title.trim()).filter(Boolean).slice(0, 4);
  return normalized.length ? normalized.join('、') : '今天的学习安排';
}

/** 生成从学习日历跳转到 AI 对话时预填的计划调整提示词。 */
export function buildCalendarAiDraft({
  currentCourseTitle,
  selectedDateKey,
  selectedEventTitles,
  focusTitle,
}: CalendarActionDraftContext): string {
  const courseText = currentCourseTitle?.trim() || '当前学习计划';
  const focusText = focusTitle?.trim() || compactTitles(selectedEventTitles);
  return [
    `请帮我调整 ${courseText} 在 ${selectedDateKey} 附近的学习安排。`,
    `重点围绕：${focusText}。`,
    '请给出今天到未来 7 天的优先级、每日任务和复盘建议，并说明哪些任务可以延后。',
  ].join('\n');
}

/** 生成从学习日历跳转到测评页时预填的作答提示，用户可直接补充答案后提交。 */
export function buildCalendarAssessmentDraft({
  currentCourseTitle,
  selectedEventTitles,
  focusTitle,
}: Pick<CalendarActionDraftContext, 'currentCourseTitle' | 'selectedEventTitles' | 'focusTitle'>): string {
  const courseText = currentCourseTitle?.trim() || '当前课程';
  const focusText = focusTitle?.trim() || compactTitles(selectedEventTitles);
  return [
    `我想围绕「${courseText}」中的「${focusText}」完成一次自测。`,
    '请以费曼阐述的方式评估我的理解：我会先写出概念解释、关键步骤、一个例子和我仍不确定的问题。',
    '',
    '我的回答：',
  ].join('\n');
}

/** 为日历操作入口附加 draft、知识点和路径节点上下文。 */
export function buildCalendarActionHref(basePath: string, draft: string, context: CalendarActionDraftContext): string {
  const params = new URLSearchParams();
  params.set('draft', draft);
  if (context.conceptId) params.set('concept', context.conceptId);
  if (context.pathNodeId) params.set('path_node', context.pathNodeId);
  return `${basePath}?${params.toString()}`;
}
