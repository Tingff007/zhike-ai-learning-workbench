import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Bot,
  Brain,
  CheckCircle2,
  FileText,
  Loader2,
  LockKeyhole,
  MessageSquareText,
  PenLine,
  RefreshCw,
  Route,
  Save,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/endpoints';
import { getApiErrorMessage } from '../../api/client';
import { EmptyState } from '../../components/shared/StateBlock';
import { PageHeader, PageHeaderToolbar } from '../../components/shared/PageHeader';
import { useCourseQueries, useSubmitAssessmentMutation } from '../../hooks/useCourseData';
import { useCourseContextStore } from '../../stores/course-context.store';
import { buildUrlDraftKey } from '../../app/workspaceDialogueUtils';
import { readSessionJson, removeSessionItem, writeSessionJson } from '../../utils/browser-storage';
import { parseQuizAssessmentMarkdown } from '../../components/canvas/quiz-assessment-parser';

type StageQuestionType = 'single_choice' | 'multiple_choice' | 'true_false' | 'blank' | 'short_answer';

type StageQuestion = {
  id: string;
  type: StageQuestionType;
  prompt: string;
  options?: Array<{ value: string; label: string }>;
  expectedAnswer: string | string[];
  points: number;
  analysis: string;
  keywords?: string[];
  scoringPoints?: string[];
};

type StageAnswers = Record<string, string | string[]>;

type StageAssessmentDraft = {
  answers: StageAnswers;
  durationSeconds: number;
  hasStarted: boolean;
  savedAt: number;
};

const attributionPalette = [
  'bg-rose-50 text-rose-700 ring-rose-100',
  'bg-amber-50 text-amber-700 ring-amber-100',
  'bg-sky-50 text-sky-700 ring-sky-100',
  'bg-emerald-50 text-emerald-700 ring-emerald-100',
];

const typeLabels: Record<StageQuestionType, string> = {
  single_choice: '单选题',
  multiple_choice: '多选题',
  true_false: '判断题',
  blank: '填空题',
  short_answer: '简答题',
};

function buildAttributions(weakReasons: string[]) {
  const fallback = ['概念识别', '要点覆盖', '表达完整'];
  const source = weakReasons.length ? weakReasons : fallback;
  const weights = source.length === 1 ? [100] : source.length === 2 ? [58, 42] : [45, 35, 20, 12];
  return source.slice(0, 4).map((reason, index) => ({
    id: `${reason}-${index}`,
    dimension: reason,
    weight: weights[index] ?? Math.max(10, 100 - index * 18),
    tone: attributionPalette[index % attributionPalette.length],
  }));
}

function answerToText(answer: string | string[] | undefined): string {
  if (Array.isArray(answer)) return answer.join('、');
  return answer ?? '';
}

function isAnswered(question: StageQuestion, answer: string | string[] | undefined): boolean {
  if (question.type === 'multiple_choice') return Array.isArray(answer) && answer.length > 0;
  return typeof answer === 'string' && answer.trim().length > 0;
}

function buildSubmissionPayload(questions: StageQuestion[], answers: StageAnswers, conceptTitle: string) {
  return JSON.stringify(
    {
      kind: 'stage_assessment_submission',
      title: `${conceptTitle}阶段测评`,
      questions: questions.map((question, index) => ({
        id: question.id,
        order: index + 1,
        type: question.type,
        prompt: question.prompt,
        options: question.options,
        expected_answer: question.expectedAnswer,
        student_answer: answers[question.id] ?? '',
        max_score: question.points,
        analysis: question.analysis,
        keywords: question.keywords ?? [],
        scoring_points: question.scoringPoints ?? [],
      })),
    },
    null,
    2,
  );
}

