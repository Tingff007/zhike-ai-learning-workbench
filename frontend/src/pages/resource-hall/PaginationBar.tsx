import { ChevronLeft, ChevronRight } from 'lucide-react';

type PaginationBarProps = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions: number[];
};

/** 资源大厅分页条：集中展示页码、范围摘要和每页数量切换。 */
export function PaginationBar({
  page,
  pageSize,
  totalItems,
  totalPages,
  hasPrev,
  hasNext,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions,
}: PaginationBarProps): JSX.Element {
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(totalItems, page * pageSize);
  const pages = Array.from({ length: Math.min(totalPages, 5) }, (_, index) => {
    const half = 2;
    const first = Math.max(1, Math.min(page - half, totalPages - 4));
    return first + index;
  }).filter((item) => item >= 1 && item <= totalPages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-xs font-bold text-slate-500">
        显示 {start}-{end} / 共 {totalItems} 个资源
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-600">
          每页
          <select
            className="border-0 bg-transparent text-xs font-black text-slate-900 outline-none"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {pageSizeOptions.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40"
          disabled={!hasPrev}
          onClick={() => onPageChange(page - 1)}
          title="上一页"
        >
          <ChevronLeft size={16} />
        </button>
        {pages.map((item) => (
          <button
            key={item}
            type="button"
            className={`h-9 min-w-9 rounded-md px-3 text-xs font-black ${
              item === page ? 'bg-emerald-600 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
            }`}
            onClick={() => onPageChange(item)}
          >
            {item}
          </button>
        ))}
        <button
          type="button"
          className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40"
          disabled={!hasNext}
          onClick={() => onPageChange(page + 1)}
          title="下一页"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
