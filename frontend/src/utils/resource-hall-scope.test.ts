import { describe, expect, it } from 'vitest';
import type { Resource } from '../types';
import { filterResourceHallItems, resolveResourceScope } from './resource-hall-scope';

function resource(patch: Partial<Resource>): Resource {
  return {
    id: patch.id ?? 'resource',
    title: patch.title ?? '资源',
    resource_type: patch.resource_type ?? 'lecture',
    difficulty: patch.difficulty ?? 'medium',
    status: patch.status ?? 'draft',
    summary: patch.summary ?? '摘要',
    ...patch,
  };
}

describe('resource hall scope helpers', () => {
  it('treats resources without course_id as general resources', () => {
    const item = resource({ id: 'general', course_id: null });
    expect(resolveResourceScope(item, 'course-a')).toBe('general');
  });

  it('keeps current course filtering strict', () => {
    const items = [
      resource({ id: 'a', course_id: 'course-a' }),
      resource({ id: 'b', course_id: 'course-b' }),
      resource({ id: 'general', course_id: null }),
    ];

    expect(filterResourceHallItems(items, 'course', 'all', 'course-a').map((item) => item.id)).toEqual(['a']);
  });

  it('recognizes my generated and community resources by returned scope fields', () => {
    const items = [
      resource({ id: 'mine', course_id: null, owner_scope: 'mine' }),
      resource({ id: 'course-mine', course_id: 'course-a', owner_scope: 'mine' }),
      resource({ id: 'community', course_id: null, scope: 'community' }),
      resource({ id: 'general', course_id: null }),
    ];

    expect(filterResourceHallItems(items, 'mine', 'all', 'course-a').map((item) => item.id)).toEqual(['mine', 'course-mine']);
    expect(filterResourceHallItems(items, 'community', 'all', null).map((item) => item.id)).toEqual(['community']);
    expect(filterResourceHallItems(items, 'general', 'all', null).map((item) => item.id)).toEqual(['general']);
  });

  it('filters recommended resources independently from course binding', () => {
    const items = [
      resource({ id: 'course', course_id: 'course-a' }),
      resource({ id: 'recommended', course_id: null, is_recommended: true }),
      resource({ id: 'quiz', course_id: null, is_recommended: true, resource_type: 'quiz' }),
    ];

    expect(filterResourceHallItems(items, 'recommended', 'all', null).map((item) => item.id)).toEqual(['recommended', 'quiz']);
    expect(filterResourceHallItems(items, 'recommended', 'quiz', null).map((item) => item.id)).toEqual(['quiz']);
  });
});