function buildAiReviewDraft(input: {
  conceptTitle: string;
  score?: number;
  feedback?: string;
  weakReasons: string[];
  questions: StageQuestion[];
  answers: StageAnswers;
}): string {
  const wrongHints = input.weakReasons.length ? input.weakReasons.join('、') : '暂无明确错因';
  const answerSnapshot = input.questions
    .map((question, index) => `${index + 1}. ${question.prompt}\n我的答案：${answerToText(input.answers[question.id]) || '未作答'}\n参考要点：${answerToText(question.expectedAnswer)}`)
    .join('\n\n');
  return [
    `我刚完成「${input.conceptTitle}」阶段测评，得分 ${input.score ?? 0}/100。`,
    `系统反馈：${input.feedback ?? '请结合题目帮我复盘。'}`,
    `主要薄弱点：${wrongHints}`,
    '请不要重新替我答题，请围绕错题原因、关键知识点和下一步复习建议进行讲解。',
    '',
    answerSnapshot,
  ].join('\n');
}

function isStageAssessmentDraft(value: unknown): value is StageAssessmentDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<StageAssessmentDraft>;
  const answers = draft.answers;
  const answerValues = answers && typeof answers === 'object' ? Object.values(answers) : [];
  return Boolean(
    answers
    && typeof answers === 'object'
    && answerValues.every((item) => typeof item === 'string' || (Array.isArray(item) && item.every((option) => typeof option === 'string')))
    && typeof draft.durationSeconds === 'number'
    && typeof draft.hasStarted === 'boolean'
    && typeof draft.savedAt === 'number',
  );
}

