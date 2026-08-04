/** 通用学习（非课程）会话的本地分组键，禁止作为 course_id 发送给后端。 */
export const GENERAL_CONVERSATION_KEY = '__general__';

export type LearningScope = 'general' | 'course';

export function isGeneralConversationKey(courseId: string): boolean {
  return !courseId || courseId === GENERAL_CONVERSATION_KEY;
}

export function conversationStorageKey(learningScope: LearningScope, currentCourseId: string): string {
  return learningScope === 'general' || !currentCourseId ? GENERAL_CONVERSATION_KEY : currentCourseId;
}
