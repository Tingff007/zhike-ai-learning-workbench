import { describe, expect, it } from 'vitest';
import { buildPersistedPipelineConfig, loadPersistedPipelineConfig } from './chatdocPipelineConfig';

describe('chatdocPipelineConfig', (): void => {
  it('加载持久化配置时只合并字符串值和布尔开关', (): void => {
    const result = loadPersistedPipelineConfig(
      {
        values: {
          wikiFilterScore: '0.72',
          qa_wikiFilterScore: 0.9,
          unknownValue: 'should-drop',
        },
        enabled: {
          wikiFilterScore: true,
          qa_wikiFilterScore: 'true',
          disabledField: false,
          unknownToggle: true,
        },
      },
      {
        values: {
          wikiFilterScore: '0.5',
          qa_wikiFilterScore: '0.5',
          retainedDefault: 'default',
        },
        enabled: {
          wikiFilterScore: false,
          qa_wikiFilterScore: false,
          retainedToggle: true,
        },
      },
    );

    expect(result.values).toEqual({
      wikiFilterScore: '0.72',
      qa_wikiFilterScore: '0.5',
      retainedDefault: 'default',
    });
    expect(result.enabled).toEqual({
      wikiFilterScore: true,
      qa_wikiFilterScore: false,
      retainedToggle: true,
    });
  });

  it('持久化配置结构异常时回退默认配置副本', (): void => {
    const defaults = {
      values: { wikiFilterScore: '0.5' },
      enabled: { wikiFilterScore: true },
    };

    const fromNull = loadPersistedPipelineConfig(null, defaults);
    const fromArray = loadPersistedPipelineConfig([], defaults);

    expect(fromNull).toEqual(defaults);
    expect(fromArray).toEqual(defaults);
    expect(fromNull).not.toBe(defaults);
    expect(fromArray).not.toBe(defaults);
  });

  it('构建持久化配置时生成同步的 JSON 文档并拷贝输入', (): void => {
    const values = { appId: 'demo-app', wikiFilterScore: '0.6' };
    const enabled = { appId: true, wikiFilterScore: true };
    const persisted = buildPersistedPipelineConfig(
      values,
      enabled,
    );
    values.appId = 'changed-app';
    enabled.wikiFilterScore = false;

    expect(persisted.values.appId).toBe('demo-app');
    expect(persisted.enabled.wikiFilterScore).toBe(true);
    expect(persisted.document.auth.body).toMatchObject({
      headers: {
        appId: 'demo-app',
      },
    });
  });
});
