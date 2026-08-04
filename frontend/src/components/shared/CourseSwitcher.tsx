import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpenCheck, Check, ChevronDown, Loader2, Sparkles } from 'lucide-react';
import { api } from '../../api/endpoints';
import { useAdminCourseAccess } from '../../hooks/useAdminCourseAccess';
import { useRestoreCurrentCourse } from '../../hooks/useRestoreCurrentCourse';
import { useCourseContextStore } from '../../stores/course-context.store';

const readableCourseTitles: Record<string, string> = {
  deep_learning_001: '深度学习',
  machine_learning_001: '机器学习',
  ai_intro_001: '人工智能导论',
};

type SelectableCourse = {
  id: string;
  title?: string | null;
};

function getReadableCourseTitle(course: SelectableCourse): string {
  return readableCourseTitles[course.id] ?? course.title ?? '未命名课程';
}

type CourseSwitcherProps = {
  /** `header` 为 Global Header 中间槽位的单行紧凑样式。 */
  variant?: 'default' | 'header';
};

/**
 * 课程上下文切换器：统一顶部栏与空状态中的课程选择体验。
 */
export function CourseSwitcher({ variant = 'default' }: CourseSwitcherProps): JSX.Element {
  const queryClient = useQueryClient();
  const listboxId = useId();
  const switcherRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const { isAdminUser } = useAdminCourseAccess();
  const { currentCourseId, currentCourseTitle, learningScope, setCurrentCourse, setGeneralMode } = useCourseContextStore();
  useRestoreCurrentCourse();

  const adminQuery = useQuery({
    queryKey: ['courses', 'admin'],
    queryFn: api.adminCourses,
    enabled: isAdminUser,
    retry: 1,
    staleTime: 60_000,
  });

  const publicQuery = useQuery({
    queryKey: ['courses', 'selectable'],
    queryFn: api.courses,
    enabled: !isAdminUser,
  });

  const fallbackQuery = useQuery({
    queryKey: ['courses', 'selectable', 'fallback'],
    queryFn: api.courses,
    enabled: isAdminUser && adminQuery.isError,
  });

  const courses = isAdminUser
    ? adminQuery.data?.items?.length
      ? adminQuery.data.items
      : fallbackQuery.data?.items ?? []
    : publicQuery.data?.items ?? [];

  const isLoading = isAdminUser
    ? adminQuery.isPending && !adminQuery.isError && !adminQuery.data && !fallbackQuery.data
    : publicQuery.isPending && !publicQuery.data;
  const loadFailed = isAdminUser && adminQuery.isError && fallbackQuery.isError;

  useEffect(() => {
    if (isLoading) return;
    if (learningScope !== 'course' || !currentCourseId) return;

    if (courses.length === 0) {
      if (!loadFailed) return;
      setGeneralMode();
      return;
    }

    const matched = courses.find((course) => course.id === currentCourseId);
    if (!matched) {
      setGeneralMode();
      return;
    }

    if (!currentCourseTitle.trim() || currentCourseTitle === currentCourseId) {
      setCurrentCourse(matched.id, getReadableCourseTitle(matched));
    }
  }, [
    courses,
    currentCourseId,
    currentCourseTitle,
    isLoading,
    learningScope,
    loadFailed,
    setCurrentCourse,
    setGeneralMode,
  ]);

  const selectedValue =
    learningScope === 'general' || !currentCourseId
      ? ''
      : courses.some((course) => course.id === currentCourseId)
        ? currentCourseId
        : '';
  const selectedCourse = selectedValue ? courses.find((course) => course.id === selectedValue) : undefined;
  const selectedLabel = selectedCourse ? `当前课程：${getReadableCourseTitle(selectedCourse)}` : '通用学习 / 不指定课程';
  const triggerMeta = isLoading
    ? '课程加载中'
    : loadFailed
      ? '课程加载失败'
      : selectedCourse
        ? '课程知识库上下文'
        : '普通对话与资料生成';
  const disabled = isLoading || (courses.length === 0 && !loadFailed);
  const courseOptions = useMemo(
    () => [
      {
        value: '',
        label: '通用学习 / 不指定课程',
        helper: '普通对话、学习规划与资料生成',
        Icon: Sparkles,
      },
      ...courses.map((course) => ({
        value: course.id,
        label: `当前课程：${getReadableCourseTitle(course)}`,
        helper: '绑定章节、路径与课程知识库',
        Icon: BookOpenCheck,
      })),
    ],
    [courses],
  );

  useEffect(() => {
    if (!isOpen) return undefined;

    function closeOnOutsideClick(event: MouseEvent): void {
      if (!switcherRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function closeOnEscape(event: globalThis.KeyboardEvent): void {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (disabled) setIsOpen(false);
  }, [disabled]);

  function handleSelect(value: string): void {
    if (!value) {
      setGeneralMode();
      setIsOpen(false);
      return;
    }

    const course = courses.find((item) => item.id === value);
    if (!course) return;
    setCurrentCourse(course.id, getReadableCourseTitle(course));
    setIsOpen(false);
    api.updateCurrentCourse(course.id).catch(() => undefined);
    queryClient.invalidateQueries();
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!disabled) setIsOpen(true);
    }
  }

  const isHeaderVariant = variant === 'header';

  return (
    <div
      ref={switcherRef}
      className={`course-switcher ${isOpen ? 'course-switcher--open' : ''} ${isHeaderVariant ? 'course-switcher--header' : ''}`}
    >
      <button
        type="button"
        className={`course-switcher__trigger ${isHeaderVariant ? 'course-switcher__trigger--header' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => setIsOpen((value) => !value)}
        onKeyDown={handleTriggerKeyDown}
      >
        {!isHeaderVariant && (
          <span className="course-switcher__leading" aria-hidden="true">
            {selectedCourse ? <BookOpenCheck size={15} /> : <Sparkles size={15} />}
          </span>
        )}
        <span className={`course-switcher__copy ${isHeaderVariant ? 'course-switcher__copy--header' : ''}`}>
          <span className="course-switcher__label">{selectedLabel}</span>
          {!isHeaderVariant && <span className="course-switcher__meta">{triggerMeta}</span>}
        </span>
        {isLoading ? (
          <Loader2 className="course-switcher__spinner" size={16} aria-hidden="true" />
        ) : (
          <ChevronDown className="course-switcher__chevron" size={16} aria-hidden="true" />
        )}
      </button>

      {isOpen && (
        <div className="course-switcher__menu" id={listboxId} role="listbox" aria-label="当前课程">
          {courseOptions.map(({ value, label, helper, Icon }) => {
            const selected = value === selectedValue;
            return (
              <button
                key={value || 'general'}
                type="button"
                className={`course-switcher__option ${selected ? 'course-switcher__option--active' : ''}`}
                role="option"
                aria-selected={selected}
                onClick={() => handleSelect(value)}
              >
                <span className="course-switcher__option-icon" aria-hidden="true">
                  <Icon size={15} />
                </span>
                <span className="course-switcher__option-copy">
                  <span>{label}</span>
                  <small>{helper}</small>
                </span>
                {selected && <Check className="course-switcher__check" size={15} aria-hidden="true" />}
              </button>
            );
          })}

          {courses.length === 0 && (
            <div className="course-switcher__empty" role="status">
              {loadFailed ? '课程加载失败，请稍后重试' : '暂无可选课程'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
