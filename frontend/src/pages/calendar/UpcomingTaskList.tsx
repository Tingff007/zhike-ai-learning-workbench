import { Link } from 'react-router-dom';
import {
  formatUpcomingTaskDate,
  formatUpcomingTaskTime,
  upcomingTaskStatusLabel,
  type UpcomingTaskViewModel,
} from './upcomingTaskUtils';

type UpcomingTaskListProps = {
  tasks: UpcomingTaskViewModel[];
  emptyMessage?: string;
};

type UpcomingTaskItemProps = {
  task: UpcomingTaskViewModel;
};

function upcomingProgressBadgeClass(task: UpcomingTaskViewModel): string {
  if (task.status === 'completed') return 'lc-upcoming-row__progress-badge--done';
  if (task.status === 'high_priority') return 'lc-upcoming-row__progress-badge--high';
  return '';
}

function upcomingStatusBadgeClass(task: UpcomingTaskViewModel): string {
  return `lc-upcoming-row__status-badge lc-upcoming-row__status-badge--${task.status}`;
}

function upcomingRowClass(task: UpcomingTaskViewModel): string {
  const classes = ['lc-upcoming-row'];
  if (task.status === 'completed') classes.push('lc-upcoming-row--done');
  if (task.status === 'high_priority') classes.push('lc-upcoming-row--high');
  return classes.join(' ');
}

/** 单条近期任务：胶囊进度标签 + 底部 2px 细进度线，标题完整单行展示 */
function UpcomingTaskItem({ task }: UpcomingTaskItemProps): JSX.Element {
  const progressWidth = `${task.progress}%`;

  return (
    <article className={upcomingRowClass(task)}>
      <div className="lc-upcoming-row__inner">
        <div className="lc-upcoming-row__headline">
          <Link to={task.href} className="lc-upcoming-row__title" title={task.title}>
            {task.title}
          </Link>
          <div className="lc-upcoming-row__badges">
            <span className={`lc-upcoming-row__progress-badge ${upcomingProgressBadgeClass(task)}`}>
              {task.progress}%
            </span>
            <span className={upcomingStatusBadgeClass(task)}>{upcomingTaskStatusLabel(task.status)}</span>
          </div>
        </div>
        <div className="lc-upcoming-row__meta">
          <span>{formatUpcomingTaskTime(task.timeLabel)}</span>
          <span>{formatUpcomingTaskDate(task.dateKey)}</span>
        </div>
        <div
          className="lc-upcoming-row__progress-line"
          role="progressbar"
          aria-valuenow={task.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${task.title} 完成进度 ${task.progress}%`}
        >
          <span style={{ width: progressWidth }} />
        </div>
      </div>
    </article>
  );
}

/** 近期 7 项任务列表 */
export function UpcomingTaskList({ tasks, emptyMessage }: UpcomingTaskListProps): JSX.Element {
  if (tasks.length === 0) {
    return (
      <p className="lc-task-empty">{emptyMessage ?? '暂无近期任务。'}</p>
    );
  }

  return (
    <div className="lc-task-list">
      {tasks.map((task) => (
        <UpcomingTaskItem key={task.id} task={task} />
      ))}
    </div>
  );
}
