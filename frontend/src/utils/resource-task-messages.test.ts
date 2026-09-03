import { describe, expect, it } from 'vitest';
import type { WorkspaceChatMessage } from '../stores/conversation.store';
import { buildResourceTaskPatch, mapTaskStatus, upsertResourceTaskMessage } from './resource-task-messages';

function message(patch: Partial<WorkspaceChatMessage> = {}): WorkspaceChatMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: '正在生成资源',
    createdAt: 1,
    ...patch,
  };
}

describe('资源任务消息工具', () => {
  it('将新旧任务状态映射为前端状态', () => {
    expect(mapTaskStatus('queued')).toBe('queued');
    expect(mapTaskStatus('planning')).toBe('planning');
    expect(mapTaskStatus('retrieving')).toBe('retrieving');
    expect(mapTaskStatus('running')).toBe('generating');
    expect(mapTaskStatus('succeeded')).toBe('completed');
    expect(mapTaskStatus('safety_checking')).toBe('safety_checking');
    expect(mapTaskStatus('cancelled')).toBe('cancelled');
  });

  it('构造带课程资料标记的失败补丁', () => {
    const patch = buildResourceTaskPatch(
      {
        status: 'failed',
        progress: 0,
        error_code: 'course_evidence_unavailable',
        error_message: '当前课程资料还未完成云端向量化，无法基于课件生成。',
        course_id: 'deep_learning_001',
        scope: 'course',
        course_evidence_required: true,
        current_agent: 'RetrieverAgent',
        citation_coverage: 'missing_course_evidence',
        resource_type: 'lecture',
        resource_type_label: '高白话讲义',
      },
      '反向传播讲义',
    );

    expect(patch).toMatchObject({
      variant: 'error',
      taskStatus: 'failed',
      taskStep: 'RetrieverAgent',
      courseBound: true,
      courseEvidenceRequired: true,
      taskErrorCode: 'course_evidence_unavailable',
      citationCoverage: 'missing_course_evidence',
      resourceType: 'lecture',
      resourceLabel: '高白话讲义',
    });
  });

  it('在任务补丁中保留教学图解包类型', () => {
    const patch = buildResourceTaskPatch(
      {
        status: 'succeeded',
        progress: 100,
        course_id: 'deep_learning_001',
        resource_type: 'diagram_pack',
        resource_type_label: '教学图解包',
      },
      '卷积神经网络教学图解包',
    );

    expect(patch).toMatchObject({
      variant: 'success',
      taskStatus: 'completed',
      resourceType: 'diagram_pack',
      resourceLabel: '教学图解包',
    });
  });

  it('将图片供应商配置失败格式化为图片生成指引', () => {
    const patch = buildResourceTaskPatch(
      {
        status: 'failed',
        progress: 0,
        error_code: 'image_provider_unavailable',
        error_message: 'ImageProvider 未配置，教学图解包无法真实出图；请先在模型网关配置图片生成供应商或设置 OPENAI_API_KEY。',
        course_id: 'deep_learning_001',
        scope: 'course',
        resource_type: 'diagram_pack',
        resource_type_label: '教学图解包',
      },
      '卷积神经网络教学图解包',
    );

    expect(patch.content).toContain('图片生成 API 未配置');
    expect(patch.content).toContain('网关中心 → 图片生成');
    expect(patch.content).not.toContain('Chat 模型 API 未配置');
    expect(patch.content).not.toContain('ImageProvider 未配置');
  });

  it('将图片生成运行时失败格式化为图片供应商指引', () => {
    const patch = buildResourceTaskPatch(
      {
        status: 'failed',
        progress: 82,
        error_code: 'image_provider_unavailable',
        error_message: 'ImageProvider 图片生成失败：三张图均未生成成功。',
        course_id: 'deep_learning_001',
        scope: 'course',
        resource_type: 'diagram_pack',
        resource_type_label: '教学图解包',
      },
      '卷积神经网络教学图解包',
    );

    expect(patch.content).toContain('图片生成供应商调用失败');
    expect(patch.content).toContain('图片模型名称');
    expect(patch.content).not.toContain('Chat 模型 API 未配置');
  });

  it('更新已有任务消息时保留原始 id、role 和必填 content', () => {
    const current = message({
      id: 'task-message',
      role: 'assistant',
      content: '旧进度',
      kind: 'resource_task',
      taskId: 'task-1',
    });

    const next = upsertResourceTaskMessage([current], 'task-1', {
      id: 'malicious-id',
      role: undefined,
      content: undefined,
      taskProgress: 80,
    });

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: 'task-message',
      role: 'assistant',
      content: '旧进度',
      taskId: 'task-1',
      kind: 'resource_task',
      taskProgress: 80,
    });
  });

  it('用 fallback 新增任务消息时补齐资源任务标记', () => {
    const fallback = message({
      id: 'fallback-message',
      content: '创建资源任务',
    });

    const next = upsertResourceTaskMessage([], 'task-2', {
      taskStatus: 'running',
      taskProgress: 35,
    }, fallback);

    expect(next).toEqual([
      expect.objectContaining({
        id: 'fallback-message',
        role: 'assistant',
        content: '创建资源任务',
        taskId: 'task-2',
        kind: 'resource_task',
        taskStatus: 'running',
        taskProgress: 35,
      }),
    ]);
  });

  it('没有现有消息且没有 fallback 时不插入不完整消息', () => {
    const next = upsertResourceTaskMessage([], 'task-3', {
      taskStatus: 'running',
      taskProgress: 10,
    });

    expect(next).toEqual([]);
  });
});
