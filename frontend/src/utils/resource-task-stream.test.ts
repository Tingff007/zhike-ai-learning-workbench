import { describe, expect, it } from 'vitest';
import type { ResourceGenerationTask } from '../types';
import {
  isTerminalResourceTaskStatus,
  mergeResourceGenerationTask,
  parseResourceTaskStreamPayload,
} from './resource-task-stream';

function task(patch: Partial<ResourceGenerationTask> = {}): ResourceGenerationTask {
  return {
    task_id: patch.task_id ?? 'task-1',
    status: patch.status ?? 'running',
    resource_type: patch.resource_type ?? 'lecture',
    steps: patch.steps ?? [],
    ...patch,
  };
}

describe('resource-task-stream', (): void => {
  it('解析资源任务实时帧时会过滤坏 JSON 和缺少类型的对象', (): void => {
    expect(parseResourceTaskStreamPayload('{bad')).toBeNull();
    expect(parseResourceTaskStreamPayload(JSON.stringify(['bad']))).toBeNull();
    expect(parseResourceTaskStreamPayload(JSON.stringify({ status: 'running' }))).toBeNull();

    expect(parseResourceTaskStreamPayload(JSON.stringify({
      type: 'resource_generation_progress',
      task_id: 'task-1',
      status: 'generating',
    }))).toEqual({
      type: 'resource_generation_progress',
      task_id: 'task-1',
      status: 'generating',
    });
  });

  it('识别资源任务终态', (): void => {
    expect(isTerminalResourceTaskStatus('completed')).toBe(true);
    expect(isTerminalResourceTaskStatus('failed')).toBe(true);
    expect(isTerminalResourceTaskStatus('need_input')).toBe(true);
    expect(isTerminalResourceTaskStatus('generating')).toBe(false);
    expect(isTerminalResourceTaskStatus(null)).toBe(false);
  });

  it('合并实时任务增量时保留稳定数组字段', (): void => {
    const base = task({
      steps: [{ name: 'Generate', status: 'running' }],
      outline_json: [{ id: 'sec-1', level: 1, title: '章节', order: 1 }],
      citations: [{ similarity: 0.9, snippet: '引用' }],
      assets: [{ id: 'asset-1', title: '图解', status: 'completed' }],
    });

    expect(mergeResourceGenerationTask(base, {
      status: 'completed',
      progress: 100,
    })).toEqual({
      ...base,
      status: 'completed',
      progress: 100,
    });
  });

  it('没有缓存任务时也能从增量构造任务对象', (): void => {
    const merged = mergeResourceGenerationTask(undefined, {
      task_id: 'task-2',
      status: 'queued',
      resource_type: 'quiz',
    });

    expect(merged).toMatchObject({
      task_id: 'task-2',
      status: 'queued',
      resource_type: 'quiz',
      steps: [],
      outline_json: [],
      citations: [],
      assets: [],
    });
  });

  it('缺少必填字段的增量会使用稳定兜底值', (): void => {
    expect(mergeResourceGenerationTask(undefined, { progress: 12 })).toMatchObject({
      task_id: '',
      status: 'unknown',
      resource_type: 'unknown',
      progress: 12,
      steps: [],
      outline_json: [],
      citations: [],
      assets: [],
    });
  });
});
