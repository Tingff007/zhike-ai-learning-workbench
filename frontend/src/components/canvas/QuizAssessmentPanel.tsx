import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Loader2,
  LockKeyhole,
  MessageSquareText,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Timer,
  Trophy,
} from 'lucide-react';
import { useSubmitAssessmentMutation } from '../../hooks/useCourseData';
import type { AssessmentRubricItem } from '../../types';
import { readSessionJson, removeSessionItem, writeSessionJson } from '../../utils/browser-storage';
import { parseQuizAssessmentMarkdown, type QuizQuestion, type QuizQuestionType } from './quiz-assessment-parser';

type QuizAnswers = Record<string, string | string[]>;

type QuizDraft = {
  answers: QuizAnswers;
  durationSeconds: number;
  savedAt: number;
};

type QuizAssessmentPanelProps = {
  title: string;
  subtitle?: string;
  content: string;
  courseId?: string | null;
  conceptId?: string | null;
  pathNodeId?: string | null;
  resourceId?: string | null;
  streaming?: boolean;
  progress?: number;
  status?: string;
  onCancel?: () => void;
};

const questionTypeLabels: Record<QuizQuestionType, string> = {
  single_choice: '单选题',
  multiple_choice: '多选题',
  blank: '填空题',
  short_answer: '简答题',
};

function answerToText(answer: string | string[] | undefined): string {
  if (Array.isArray(answer)) return answer.join('、');
  return answer ?? '';
}

function isAnswered(question: QuizQuestion, answer: string | string[] | undefined): boolean {
  if (question.type === 'multiple_choice') return Array.isArray(answer) && answer.length > 0;
  return typeof answer === 'string' && answer.trim().length > 0;
}

function isQuizDraft(value: unknown): value is QuizDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<QuizDraft>;
  const answers = draft.answers;
  return Boolean(
    answers
      && typeof answers === 'object'
      && Object.values(answers).every((item) => typeof item === 'string' || (Array.isArray(item) && item.every((option) => typeof option === 'string')))
      && typeof draft.durationSeconds === 'number'
      && typeof draft.savedAt === 'number',
  );
}

