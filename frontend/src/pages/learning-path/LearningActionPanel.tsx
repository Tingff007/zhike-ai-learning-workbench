import {
  BookOpen,
  CheckCircle2,
  Code2,
  HelpCircle,
  Images,
  FileQuestion,
  MessageSquareText,
  Network,
  PlayCircle,
  Sparkles,
} from 'lucide-react';
import type { PathNode, Resource } from '../../types';
import { buildLearningResourceHref } from '../../utils/learning-resource-draft';
import { findGeneratedResourceByType, resourcePackItems, type ResourcePackItem } from './learning-resource-pack';
import type { MaterialScope } from './material-scope';

const resourceTypeIcon: Record<string, typeof BookOpen> = {
  code_lab: Code2,
  diagram_pack: Images,
  lecture: BookOpen,
  mindmap: Network,
  quiz: FileQuestion,
  reading: BookOpen,
  video: PlayCircle,
  misconception_card: HelpCircle,
};

const resourceTypeLabel: Record<string, string> = {
  code_lab: '代码实验',
  diagram_pack: '教学图解包',
  lecture: '讲义',
  mindmap: '思维导图',
  quiz: '自测题',
  reading: '拓展阅读',
  video: '视频',
  misconception_card: '错题补救卡',
};

type LearningActionPanelProps = {
  chapterTitle?: string | null;
  conceptTitle?: string | null;
  material?: MaterialScope;
  node?: PathNode;
  onPreviewResource: (resource: Resource) => void;
  onStartLearning: () => void;
  resourcePackResources: Resource[];
  recommendedResources: Resource[];
};

function resourceLabel(resource: Resource): string {
  return resourceTypeLabel[resource.resource_type] ?? resource.type ?? '资源';
}

function ResourceRow({ onPreviewResource, resource }: { onPreviewResource: (resource: Resource) => void; resource: Resource }): JSX.Element {
  const Icon = resourceTypeIcon[resource.resource_type] ?? Sparkles;
  return (
    <button className="learning-action-panel__resource-item" type="button" onClick={() => onPreviewResource(resource)}>
      <span className="learning-action-panel__resource-icon" aria-hidden="true">
        <Icon size={14} />
      </span>
      <span className="learning-action-panel__resource-type">{resourceLabel(resource)}</span>
      <span className="learning-action-panel__resource-title">{resource.title}</span>
    </button>
  );
}

function appendMaterialParams(params: URLSearchParams, material?: MaterialScope): void {
  if (!material || material.kind === 'all') return;
  params.set('material_scope', material.id);
  if (material.documentId) params.set('document_id', material.documentId);
  if (material.sourceTitle || material.title) params.set('source_title', material.sourceTitle || material.title);
}

function courseRagQaHref(node: PathNode, material?: MaterialScope): string {
  const params = new URLSearchParams();
  if (node.concept_id) params.set('concept', node.concept_id);
  if (node.id) params.set('path_node', node.id);
  params.set('mode', 'course_rag_qa');
  appendMaterialParams(params, material);
  return `/dashboard?${params.toString()}`;
}

function ResourcePackRow({
  item,
  material,
  node,
  generated,
  onPreviewResource,
}: {
  generated?: Resource;
  item: ResourcePackItem;
  material?: MaterialScope;
  node: PathNode;
  onPreviewResource: (resource: Resource) => void;
}): JSX.Element {
  const Icon = resourceTypeIcon[item.resourceType] ?? MessageSquareText;
  const isCourseQa = item.resourceType === 'course_rag_qa';
  const href =
    isCourseQa
      ? courseRagQaHref(node, material)
      : buildLearningResourceHref({ material, node, resourceType: item.resourceType });

  const className = `learning-resource-pack__item ${generated ? 'is-generated' : ''}`;
  const content = (
    <>
      <span className="learning-resource-pack__icon" aria-hidden="true">
        <Icon size={14} />
      </span>
      <span className="learning-resource-pack__copy">
        <strong>{item.title}</strong>
        <small>{item.agent} · {item.desc}</small>
      </span>
      <span className="learning-resource-pack__state">
        {generated ? <CheckCircle2 size={13} /> : <Sparkles size={13} />}
        {generated ? '查看' : isCourseQa ? '进入' : '生成'}
      </span>
    </>
  );

  if (generated) {
    return (
      <button className={className} type="button" onClick={() => onPreviewResource(generated)}>
        {content}
      </button>
    );
  }

  return (
    <a className={className} href={href}>
      {content}
    </a>
  );
}

export function LearningActionPanel({
  chapterTitle,
  conceptTitle,
  material,
  node,
  onPreviewResource,
  resourcePackResources,
  recommendedResources,
  onStartLearning,
}: LearningActionPanelProps): JSX.Element {
  if (!node) {
    return (
      <div className="learning-action-panel__empty">
        <PlayCircle size={24} />
        <span>选择知识点后，可在此查看推荐资源并开始学习。</span>
      </div>
    );
  }

  const linkParams = new URLSearchParams();
  if (node.concept_id) linkParams.set('concept', node.concept_id);
  if (node.id) linkParams.set('path_node', node.id);
  appendMaterialParams(linkParams, material);
  const generatablePackItems = resourcePackItems.filter((item) => item.resourceType !== 'course_rag_qa');
  const generatedCount = generatablePackItems.filter(
    (item) => findGeneratedResourceByType(resourcePackResources, item.resourceType),
  ).length;
  const packPercent = Math.round((generatedCount / generatablePackItems.length) * 100);

  return (
    <div className="learning-action-panel">
      <section className="learning-action-panel__block learning-action-panel__block--pack">
        <div className="learning-action-panel__block-heading">
          <div>
            <h3 className="learning-action-panel__block-title">当前节点资源包</h3>
            <p>资源包完整度不计入学习进度，用于展示多智能体生成成果。</p>
          </div>
          <strong>{generatedCount}/{generatablePackItems.length}</strong>
        </div>
        <div className="learning-resource-pack__meter" aria-label={`资源包完整度 ${packPercent}%`}>
          <span style={{ width: `${packPercent}%` }} />
        </div>
        <div className="learning-resource-pack__list">
          {resourcePackItems.map((item) => (
            <ResourcePackRow
              key={item.resourceType}
              generated={item.resourceType === 'course_rag_qa' ? undefined : findGeneratedResourceByType(resourcePackResources, item.resourceType)}
              item={item}
              material={material}
              node={node}
              onPreviewResource={onPreviewResource}
            />
          ))}
        </div>
      </section>

      <section className="learning-action-panel__block">
        <h3 className="learning-action-panel__block-title">AI 问答</h3>
        <div className="learning-action-panel__stack">
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
          <a className="learning-path-btn learning-path-btn--secondary" href={courseRagQaHref(node, material)}>
            <MessageSquareText size={15} />
            课程资料问答
          </a>
        </div>
      </section>

      {recommendedResources.length > 0 && (
        <section className="learning-action-panel__block">
          <h3 className="learning-action-panel__block-title">可直接使用的资源</h3>
          <ul className="learning-action-panel__resource-list">
            {recommendedResources.map((resource) => (
              <li key={resource.id}>
                <ResourceRow resource={resource} onPreviewResource={onPreviewResource} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="learning-action-panel__block">
        <h3 className="learning-action-panel__block-title">资料范围</h3>
        <p className="learning-action-panel__hint">
          当前资源按「{material?.title ?? '全部课程资料'}」筛选；讲义、导图和短测入口已合并到中间学习步骤。
        </p>
      </section>
    </div>
  );
}
