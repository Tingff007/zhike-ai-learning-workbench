import { BookOpen, Brain, FileCheck2, Globe2, Sparkles } from 'lucide-react';
import type { CourseAiContext } from '../types';

export type AnswerMode = 'default_chat' | 'course_rag_qa';

type LearningContextStripProps = {
  isCourseMode: boolean;
  courseTitle?: string | null;
  aiContext: CourseAiContext | null;
  answerMode: AnswerMode;
};

/** 返回课程资料问答不可用时面向用户的提示文案。 */
export function getCourseRagQaBlockingMessage(ctx: CourseAiContext | null | undefined): string {
  if (!ctx) return '课程资料问答上下文加载中，请稍后重试。';
  const reason = ctx.blocking_reason ?? '';
  if (/凭证未配置|未配置|RAG|云端/.test(reason)) {
    return '当前课程未配置云端 RAG / 文档问答服务，请管理员先到网关中心配置。';
  }
  return '当前课程资料还没有完成云端向量化，暂时不能使用课程资料问答。你可以切换为普通 AI 问答。';
}

/** 展示当前对话绑定的课程、画像、知识库状态和问答模式。 */
export function LearningContextStrip({
  isCourseMode,
  courseTitle,
  aiContext,
  answerMode,
}: LearningContextStripProps): JSX.Element {
  const knowledgeReady = isCourseMode && Boolean(aiContext?.chat_input_enabled);
  const modeLabel = isCourseMode ? '课程学习模式' : '通用学习模式';
  const title = isCourseMode ? courseTitle || aiContext?.course_title || '当前课程' : '未指定课程';
  const profileScope = isCourseMode ? '全局画像 + 当前课程画像 + 当前会话' : '全局画像 + 当前会话画像';
  const knowledgeLabel = isCourseMode
    ? knowledgeReady
      ? aiContext?.status_label ?? '课程知识库已就绪'
      : getCourseRagQaBlockingMessage(aiContext)
    : '普通 Chat 与 Markdown 资料生成可用';
  const actionHint = isCourseMode
    ? '普通问题默认走 Chat；需要查课程资料时切换课程资料问答。'
    : '可直接提问、规划学习或生成资料；课程资料问答需先选择课程。';

  return (
    <div className="learning-context-strip" aria-label="当前学习上下文">
      <div className="learning-context-strip__main">
        <span className={`learning-context-strip__mode ${isCourseMode ? 'is-course' : 'is-general'}`}>
          {isCourseMode ? <BookOpen size={14} /> : <Globe2 size={14} />}
          {modeLabel}
        </span>
        <strong>{title}</strong>
        <p>{actionHint}</p>
      </div>
      <div className="learning-context-strip__chips">
        <span>
          <Brain size={13} />
          {profileScope}
        </span>
        <span className={knowledgeReady || !isCourseMode ? 'is-ready' : 'is-blocked'}>
          <FileCheck2 size={13} />
          {knowledgeLabel}
        </span>
        <span>
          <Sparkles size={13} />
          {answerMode === 'course_rag_qa' ? '当前：课程资料问答' : '当前：普通学习对话'}
        </span>
      </div>
    </div>
  );
}
