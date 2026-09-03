import {
  ArrowRight,
  BookOpen,
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  GitBranch,
  Gauge,
  Layers3,
  Loader2,
  Network,
  PlayCircle,
  Eye,
  Sparkles,
  Target,
} from 'lucide-react';
import type { CourseConcept, LearningScheduleItem, PathNode, Resource } from '../../types';
import { buildLearningResourceHref } from '../../utils/learning-resource-draft';
import { findGeneratedResourceByType } from './learning-resource-pack';
import type { MaterialScope } from './material-scope';
import {
  buildTodaySuggestion,
  clampPercent,
  difficultyLabel,
  getChapterTitle,
  getNextStepNode,
  isRemedial,
  learningObjective,
  masteryEvidenceTimeline,
  nodeDifficulty,
  buildNodeCompletionHint,
  resolveNodeCompletionPercent,
  resolvePrerequisiteIds,
} from './path-utils';

type NodeDetailPanelProps = {
  chapterTitle?: string | null;
  concept?: CourseConcept;
  conceptById: Map<string, CourseConcept>;
  conceptTitle?: string | null;
  material?: MaterialScope;
  node?: PathNode;
  nodeByConcept: Map<string, PathNode>;
  nodeById: Map<string, PathNode>;
  onMarkMastered: () => void;
  onPreviewResource: (resource: Resource) => void;
  onStartLearning: () => void;
  pathNodes: PathNode[];
  resourcePackResources: Resource[];
  scheduleItems?: LearningScheduleItem[];
  updatePending: boolean;
};

function appendMaterialParams(params: URLSearchParams, material?: MaterialScope): void {
  if (!material || material.kind === 'all') return;
  params.set('material_scope', material.id);
  if (material.documentId) params.set('document_id', material.documentId);
  if (material.sourceTitle || material.title) params.set('source_title', material.sourceTitle || material.title);
}

function assessmentHref(node: PathNode, material?: MaterialScope): string {
  const params = new URLSearchParams();
  if (node.concept_id) params.set('concept', node.concept_id);
  if (node.id) params.set('path_node', node.id);
  appendMaterialParams(params, material);
  const query = params.toString();
  return `/assessment${query ? `?${query}` : ''}`;
}

