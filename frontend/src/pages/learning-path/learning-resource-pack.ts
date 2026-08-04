import type { Resource } from '../../types';

export type ResourcePackItem = {
  agent: string;
  desc: string;
  resourceType: string;
  title: string;
};

export const resourcePackItems: ResourcePackItem[] = [
  { resourceType: 'lecture', title: '高白话讲义', agent: '讲解 Agent', desc: '核心概念与例子' },
  { resourceType: 'mindmap', title: '知识思维导图', agent: '结构 Agent', desc: '层级关系与学习顺序' },
  { resourceType: 'quiz', title: '阶段测评题', agent: '练习 Agent', desc: '短测与解析' },
  { resourceType: 'misconception_card', title: '错题补救卡', agent: '诊断 Agent', desc: '错因与补救训练' },
  { resourceType: 'code_lab', title: 'PyTorch 实操案例', agent: '实操 Agent', desc: '代码任务与检查点' },
  { resourceType: 'diagram_pack', title: '教学图解包', agent: '图解 Agent', desc: '概念图、流程图、对比图' },
  { resourceType: 'reading', title: '拓展阅读包', agent: '拓展 Agent', desc: '延伸材料与引用线索' },
  { resourceType: 'course_rag_qa', title: '课程资料问答', agent: '检索 Agent', desc: '基于资料问答' },
];

/** 统一后端资源类型别名，保证中栏步骤与右栏资源包命中同一份已生成资源。 */
export function normalizeResourceType(type?: string | null): string {
  const value = String(type ?? '').trim();
  if (value === 'assessment') return 'quiz';
  if (value === 'remedial') return 'misconception_card';
  return value;
}

export function findGeneratedResourceByType(resources: Resource[], resourceType: string): Resource | undefined {
  const normalizedType = normalizeResourceType(resourceType);
  return resources.find((resource) => normalizeResourceType(resource.resource_type || resource.type) === normalizedType);
}