export function AssessmentPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const { currentCourseId, currentCourseTitle, learningScope } = useCourseContextStore();
  const { concepts, mastery } = useCourseQueries({ includeResources: false });
  const resources = useQuery({
    queryKey: ['community-resources', currentCourseId],
    queryFn: () => api.communityResources(currentCourseId),
    enabled: Boolean(currentCourseId),
  });
  const submitAssessment = useSubmitAssessmentMutation();
  const conceptList = concepts.data?.items ?? [];
  const [conceptId, setConceptId] = useState('');
  const [answers, setAnswers] = useState<StageAnswers>({});
  const [hasStarted, setHasStarted] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [consumedDraftKey, setConsumedDraftKey] = useState('');
  const [draftNotice, setDraftNotice] = useState('');
  const hasCourse = learningScope === 'course' && Boolean(currentCourseId);
  const routeConceptId = searchParams.get('concept') ?? '';
  const routePathNodeId = searchParams.get('path_node') ?? '';
  const currentConcept = conceptList.find((item) => item.id === conceptId);
  const conceptTitle = currentConcept?.title ?? '当前知识点';
  const assessmentDraftQuery = useQuery({
    queryKey: ['assessment-draft', currentCourseId, conceptId, routePathNodeId],
    queryFn: () => api.generateAssessmentDraft({
      course_id: currentCourseId,
      concept_id: conceptId,
      path_node_id: routePathNodeId || null,
      difficulty: currentConcept?.difficulty || 'medium',
    }),
    enabled: Boolean(hasCourse && conceptId),
    retry: 1,
  });
  const parsedDraft = useMemo(
    () => parseQuizAssessmentMarkdown(assessmentDraftQuery.data?.content ?? '', `${conceptTitle}阶段测评`),
    [assessmentDraftQuery.data?.content, conceptTitle],
  );
  const questions: StageQuestion[] = useMemo(
    () => parsedDraft.questions.map((question) => ({
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      options: question.options,
      expectedAnswer: question.expectedAnswer,
      points: question.points,
      analysis: question.analysis,
      keywords: question.keywords,
      scoringPoints: question.scoringPoints,
    })),
    [parsedDraft.questions],
  );
  const answeredCount = questions.filter((question) => isAnswered(question, answers[question.id])).length;
  const totalPoints = questions.reduce((sum, question) => sum + question.points, 0);
  const completionPercent = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;
  const weakReasons = submitAssessment.data?.weak_reasons ?? [];
  const attributions = useMemo(() => buildAttributions(weakReasons), [weakReasons]);
  const remedialActions = submitAssessment.data?.recommended_actions?.length
    ? submitAssessment.data.recommended_actions
    : (resources.data?.items ?? []).slice(0, 3).map((item) => item.title);
  const assessmentDraftKey = hasCourse && conceptId && assessmentDraftQuery.data?.content
    ? `assessment-stage-draft:${currentCourseId}:${conceptId}:${assessmentDraftQuery.data.title}`
    : '';
  const isFallbackDraft = assessmentDraftQuery.data?.source === 'server_fallback_quiz';
  const isRepairedDraft = assessmentDraftQuery.data?.source === 'ai_repaired_quiz';
  const aiReviewDraft = useMemo(
    () => buildAiReviewDraft({
      conceptTitle,
      score: submitAssessment.data?.score,
      feedback: submitAssessment.data?.feedback,
      weakReasons,
      questions,
      answers,
    }),
    [answers, conceptTitle, questions, submitAssessment.data?.feedback, submitAssessment.data?.score, weakReasons],
  );
  const aiReviewHref = `/ai-room?${new URLSearchParams({
    draft: aiReviewDraft,
    concept: conceptId,
    mode: 'default_chat',
  }).toString()}`;
  const assessmentState = assessmentDraftQuery.isLoading ? '出题中' : submitAssessment.data ? '已评分' : isSubmitted ? '评分中' : hasStarted ? '答题中' : '未开始';
  const draftErrorMessage = assessmentDraftQuery.isError
    ? getApiErrorMessage(assessmentDraftQuery.error, '阶段测评题生成失败，请稍后重试。')
    : parsedDraft.warnings[0] || '题单内容没有解析出可作答题目，请重新生成。';

  useEffect(() => {
    if (conceptList.length === 0) {
      if (conceptId) setConceptId('');
      return;
    }
    if (routeConceptId && conceptList.some((concept) => concept.id === routeConceptId)) {
      if (conceptId !== routeConceptId) setConceptId(routeConceptId);
      return;
    }
    if (!conceptList.some((concept) => concept.id === conceptId)) {
      setConceptId(conceptList[0].id);
    }
  }, [conceptId, conceptList, routeConceptId]);

  useEffect(() => {
    if (!hasStarted || isSubmitted) return undefined;
    const timer = window.setInterval(() => setDurationSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [hasStarted, isSubmitted]);

  useEffect(() => {
    setAnswers({});
    setHasStarted(false);
    setIsSubmitted(false);
    setDurationSeconds(0);
    setDraftNotice('');
    submitAssessment.reset();
  }, [assessmentDraftQuery.data?.content, conceptId]);

  useEffect(() => {
    if (!assessmentDraftKey || assessmentDraftQuery.isLoading || assessmentDraftQuery.isError) return;
    const draft = readSessionJson<StageAssessmentDraft>(
      assessmentDraftKey,
      { answers: {}, durationSeconds: 0, hasStarted: false, savedAt: 0 },
      isStageAssessmentDraft,
    );
    if (!draft.savedAt || isSubmitted) return;
    setAnswers(draft.answers);
    setDurationSeconds(draft.durationSeconds);
    setHasStarted(draft.hasStarted);
    setDraftNotice('已恢复上次暂存的答案');
  }, [assessmentDraftKey, assessmentDraftQuery.isError, assessmentDraftQuery.isLoading, isSubmitted]);

  useEffect(() => {
    const draftFromUrl = searchParams.get('draft');
    const draftKey = buildUrlDraftKey(searchParams);
    if (!draftFromUrl || consumedDraftKey === draftKey) return;
    setConsumedDraftKey(draftKey);
    setHasStarted(true);
    setAnswers((current) => ({
      ...current,
      q4: draftFromUrl,
    }));
  }, [consumedDraftKey, searchParams]);

  function updateAnswer(questionId: string, value: string): void {
    if (isSubmitted) return;
    setAnswers((current) => ({ ...current, [questionId]: value }));
  }

  function toggleMultipleChoice(questionId: string, value: string): void {
    if (isSubmitted) return;
    setAnswers((current) => {
      const selected = Array.isArray(current[questionId]) ? current[questionId] as string[] : [];
      const next = selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value].sort();
      return { ...current, [questionId]: next };
    });
  }

  function handleSaveDraft(): void {
    if (!assessmentDraftKey || isSubmitted) return;
    const ok = writeSessionJson<StageAssessmentDraft>(assessmentDraftKey, {
      answers,
      durationSeconds,
      hasStarted: true,
      savedAt: Date.now(),
    });
    setDraftNotice(ok ? '答案已暂存到当前浏览器会话' : '暂存失败，请稍后重试');
  }

  function handleSubmit(): void {
    if (!hasCourse || !conceptId || !questions.length || answeredCount !== questions.length || submitAssessment.isPending) return;
    setIsSubmitted(true);
    submitAssessment.mutate(
      {
        course_id: currentCourseId,
        concept_id: conceptId,
        path_node_id: routePathNodeId || undefined,
        assessment_type: 'stage_quiz',
        answer: buildSubmissionPayload(questions, answers, conceptTitle),
        duration_seconds: durationSeconds,
      },
      {
        onSuccess: () => {
          if (assessmentDraftKey) removeSessionItem(assessmentDraftKey);
        },
        onError: () => setIsSubmitted(false),
      },
    );
  }

  function renderQuestionInput(question: StageQuestion): JSX.Element {
    const answer = answers[question.id];
    if (question.type === 'single_choice' || question.type === 'true_false') {
      return (
        <div className="assessment-question__options">
          {(question.options ?? []).map((option) => (
            <label key={option.value} className={answer === option.value ? 'is-selected' : ''}>
              <input
                type="radio"
                name={question.id}
                checked={answer === option.value}
                disabled={isSubmitted}
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
        <div className="assessment-question__options">
          {(question.options ?? []).map((option) => (
            <label key={option.value} className={selected.includes(option.value) ? 'is-selected' : ''}>
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                disabled={isSubmitted}
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
          className="assessment-question__blank"
          value={typeof answer === 'string' ? answer : ''}
          disabled={isSubmitted}
          onChange={(event) => updateAnswer(question.id, event.target.value)}
          placeholder="填写你的答案"
        />
      );
    }
    return (
      <textarea
        className="assessment-question__textarea"
        value={typeof answer === 'string' ? answer : ''}
        disabled={isSubmitted}
        onChange={(event) => updateAnswer(question.id, event.target.value)}
        placeholder="写下你的理解、不确定点和必要推理过程"
      />
    );
  }

  return (
    <div className="assessment-canvas">
      <PageHeader
        title="可作答阶段测评"
        subtitle="先独立完成题目并提交，系统自动评分、生成解析反馈，并把结果写入当前课程画像。问 AI 入口会在评分完成后开放。"
      />
      <PageHeaderToolbar className="!justify-start">
        <div className="assessment-score-chip">
          <span>当前课程</span>
          <strong>{hasCourse ? currentCourseTitle || currentCourseId : '未指定'}</strong>
        </div>
      </PageHeaderToolbar>

      {!hasCourse && (
        <section className="assessment-course-empty">
          <div className="assessment-course-empty__icon">
            <Route size={22} />
          </div>
          <div>
            <h2>阶段测评需要先选择课程</h2>
            <p>测评结果会写入当前课程画像、掌握度和后续学习路径。当前处于通用学习模式，请先在顶部选择课程。</p>
          </div>
          <Link to="/dashboard" className="btn-primary">
            返回工作台
          </Link>
        </section>
      )}

      <section className="assessment-metrics">
        {[
          { label: '测评状态', value: assessmentState, helper: submitAssessment.data ? `画像 ${submitAssessment.data.mastery_delta >= 0 ? '+' : ''}${submitAssessment.data.mastery_delta}` : `${answeredCount}/${questions.length} 题已作答`, Icon: Activity },
          { label: '当前掌握度', value: hasCourse ? `${mastery.data?.overall ?? 0}%` : '需选课', helper: hasCourse ? 'mastery API' : '绑定课程后读取', Icon: Brain },
          { label: '最近得分', value: submitAssessment.data ? `${submitAssessment.data.score}/100` : `${totalPoints} 分`, helper: submitAssessment.data ? '已同步画像证据' : '提交后生成', Icon: CheckCircle2 },
        ].map(({ label, value, helper, Icon }) => (
          <div key={label} className="assessment-metric">
            <Icon size={18} />
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{helper}</small>
          </div>
        ))}
      </section>

      <div className="assessment-grid assessment-grid--quiz">
        <section className="assessment-panel assessment-panel--quiz">
          <div className="assessment-panel__title">
            <PenLine size={18} />
            <span>在线答题</span>
          </div>
          <div className="assessment-controls">
            <label>
              <span>测评知识点</span>
              <select
                value={conceptId}
                disabled={!hasCourse || conceptList.length === 0 || isSubmitted}
                onChange={(event) => setConceptId(event.target.value)}
              >
                {conceptList.map((concept) => <option key={concept.id} value={concept.id}>{concept.title}</option>)}
                {conceptList.length === 0 && <option value="">未分配课程</option>}
              </select>
            </label>
          </div>

          <div className="assessment-progress">
            <div>
              <strong>{completionPercent}%</strong>
              <span>{answeredCount}/{questions.length} 题完成 · 用时 {Math.floor(durationSeconds / 60)}:{String(durationSeconds % 60).padStart(2, '0')}</span>
            </div>
            <meter min={0} max={questions.length || 1} value={answeredCount} />
            {isRepairedDraft && <p>AI 题单已通过后端标准化修复，题目、答案和评分要点可正常用于测评。</p>}
            {isFallbackDraft && <p>AI 题单未通过质量校验，当前展示系统保底题单，可重新出题获取真实 AI 题单。</p>}
            {draftNotice && <p>{draftNotice}</p>}
          </div>

          {assessmentDraftQuery.isLoading ? (
            <div className="assessment-start">
              <Loader2 className="animate-spin" size={22} />
              <h2>正在生成真实阶段测评题</h2>
              <p>系统正在通过结构化 JSON 契约生成题目、标准答案、解析和评分要点，不再使用本地占位模板。</p>
            </div>
          ) : assessmentDraftQuery.isError || !questions.length ? (
            <div className="assessment-start assessment-start--error">
              <FileText size={22} />
              <h2>阶段测评题生成失败</h2>
              <p>{draftErrorMessage}</p>
              <button type="button" className="assessment-submit" onClick={() => void assessmentDraftQuery.refetch()}>
                <RefreshCw size={18} />
                重新出题
              </button>
            </div>
          ) : !hasStarted ? (
            <div className="assessment-start">
              <FileText size={22} />
              <h2>{conceptTitle}阶段测评</h2>
              <p>{isFallbackDraft ? '当前题单由系统保底规则生成，包含标准答案和评分要点。建议点击重新出题获取更贴合课程材料的 AI 题单。' : '题目由 AI 结构化生成，包含标准答案、解析和评分要点。开始后可填写和暂存答案，提交前不会开放问 AI。'}</p>
              {isFallbackDraft && (
                <button type="button" className="assessment-save" onClick={() => void assessmentDraftQuery.refetch()}>
                  <RefreshCw size={16} />
                  重新出题
                </button>
              )}
              <button type="button" className="assessment-submit" disabled={!hasCourse || !conceptId || !questions.length} onClick={() => setHasStarted(true)}>
                <PenLine size={18} />
                {isFallbackDraft ? '使用保底题单测评' : '开始测评'}
              </button>
            </div>
          ) : (
            <div className="assessment-question-list">
              {questions.map((question, index) => (
                <article key={question.id} className={isAnswered(question, answers[question.id]) ? 'assessment-question is-answered' : 'assessment-question'}>
                  <div className="assessment-question__head">
                    <div>
                      <span>{typeLabels[question.type]} · {question.points} 分</span>
                      <h2>{index + 1}. {question.prompt}</h2>
                    </div>
                    {isAnswered(question, answers[question.id]) && <CheckCircle2 size={18} />}
                  </div>
                  {renderQuestionInput(question)}
                  {submitAssessment.data && (
                    <div className="assessment-question__analysis">
                      <strong>参考答案：{answerToText(question.expectedAnswer)}</strong>
                      <p>{question.analysis}</p>
                    </div>
                  )}
                </article>
              ))}
              <div className="assessment-actions">
                <button type="button" className="assessment-save" disabled={isSubmitted} onClick={handleSaveDraft}>
                  <Save size={16} />
                  暂存答案
                </button>
                <button
                  className="assessment-submit"
                  type="button"
                  disabled={!hasCourse || !conceptId || !questions.length || answeredCount !== questions.length || submitAssessment.isPending || Boolean(submitAssessment.data)}
                  onClick={handleSubmit}
                >
                  {submitAssessment.isPending ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
                  提交测评
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="assessment-panel assessment-panel--feedback">
          <div className="assessment-panel__title">
            <Activity size={18} />
            <span>评分反馈</span>
          </div>
          {!submitAssessment.data && (
            <div className="assessment-ai-locked">
              <LockKeyhole size={20} />
              <strong>问 AI 将在提交评分后开放</strong>
              <p>答题中只保留填写、暂存和提交，避免 AI 直接影响测评结果。</p>
            </div>
          )}
          {!submitAssessment.data && !submitAssessment.isPending && <EmptyState label="提交后会显示总分、逐题评分、解析反馈和画像更新提示。" />}
          {submitAssessment.isPending && (
            <div className="assessment-ai-locked">
              <Loader2 className="animate-spin" size={20} />
              <strong>正在评分</strong>
              <p>系统正在根据题目标准答案和评分要点生成结果，并准备写入学习画像。</p>
            </div>
          )}
          {submitAssessment.data && (
            <div className="assessment-result">
              <div className="assessment-score">
                <strong>{submitAssessment.data.score}</strong>
                <span>/ 100</span>
              </div>
              <div className="assessment-tags">
                {attributions.map((item) => (
                  <span key={item.id} className={item.tone}>
                    {item.dimension}
                    <b>{item.weight}%</b>
                  </span>
                ))}
              </div>
              <div className="assessment-diagnostic">
                <span>智能评分 · {submitAssessment.data.scoring_method === 'stage_assessment_rubric' ? '题目评分规则' : 'Rubric'}</span>
                <p>{submitAssessment.data.feedback}</p>
              </div>
              {submitAssessment.data.progress_report && (
                <div className="assessment-diagnostic assessment-diagnostic--light">
                  <span>画像更新提示</span>
                  <p>{submitAssessment.data.progress_report}</p>
                </div>
              )}
              {submitAssessment.data.rubric?.length ? (
                <div className="assessment-rubric">
                  {submitAssessment.data.rubric.map((item) => (
                    <article key={item.key}>
                      <div>
                        <strong>{item.label}</strong>
                        <span>{item.score} 分 · 权重 {Math.round(item.weight * 100)}%</span>
                      </div>
                      <meter min={0} max={100} value={item.score} />
                      <p>{item.evidence}</p>
                      <small>{item.feedback}</small>
                    </article>
                  ))}
                </div>
              ) : null}
              <div className="assessment-ai-actions">
                <Link to={aiReviewHref} className="assessment-ai-action">
                  <MessageSquareText size={17} />
                  问 AI 解析错题
                </Link>
                <Link to="/learning-profile" className="assessment-ai-action assessment-ai-action--secondary">
                  <Bot size={17} />
                  查看画像变化
                </Link>
              </div>
            </div>
          )}
        </aside>
      </div>

      <section className="assessment-remedies">
        <div className="assessment-panel__title">
          <Sparkles size={18} />
          <span>提交后的补救建议</span>
        </div>
        <div className="assessment-remedy-grid">
          {(remedialActions.length ? remedialActions : ['复盘题目解析', '整理错因笔记', '完成一组补充练习']).slice(0, 4).map((item, index) => (
            <article key={`${item}-${index}`}>
              <div>{index + 1}</div>
              <strong>{item}</strong>
              <p>{conceptTitle ? `围绕“${conceptTitle}”进行复习，结果会继续作为画像证据。` : '绑定当前知识点生成补救材料。'}</p>
              <button type="button" disabled={!submitAssessment.data}>评分后执行</button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
