import { describe, expect, it } from 'vitest';
import { parseBackendFeatures } from './useBackendFeatures';

describe('后端能力探测响应解析', (): void => {
  it('接受结构完整的后端 feature 开关', (): void => {
    expect(parseBackendFeatures({
      status: 'ok',
      features: {
        course_ai_context: true,
        course_extracted_qa: false,
      },
    })).toEqual({
      course_ai_context: true,
      course_extracted_qa: false,
    });
  });

  it('拒绝缺失或非对象的 features 字段', (): void => {
    expect(parseBackendFeatures({ status: 'ok' })).toBeNull();
    expect(parseBackendFeatures({ status: 'ok', features: [] })).toBeNull();
    expect(parseBackendFeatures(null)).toBeNull();
  });

  it('拒绝非 boolean 的 feature 开关，避免坏响应污染前端能力判断', (): void => {
    expect(parseBackendFeatures({
      status: 'ok',
      features: {
        course_ai_context: 'true',
        course_extracted_qa: false,
      },
    })).toBeNull();
    expect(parseBackendFeatures({
      status: 'ok',
      features: {
        course_ai_context: true,
      },
    })).toBeNull();
  });
});