function stableDraftKey(input: { courseId?: string | null; conceptId?: string | null; resourceId?: string | null; title: string }): string {
  const source = input.resourceId || `${input.title}:${input.conceptId || 'unknown'}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
  }
  return `quiz-canvas-draft:${input.courseId || 'general'}:${Math.abs(hash).toString(16)}`;
}

function buildSubmissionPayload(questions: QuizQuestion[], answers: QuizAnswers, title: string, resourceId?: string | null): string {
  return JSON.stringify(
    {
      kind: 'stage_assessment_submission',
      title,
      source_resource_id: resourceId ?? null,
      questions: questions.map((question) => ({
        id: question.id,
        order: question.order,
        type: question.type,
        prompt: question.prompt,
        options: question.options,
        expected_answer: question.expectedAnswer,
        student_answer: answers[question.id] ?? '',
        max_score: question.points,
        analysis: question.analysis,
        keywords: question.keywords,
        scoring_points: question.scoringPoints,
      })),
    },
    null,
    2,
  );
}

function rubricMaxScore(item: AssessmentRubricItem | undefined): number | null {
  const value = item && 'max_score' in item ? (item as AssessmentRubricItem & { max_score?: unknown }).max_score : undefined;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function earnedPoints(question: QuizQuestion, item: AssessmentRubricItem | undefined): string {
  if (!item) return '--';
  const maxScore = rubricMaxScore(item) ?? question.points;
  return `${Math.round((item.score / 100) * maxScore)}/${maxScore}`;
}

function isObjectiveQuestion(question: QuizQuestion): boolean {
  return question.type === 'single_choice' || question.type === 'multiple_choice';
}

function answerIncludes(answer: string | string[] | undefined, value: string): boolean {
  if (Array.isArray(answer)) return answer.includes(value);
  return answer === value;
}

function optionStateClass(question: QuizQuestion, answer: string | string[] | undefined, value: string, hasResult: boolean): string {
  const selected = answerIncludes(answer, value);
  if (!hasResult) return selected ? 'is-selected' : '';
  const correct = answerIncludes(question.expectedAnswer, value);
  if (correct && selected) return 'is-selected is-correct';
  if (correct) return 'is-correct';
  if (selected) return 'is-selected is-wrong';
  return '';
}

function scoringMethodLabel(value: string | undefined): string {
  if (value === 'stage_assessment_ai_rubric') return '客观题自动判分 · 主观题 AI 评分';
  if (value === 'stage_assessment_rubric') return '标准答案自动判分';
  if (value === 'llm_rubric') return 'AI Rubric 评分';
  return '智能评分';
}

function buildAiReviewDraft(input: {
  title: string;
  score?: number;
  feedback?: string;
  weakReasons: string[];
  questions: QuizQuestion[];
  answers: QuizAnswers;
  rubricByKey: Map<string, AssessmentRubricItem>;
}): string {
  const wrongQuestions = input.questions
    .filter((question) => (input.rubricByKey.get(question.id)?.score ?? 100) < 80)
    .map((question) => {
      const rubric = input.rubricByKey.get(question.id);
      return [
        `${question.order}. ${question.prompt}`,
        `我的答案：${answerToText(input.answers[question.id]) || '未作答'}`,
        `参考答案：${answerToText(question.expectedAnswer) || '未配置'}`,
        `评分反馈：${rubric?.feedback || question.analysis || '请结合评分点讲解。'}`,
      ].join('\n');
    })
    .join('\n\n');
  return [
    `我刚完成「${input.title}」，得分 ${input.score ?? 0}/100。`,
    `系统反馈：${input.feedback ?? '请结合题目帮助我复盘。'}`,
    `薄弱点：${input.weakReasons.length ? input.weakReasons.join('、') : '暂无明确薄弱点'}`,
    '请只在我已提交的答案基础上讲解错因、关键知识点和下一步练习建议，不要替我重新作答。',
    '',
    wrongQuestions || '本次没有明显错题，请帮我总结可以继续巩固的知识点。',
  ].join('\n');
}

export function QuizAssessmentPanel({
  title,
  subtitle,
  content,
  courseId,
  conceptId,
  pathNodeId,
  resourceId,
  streaming = false,
  progress = 0,
  status,
  onCancel,
}: QuizAssessmentPanelProps): JSX.Element {
  const parsed = useMemo(() => parseQuizAssessmentMarkdown(content, title), [content, title]);
  const submitAssessment = useSubmitAssessmentMutation();
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [draftNotice, setDraftNotice] = useState('');
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const draftKey = useMemo(() => stableDraftKey({ courseId, conceptId, resourceId, title: parsed.title || title }), [conceptId, courseId, parsed.title, resourceId, title]);
  const rubricByKey = useMemo(
    () => new Map((submitAssessment.data?.rubric ?? []).map((item) => [item.key, item] as const)),
    [submitAssessment.data?.rubric],
  );
  const answeredCount = parsed.questions.filter((question) => isAnswered(question, answers[question.id])).length;
  const completionPercent = parsed.questions.length ? Math.round((answeredCount / parsed.questions.length) * 100) : 0;
  const objectiveCount = parsed.questions.filter(isObjectiveQuestion).length;
  const subjectiveCount = parsed.questions.length - objectiveCount;
  const hasResult = Boolean(submitAssessment.data);
  const canSubmit = Boolean(
    courseId
      && conceptId
      && parsed.hasAutoScoringBasis
      && answeredCount === parsed.questions.length
      && !streaming
      && !submitAssessment.isPending
      && !hasResult,
  );
  const submitBlockReason = !courseId
    ? '需要先绑定课程后才能评分并更新画像。'
    : !conceptId
      ? '当前测评资源缺少知识点绑定，暂不能写入画像评分。'
      : !parsed.hasAutoScoringBasis
        ? '题单缺少标准答案或评分要点，暂不能进行可靠自动评分。'
        : streaming
          ? '生成完成后才能提交评分。'
          : answeredCount !== parsed.questions.length
            ? `还剩 ${parsed.questions.length - answeredCount} 道题未作答。`
            : '';
  const aiReviewDraft = useMemo(
    () => buildAiReviewDraft({
      title: parsed.title,
      score: submitAssessment.data?.score,
      feedback: submitAssessment.data?.feedback,
      weakReasons: submitAssessment.data?.weak_reasons ?? [],
      questions: parsed.questions,
      answers,
      rubricByKey,
    }),
    [answers, parsed.questions, parsed.title, rubricByKey, submitAssessment.data?.feedback, submitAssessment.data?.score, submitAssessment.data?.weak_reasons],
  );
  const aiReviewHref = `/ai-room?${new URLSearchParams({
    draft: aiReviewDraft,
    concept: conceptId ?? '',
    mode: 'default_chat',
  }).toString()}`;

  useEffect(() => {
    const draft = readSessionJson<QuizDraft>(draftKey, { answers: {}, durationSeconds: 0, savedAt: 0 }, isQuizDraft);
    setAnswers(draft.savedAt ? draft.answers : {});
    setDurationSeconds(draft.savedAt ? draft.durationSeconds : 0);
    setDraftNotice(draft.savedAt ? '已恢复上次暂存答案' : '');
    setSubmitted(false);
    submitAssessment.reset();
  }, [draftKey]);

  useEffect(() => {
    if (submitted || submitAssessment.isPending || parsed.questions.length === 0) return undefined;
    const timer = window.setInterval(() => setDurationSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [parsed.questions.length, submitAssessment.isPending, submitted]);

  function scrollToQuestion(questionId: string): void {
    setActiveQuestionId(questionId);
    document.getElementById(`quiz-assessment-${questionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function updateAnswer(questionId: string, value: string): void {
    if (submitted || hasResult) return;
    setAnswers((current) => ({ ...current, [questionId]: value }));
    setDraftNotice('');
  }

  function toggleMultipleChoice(questionId: string, value: string): void {
    if (submitted || hasResult) return;
    setAnswers((current) => {
      const selected = Array.isArray(current[questionId]) ? current[questionId] as string[] : [];
      const next = selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value].sort();
      return { ...current, [questionId]: next };
    });
    setDraftNotice('');
  }

  function handleSaveDraft(): void {
    const saved = writeSessionJson<QuizDraft>(draftKey, { answers, durationSeconds, savedAt: Date.now() });
    setDraftNotice(saved ? '答案已暂存到当前浏览器会话' : '暂存失败，请稍后重试');
  }

  function handleReset(): void {
    if (hasResult || submitAssessment.isPending) return;
    setAnswers({});
    setDurationSeconds(0);
    setDraftNotice('');
    removeSessionItem(draftKey);
  }

  function handleSubmit(): void {
    if (!canSubmit || !courseId || !conceptId) return;
    setSubmitted(true);
    submitAssessment.mutate(
      {
        course_id: courseId,
        concept_id: conceptId,
        path_node_id: pathNodeId ?? undefined,
        assessment_type: 'resource_stage_quiz',
        answer: buildSubmissionPayload(parsed.questions, answers, parsed.title, resourceId),
        duration_seconds: durationSeconds,
      },
      {
        onSuccess: () => {
          removeSessionItem(draftKey);
        },
        onError: () => {
          setSubmitted(false);
        },
      },
    );
  }

  function renderQuestionInput(question: QuizQuestion): JSX.Element {
    const answer = answers[question.id];
    if (question.type === 'single_choice') {
      return (
        <div className="quiz-assessment-question__options">
          {question.options.map((option) => (
            <label key={option.value} className={optionStateClass(question, answer, option.value, hasResult)}>
              <input
                type="radio"
                name={question.id}
                checked={answer === option.value}
                disabled={submitted || hasResult}
                onChange={() => updateAnswer(question.id, option.value)}
              />
              <span>{option.value}</span>
              <p>{option.label}</p>
            </label>
          ))}
        </div>
      );
    }
    if (question.type === 'multiple_choice') {
      const selected = Array.isArray(answer) ? answer : [];
      return (
        <div className="quiz-assessment-question__options">
          {question.options.map((option) => (
            <label key={option.value} className={optionStateClass(question, answer, option.value, hasResult)}>
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                disabled={submitted || hasResult}
                onChange={() => toggleMultipleChoice(question.id, option.value)}
              />
              <span>{option.value}</span>
              <p>{option.label}</p>
            </label>
          ))}
        </div>
      );
    }
    if (question.type === 'blank') {
      return (
        <input
          className="quiz-assessment-question__blank"
          value={typeof answer === 'string' ? answer : ''}
          disabled={submitted || hasResult}
          onChange={(event) => updateAnswer(question.id, event.target.value)}
          placeholder="填写你的答案"
        />
      );
    }
    return (
      <textarea
        className="quiz-assessment-question__textarea"
        value={typeof answer === 'string' ? answer : ''}
        disabled={submitted || hasResult}
        onChange={(event) => updateAnswer(question.id, event.target.value)}
        placeholder="写下你的理解、推理过程或实践方案"
      />
    );
  }

  return (
    <section className="quiz-assessment-panel" aria-label="在线阶段测评">
      <header className="quiz-assessment-panel__header">
        <div>
          <span className="quiz-assessment-panel__kicker">
            <ClipboardCheck size={15} />
            在线阶段测评
          </span>
          <h2>{parsed.title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
          <div className="quiz-assessment-panel__facts" aria-label="测评结构">
            <span><ShieldCheck size={13} /> 客观题 {objectiveCount} 道</span>
            <span><Sparkles size={13} /> 主观题 {subjectiveCount} 道</span>
            <span><Trophy size={13} /> 总分 {parsed.totalPoints} 分</span>
          </div>
        </div>
        <div className="quiz-assessment-panel__status">
          {streaming ? (
            <span><Loader2 size={14} className="animate-spin" /> 生成中 {Math.max(0, Math.min(100, progress))}%</span>
          ) : (
            <span><CheckCircle2 size={14} /> {status === 'completed' || status === 'succeeded' ? '可提交评分' : '已载入题单'}</span>
          )}
          {streaming && onCancel ? (
            <button type="button" onClick={onCancel}>
              停止生成
            </button>
          ) : null}
        </div>
      </header>

      {parsed.warnings.length > 0 ? (
        <div className="quiz-assessment-warning" role="alert">
          <AlertCircle size={18} />
          <div>
            {parsed.warnings.map((warning) => <p key={warning}>{warning}</p>)}
          </div>
        </div>
      ) : null}

      <div className="quiz-assessment-shell">
        <aside className="quiz-assessment-nav" aria-label="题目导航">
          <div className="quiz-assessment-nav__summary">
            <div className="quiz-assessment-nav__ring" style={{ '--quiz-progress': `${completionPercent}%` } as CSSProperties}>
              <strong>{completionPercent}%</strong>
            </div>
            <span>{answeredCount}/{parsed.questions.length} 题完成</span>
          </div>
          <div className="quiz-assessment-nav__meta">
            <span><Timer size={13} /> {Math.floor(durationSeconds / 60)}:{String(durationSeconds % 60).padStart(2, '0')}</span>
            <span>{parsed.totalPoints} 分</span>
          </div>
          <div className="quiz-assessment-nav__legend">
            <span><i className="is-answered" /> 已答</span>
            <span><i className="is-active" /> 当前</span>
            <span><i className="is-weak" /> 待复盘</span>
          </div>
          <div className="quiz-assessment-nav__grid">
            {parsed.questions.map((question) => {
              const answered = isAnswered(question, answers[question.id]);
              const rubric = rubricByKey.get(question.id);
              return (
                <button
                  key={question.id}
                  type="button"
                  className={`${activeQuestionId === question.id ? 'is-active' : ''} ${answered ? 'is-answered' : ''} ${rubric && rubric.score < 80 ? 'is-weak' : ''}`}
                  onClick={() => scrollToQuestion(question.id)}
                >
                  {rubric ? (rubric.score >= 80 ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />) : answered ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                  {question.order}
                </button>
              );
            })}
          </div>
          {draftNotice ? <p className="quiz-assessment-nav__notice">{draftNotice}</p> : null}
        </aside>

        <main className="quiz-assessment-questions">
          {parsed.questions.length ? parsed.questions.map((question) => {
            const answered = isAnswered(question, answers[question.id]);
            const rubric = rubricByKey.get(question.id);
            return (
              <article
                key={question.id}
                id={`quiz-assessment-${question.id}`}
                className={`quiz-assessment-question ${answered ? 'is-answered' : ''} ${rubric && rubric.score < 80 ? 'is-weak' : ''}`}
                onFocus={() => setActiveQuestionId(question.id)}
              >
                <div className="quiz-assessment-question__head">
                  <div>
                    <span>{questionTypeLabels[question.type]} · {question.points} 分 · {isObjectiveQuestion(question) ? '自动判分' : 'AI 评分'}</span>
                    <h3>{question.order}. {question.prompt}</h3>
                  </div>
                  {rubric ? (
                    <strong className={rubric.score >= 80 ? 'is-pass' : 'is-low'}>{earnedPoints(question, rubric)}</strong>
                  ) : answered ? (
                    <CheckCircle2 size={18} />
                  ) : null}
                </div>
                {renderQuestionInput(question)}
                {hasResult ? (
                  <div className="quiz-assessment-question__analysis">
                    <strong>参考答案：{answerToText(question.expectedAnswer) || '未配置'}</strong>
                    {rubric ? <p>{rubric.feedback}</p> : null}
                    {rubric?.evidence ? <small>{rubric.evidence}</small> : null}
                    {!rubric && question.analysis ? <p>{question.analysis}</p> : null}
                  </div>
                ) : null}
              </article>
            );
          }) : (
            <div className="quiz-assessment-empty">
              <AlertCircle size={22} />
              <strong>当前内容还不能作为在线测评题单</strong>
              <p>请重新生成包含「选择题、填空题、简答题、参考答案、评分要点」的阶段测评题。</p>
            </div>
          )}
        </main>

        <aside className="quiz-assessment-result" aria-label="评分与反馈">
          {!hasResult && !submitAssessment.isPending ? (
            <div className="quiz-assessment-lock">
              <LockKeyhole size={20} />
              <strong>问 AI 在交卷后开放</strong>
              <p>答题时只保留填写、暂存和提交，提交评分完成后再查看解析和追问 AI。</p>
            </div>
          ) : null}

          {submitAssessment.isPending ? (
            <div className="quiz-assessment-lock">
              <Loader2 size={20} className="animate-spin" />
              <strong>正在智能评分</strong>
              <p>客观题按 AI 生成的标准答案即时核对，主观题通过 AI Rubric 同步评测；后端最多同时发起 5 个模型评分请求。</p>
            </div>
          ) : null}

          {hasResult ? (
            <div className="quiz-assessment-score">
              <div className="quiz-assessment-score__value">
                <strong>{submitAssessment.data?.score ?? 0}</strong>
                <span>/100</span>
              </div>
              <div className="quiz-assessment-score__method">
                <ShieldCheck size={14} />
                {scoringMethodLabel(submitAssessment.data?.scoring_method)}
              </div>
              <p>{submitAssessment.data?.feedback}</p>
              {submitAssessment.data?.progress_report ? <small>{submitAssessment.data.progress_report}</small> : null}
              <div className="quiz-assessment-score__tags">
                {(submitAssessment.data?.weak_reasons ?? []).map((reason) => <span key={reason}>{reason}</span>)}
              </div>
              <div className="quiz-assessment-score__actions">
                <Link to={aiReviewHref}>
                  <MessageSquareText size={16} />
                  问 AI 解析错题
                </Link>
                <Link to="/learning-profile">
                  查看画像变化
                </Link>
              </div>
            </div>
          ) : (
            <div className="quiz-assessment-submit-box">
              <strong>提交后统一评分</strong>
              <p>{submitBlockReason || '题目已完成，可以提交评分。'}</p>
              <small>客观题答案来自生成题单；主观题提交后调用 AI 评测并同步写入课程画像。</small>
              <div>
                <button type="button" className="quiz-assessment-secondary" disabled={hasResult || submitAssessment.isPending} onClick={handleSaveDraft}>
                  <Save size={15} />
                  暂存
                </button>
                <button type="button" className="quiz-assessment-secondary" disabled={hasResult || submitAssessment.isPending} onClick={handleReset}>
                  <RotateCcw size={15} />
                  清空
                </button>
              </div>
              <button type="button" className="quiz-assessment-submit" disabled={!canSubmit} onClick={handleSubmit}>
                <Send size={16} />
                提交并评分
              </button>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
