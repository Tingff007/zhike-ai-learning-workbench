import type { ReactNode } from 'react';
import { ChevronRight, Heart, Sparkles, Star, type LucideIcon } from 'lucide-react';
import type { Resource } from '../../types';

export function StatTile({
  label,
  value,
  caption,
  Icon,
  tone = 'slate',
}: {
  label: string;
  value: ReactNode;
  caption: string;
  Icon: LucideIcon;
  tone?: 'slate' | 'blue' | 'emerald' | 'amber' | 'rose';
}): JSX.Element {
  const toneProfile = {
    slate: {
      root: 'border-slate-200',
      icon: 'bg-slate-50 text-slate-600',
    },
    blue: {
      root: 'border-blue-100',
      icon: 'bg-blue-50 text-blue-600',
    },
    emerald: {
      root: 'border-emerald-100',
      icon: 'bg-emerald-50 text-emerald-600',
    },
    amber: {
      root: 'border-amber-100',
      icon: 'bg-amber-50 text-amber-600',
    },
    rose: {
      root: 'border-rose-100',
      icon: 'bg-rose-50 text-rose-600',
    },
  }[tone];
  return (
    <div className={`border-l px-4 py-3 ${toneProfile.root}`}>
      <div className="flex items-center justify-between gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-md ${toneProfile.icon}`}>
          <Icon size={18} />
        </span>
        <strong className="text-2xl font-black text-slate-900">{value}</strong>
      </div>
      <div className="mt-3">
        <p className="text-sm font-black text-slate-800">{label}</p>
        <p className="mt-1 text-xs font-medium leading-5 text-slate-500">{caption}</p>
      </div>
    </div>
  );
}

export function CompactResource({
  resource,
  onClick,
  variant = 'recommended',
}: {
  resource: Resource;
  onClick: () => void;
  variant?: 'featured' | 'recommended';
}): JSX.Element {
  const tone = variant === 'featured'
    ? {
        card: 'border-amber-100 hover:border-amber-200 hover:bg-amber-50/45',
        icon: 'text-amber-600',
        pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
        label: '精选',
      }
    : {
        card: 'border-sky-100 hover:border-sky-200 hover:bg-sky-50/45',
        icon: 'text-sky-600',
        pill: 'bg-sky-50 text-sky-700 ring-1 ring-sky-100',
        label: '画像推荐',
      };
  return (
    <button
      type="button"
      className={`group grid gap-3 border-b bg-white/80 px-4 py-3 text-left transition ${tone.card}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            {variant === 'featured' ? <Star className={`shrink-0 ${tone.icon}`} size={15} /> : <Sparkles className={`shrink-0 ${tone.icon}`} size={15} />}
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${tone.pill}`}>{tone.label}</span>
            <strong className="truncate text-sm font-black text-slate-900">{resource.title}</strong>
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{resource.summary}</p>
        </div>
        <ChevronRight className="mt-1 shrink-0 text-slate-300 transition group-hover:text-blue-500" size={16} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(resource.badges ?? []).slice(0, 3).map((badge, index) => (
          <span key={`${badge}-${index}`} className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-500 ring-1 ring-slate-100">
            {badge}
          </span>
        ))}
      </div>
    </button>
  );
}

export function ActionCue({
  title,
  description,
  Icon,
  tone = 'emerald',
  onClick,
}: {
  title: string;
  description: string;
  Icon: LucideIcon;
  tone?: 'emerald' | 'sky' | 'amber' | 'slate';
  onClick: () => void;
}): JSX.Element {
  const toneProfile = {
    emerald: 'border-emerald-100 bg-emerald-50/55 text-emerald-700 hover:bg-emerald-50',
    sky: 'border-sky-100 bg-sky-50/65 text-sky-700 hover:bg-sky-50',
    amber: 'border-amber-100 bg-amber-50/65 text-amber-700 hover:bg-amber-50',
    slate: 'border-slate-200 bg-slate-50/80 text-slate-700 hover:bg-white',
  }[tone];
  return (
    <button
      type="button"
      className={`group flex items-start gap-3 rounded-lg border px-3 py-3 text-left transition ${toneProfile}`}
      onClick={onClick}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white/80 text-current shadow-sm">
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <strong className="block text-sm font-black text-slate-900">{title}</strong>
        <span className="mt-1 block text-xs font-medium leading-5 text-slate-600">{description}</span>
      </span>
      <ChevronRight className="ml-auto mt-2 shrink-0 text-current opacity-45 transition group-hover:translate-x-0.5 group-hover:opacity-80" size={15} />
    </button>
  );
}

export function DetailEngagementItem({
  label,
  value,
  Icon,
  active = false,
  onClick,
}: {
  label: string;
  value?: ReactNode;
  Icon: LucideIcon;
  active?: boolean;
  onClick?: () => void;
}): JSX.Element {
  const className = `inline-flex h-10 items-center gap-2 rounded-md border px-3 text-xs font-black transition ${
    active
      ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
      : onClick
        ? 'border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700'
        : 'border-transparent bg-transparent text-slate-500'
  }`;

  const content = (
    <>
      <Icon size={16} fill={active && Icon === Heart ? 'currentColor' : 'none'} />
      <span>{label}</span>
      {value != null ? <span className={active ? 'text-white/80' : 'text-slate-400'}>{value}</span> : null}
    </>
  );

  if (!onClick) return <span className={className}>{content}</span>;
  return (
    <button type="button" className={className} onClick={onClick}>
      {content}
    </button>
  );
}

export function FlowStep({
  label,
  description,
  done,
  Icon,
}: {
  label: string;
  description: string;
  done: boolean;
  Icon: LucideIcon;
}): JSX.Element {
  return (
    <div className="flex gap-3 border-l border-slate-200 pb-4 pl-4 last:pb-0">
      <span className={`-ml-[25px] grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
        done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white text-slate-400'
      }`}
      >
        <Icon size={12} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-black text-slate-900">{label}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      </div>
    </div>
  );
}
