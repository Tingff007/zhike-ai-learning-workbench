export function LoadingState({ label = '正在读取数据...' }: { label?: string }): JSX.Element {
  return <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">{label}</div>;
}

export function EmptyState({ label = '暂无数据' }: { label?: string }): JSX.Element {
  return <div className="rounded-md border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">{label}</div>;
}

export function ErrorState({ label = '接口请求失败，请确认后端已启动并完成数据库迁移。' }: { label?: string }): JSX.Element {
  return <div className="rounded-md border border-red-100 bg-red-50 p-6 text-center text-sm text-red-600">{label}</div>;
}