function NodeLearningSteps({
  chapterTitle,
  conceptTitle,
  material,
  node,
  onMarkMastered,
  onPreviewResource,
  onStartLearning,
  resourcePackResources,
  updatePending,
}: {
  chapterTitle?: string | null;
  conceptTitle?: string | null;
  material?: MaterialScope;
  node: PathNode;
  onMarkMastered: () => void;
  onPreviewResource: (resource: Resource) => void;
  onStartLearning: () => void;
  resourcePackResources: Resource[];
  updatePending: boolean;
}): JSX.Element {
  const remedial = isRemedial(node);
  const generatedLecture = findGeneratedResourceByType(resourcePackResources, remedial ? 'misconception_card' : 'lecture')
    ?? findGeneratedResourceByType(resourcePackResources, 'lecture');
  const generatedMindmap = findGeneratedResourceByType(resourcePackResources, 'mindmap');
  const generatedQuiz = findGeneratedResourceByType(resourcePackResources, 'quiz');
  const steps = [
    {
      key: 'lecture',
      title: remedial ? '补救讲义' : '读讲义',
      desc: remedial ? '先把薄弱概念用白话讲清楚。' : '用高白话讲义建立概念框架。',
      action: (
        generatedLecture ? (
          <button
            className="learning-path-btn learning-path-btn--secondary learning-path-btn--golden"
            type="button"
            onClick={() => onPreviewResource(generatedLecture)}
          >
            <Eye size={15} />
            查看已生成讲义
          </button>
        ) : (
          <a
            className="learning-path-btn learning-path-btn--secondary learning-path-btn--golden"
            href={buildLearningResourceHref({ chapterTitle, conceptTitle, material, node, resourceType: 'lecture' })}
          >
            <BookOpen size={15} />
            生成高白话讲义
          </a>
        )
      ),
    },
    {
      key: 'mindmap',
      title: '看导图',
      desc: '推荐用导图串起本节和前置概念。',
      action: (
        generatedMindmap ? (
          <button
            className="learning-path-btn learning-path-btn--secondary learning-path-btn--golden"
            type="button"
            onClick={() => onPreviewResource(generatedMindmap)}
          >
            <Eye size={15} />
            查看已生成导图
          </button>
        ) : (
          <a
            className="learning-path-btn learning-path-btn--secondary learning-path-btn--golden"
            href={buildLearningResourceHref({ chapterTitle, conceptTitle, material, node, resourceType: 'mindmap' })}
          >
            <Network size={15} />
            梳理思维导图
          </a>
        )
      ),
    },
    {
      key: 'assessment',
      title: '做短测',
      desc: '短测结果会影响掌握度和补救建议。',
      action: (
        <div className={generatedQuiz ? 'learning-node-detail__step-actions' : undefined}>
          {generatedQuiz ? (
            <button
              className="learning-path-btn learning-path-btn--secondary"
              type="button"
              onClick={() => onPreviewResource(generatedQuiz)}
            >
              <Eye size={15} />
              查看题包
            </button>
          ) : null}
          <a className="learning-path-btn learning-path-btn--primary" href={assessmentHref(node, material)}>
            <ClipboardCheck size={15} />
            开启 5 分钟通关测
          </a>
        </div>
      ),
    },
    {
      key: 'loop',
      title: '回写闭环',
      desc: remedial ? '补救完成后回到主线继续推进。' : '根据短测结果进入 AI 讲解或标记完成。',
      action: (
        <div className="learning-node-detail__step-actions">
          <button
            className="learning-path-btn learning-path-btn--secondary"
            disabled={!node.concept_id}
            onClick={onStartLearning}
            title={node.concept_id ? undefined : '该节点未关联知识点，无法进入 AI 学习室'}
            type="button"
          >
            <PlayCircle size={15} />
            进入 AI 学习室
          </button>
          <button
            className="learning-path-btn learning-path-btn--secondary"
            disabled={updatePending || node.status === 'mastered'}
            onClick={onMarkMastered}
            type="button"
          >
            {updatePending ? <Loader2 className="animate-spin" size={15} /> : <CheckCircle2 size={15} />}
            标记为已完成
          </button>
        </div>
      ),
    },
  ];

  return (
    <section className="learning-node-detail__section learning-node-detail__section--steps">
      <div className="learning-node-detail__section-title">
        <ClipboardList size={16} />
        <h3>当前学习步骤</h3>
      </div>
      <p className="learning-node-detail__step-reason">
        {remedial
          ? '当前节点是补救任务，先扫清薄弱点，再用短测确认是否能回到主线。'
          : '学习进度只统计核心闭环；代码实验、图解包、拓展阅读等资源放在右侧资源包中按需补齐。'}
      </p>
      <div className="learning-node-detail__steps">
        {steps.map((step, index) => (
          <div key={step.key} className="learning-node-detail__step-card">
            <span className="learning-node-detail__step-index">{index + 1}</span>
            <div className="learning-node-detail__step-copy">
              <strong>{step.title}</strong>
              <span>{step.desc}</span>
            </div>
            <div className="learning-node-detail__step-action">{step.action}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PrerequisiteList({
  conceptById,
  node,
  nodeByConcept,
  nodeById,
}: {
  conceptById: Map<string, CourseConcept>;
  node: PathNode;
  nodeByConcept: Map<string, PathNode>;
  nodeById: Map<string, PathNode>;
}): JSX.Element {
  const prereqIds = resolvePrerequisiteIds(node, conceptById, nodeByConcept);

  if (prereqIds.length === 0) {
    return <p className="learning-node-detail__muted">无需前置知识，可直接开始。</p>;
  }

  return (
    <div className="learning-node-detail__chips" aria-label="前置知识">
      {prereqIds.map((id) => {
        const prereqNode = nodeById.get(id) ?? nodeByConcept.get(id);
        const mastered = prereqNode?.status === 'mastered';
        const title = prereqNode?.title ?? (id.length > 16 ? '关联知识点' : id);
        return (
          <span key={id} className={mastered ? 'is-ready' : 'is-pending'}>
            {mastered ? <CheckCircle2 size={14} /> : <GitBranch size={14} />}
            {title}
          </span>
        );
      })}
    </div>
  );
}

export function NodeDetailPanel({
  chapterTitle,
  node,
  concept,
  conceptById,
  conceptTitle,
  material,
  pathNodes,
  nodeById,
  nodeByConcept,
  onMarkMastered,
  onPreviewResource,
  onStartLearning,
  scheduleItems = [],
  resourcePackResources,
  updatePending,
}: NodeDetailPanelProps): JSX.Element {
  if (!node) {
    return (
      <div className="learning-node-detail__empty">
        <Target size={24} />
        <span>从左侧路线图选择一个知识点。</span>
      </div>
    );
  }

  const nextStep = getNextStepNode(node, pathNodes, conceptById, nodeByConcept);
  const resolvedChapterTitle = chapterTitle ?? getChapterTitle(node, conceptById);
  const completion = resolveNodeCompletionPercent(node, scheduleItems);
  const mastery = clampPercent(node.mastery_score ?? node.mastery);
  const evidenceTimeline = masteryEvidenceTimeline(node);
  const progressHint = buildTodaySuggestion(node, pathNodes, conceptById, nodeByConcept);
  const completionHint = buildNodeCompletionHint(node, completion);
  const masteryHint =
    mastery > 0
      ? `通过练习评估后，您的当前掌握度为 ${mastery}%。`
      : '完成练习评估后，掌握度会随得分与证据写入而更新。';

  return (
    <article className="learning-node-detail">
      <header className="learning-node-detail__hero">
        <div className="learning-node-detail__hero-copy">
          <span className="learning-node-detail__eyebrow">
            {isRemedial(node) ? <Sparkles size={14} /> : <Target size={14} />}
            {isRemedial(node) ? 'AI 动态补救节点' : '当前焦点'}
          </span>
          <h2>{node.title}</h2>
          <p className="learning-node-detail__progress-hint">{progressHint}</p>
        </div>
        <div className="learning-node-detail__score-card" aria-label={`当前掌握度 ${mastery}%`}>
          <strong>{mastery}%</strong>
          <span>掌握度</span>
        </div>
      </header>

      {isRemedial(node) && (
        <div className="learning-node-detail__remedial">
          <BookOpenCheck size={16} />
          <span>
            AI 洞察：检测到你在「{node.concept_name ?? node.title}」相关评估中掌握度偏低。为避免影响后续学习，已插入 1 个专属补救任务。
          </span>
        </div>
      )}

      <section className="learning-node-detail__stats" aria-label="节点属性">
        <div>
          <Gauge size={16} />
          <span>难度</span>
          <strong>{difficultyLabel[nodeDifficulty(node, conceptById)] ?? '基础'}</strong>
        </div>
        <div>
          <Layers3 size={16} />
          <span>所属单元</span>
          <strong>{resolvedChapterTitle}</strong>
        </div>
        <div>
          <ClipboardList size={16} />
          <span>资源策略</span>
          <strong>{concept?.difficulty === 'advanced' ? '讲解 + 实战' : '讲解 + 练习'}</strong>
        </div>
      </section>

      <NodeLearningSteps
        chapterTitle={resolvedChapterTitle}
        conceptTitle={conceptTitle ?? concept?.title}
        material={material}
        node={node}
        onMarkMastered={onMarkMastered}
        onPreviewResource={onPreviewResource}
        onStartLearning={onStartLearning}
        resourcePackResources={resourcePackResources}
        updatePending={updatePending}
      />

      <section className="learning-node-detail__section">
        <div className="learning-node-detail__section-title">
          <Target size={16} />
          <h3>学习目标</h3>
        </div>
        <p>{isRemedial(node) ? '补齐当前薄弱概念，避免影响后续主线学习。' : learningObjective(node, concept)}</p>
      </section>

      <section className="learning-node-detail__section">
        <div className="learning-node-detail__section-title">
          <GitBranch size={16} />
          <h3>前置依赖</h3>
        </div>
        <PrerequisiteList conceptById={conceptById} node={node} nodeByConcept={nodeByConcept} nodeById={nodeById} />
      </section>

      <section className="learning-node-detail__section learning-node-detail__section--next">
        <div className="learning-node-detail__section-title">
          <ArrowRight size={16} />
          <h3>后续路径</h3>
        </div>
        <p className="learning-node-detail__next">
          {nextStep
            ? `短测通过后建议进入「${nextStep.title}」；如果短测暴露薄弱点，先生成补救训练。`
            : '短测通过后可进入本单元复盘；如果短测暴露薄弱点，先生成补救训练。'}
        </p>
      </section>

      <section className="learning-node-detail__section">
        <div className="learning-node-detail__section-title">
          <CheckCircle2 size={16} />
          <h3>掌握证据</h3>
        </div>

        <div className="learning-node-detail__completion-block" aria-label={`节点学习进度 ${completion}%`}>
          <div className="learning-node-detail__meter learning-node-detail__meter--completion" aria-hidden="true">
            <span style={{ width: `${completion}%` }} />
          </div>
          <div className="learning-node-detail__mastery-meta">
            <strong>{completion}%</strong>
            <span>节点学习进度</span>
          </div>
          <p className="learning-node-detail__metric-hint">{completionHint}</p>
        </div>

        <div className="learning-node-detail__mastery-block" aria-label={`当前掌握度 ${mastery}%`}>
          <div className="learning-node-detail__meter learning-node-detail__meter--mastery" aria-hidden="true">
            <span style={{ width: `${mastery}%` }} />
          </div>
          <div className="learning-node-detail__mastery-meta">
            <strong>{mastery}%</strong>
            <span>当前掌握度</span>
          </div>
          <p className="learning-node-detail__metric-hint">{masteryHint}</p>
        </div>

        <div className="learning-node-detail__timeline">
          {evidenceTimeline.map((item) => (
            <div key={`${item.date}-${item.title}`}>
              <time>{item.date}</time>
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}
