import type { Course } from '../types';
import { readLocalJson, writeLocalJson } from './browser-storage';
import { isRecord } from './type-guards';

const STORAGE_KEY = 'zhike_deleted_courses';

function isCourse(value: unknown): value is Course {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && typeof value.title === 'string';
}

function readStore(): Course[] {
  return readLocalJson<Course[]>(STORAGE_KEY, [], (value): value is Course[] => Array.isArray(value) && value.every(isCourse));
}

function writeStore(items: Course[]): void {
  writeLocalJson(STORAGE_KEY, items);
}

export function listMockDeletedCourses(): Course[] {
  return readStore();
}

export function pushMockDeletedCourse(course: Course): void {
  const deletedAt = new Date().toISOString();
  const items = readStore().filter((item) => item.id !== course.id);
  items.unshift({ ...course, status: 'deleted', deleted_at: deletedAt });
  writeStore(items);
}

export function restoreMockDeletedCourse(courseId: string): Course | null {
  const items = readStore();
  const index = items.findIndex((item) => item.id === courseId);
  if (index < 0) return null;
  const [restored] = items.splice(index, 1);
  writeStore(items);
  const previousStatus = restored.status === 'deleted' ? 'draft' : restored.status;
  return { ...restored, status: previousStatus, deleted_at: undefined };
}

export function purgeMockDeletedCourse(courseId: string): boolean {
  const items = readStore();
  const next = items.filter((item) => item.id !== courseId);
  if (next.length === items.length) return false;
  writeStore(next);
  return true;
}

export function filterActiveMockCourses(courses: Course[], deleted: Course[]): Course[] {
  const deletedIds = new Set(deleted.map((item) => item.id));
  return courses.filter((course) => course.status !== 'deleted' && !deletedIds.has(course.id));
}
