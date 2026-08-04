import { describe, expect, it } from 'vitest';
import type { WorkspaceChatMessage } from '../stores/conversation.store';
import {
  buildOpenResourcePreviewPayload,
  buildTraceResourcePreviewPayload,
  canOpenResourceArtifact,
} from './resource-preview';

function resourceMessage(patch: Partial<WorkspaceChatMessage> = {}): WorkspaceChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    kind: 'resource_task',
    content: '生成一份讲义',
    resourceLabel: '讲义',
    resourceTitle: '反向传播讲义',
    resourceType: 'lecture',
    taskId: 'task-1',
    taskStatus: 'generating',
    createdAt: 100,
    ...patch,
  };
}

describe('resource-preview', (): void => {
  it('进行中的任务只能打开任务预览', (): void => {
    const message = resourceMessage({ artifactId: 'artifact-1' });

    expect(canOpenResourceArtifact(message)).toBe(false);
    expect(buildOpenResourcePreviewPayload(message, 'artifact-1')).toEqual({
      taskId: 'task-1',
      artifactId: undefined,
      messageId: 'message-1',
      resourceType: 'lecture',
      resourceTitle: '反向传播讲义',
      prompt: '生成一份讲义',
      startedAt: 100,
      localStatus: undefined,
    });
  });

  it('已完成任务优先打开成品资源并隐藏任务 ID', (): void => {
    const message = resourceMessage({ taskStatus: 'completed', artifactId: 'artifact-old' });

    expect(canOpenResourceArtifact(message)).toBe(true);
    expect(buildOpenResourcePreviewPayload(message, 'artifact-new')).toMatchObject({
      taskId: undefined,
      artifactId: 'artifact-new',
      messageId: 'message-1',
      resourceTitle: '反向传播讲义',
    });
  });

  it('缺输入任务会保留本地状态提示', (): void => {
    const message = resourceMessage({ taskStatus: 'need_input', taskId: null });

    expect(buildOpenResourcePreviewPayload(message)).toMatchObject({
      taskId: undefined,
      artifactId: undefined,
      localStatus: 'need_input',
    });
  });

  it('Trace 预览优先保留任务态上下文', (): void => {
    expect(buildTraceResourcePreviewPayload(resourceMessage({ artifactId: 'artifact-1' }))).toEqual({
      taskId: 'task-1',
      artifactId: undefined,
      messageId: 'message-1',
      resourceType: 'lecture',
      resourceTitle: '反向传播讲义',
      prompt: '生成一份讲义',
      startedAt: 100,
    });

    expect(buildTraceResourcePreviewPayload(resourceMessage({
      taskId: null,
      artifactId: 'artifact-1',
    }))).toMatchObject({
      taskId: undefined,
      artifactId: 'artifact-1',
    });
  });
});
