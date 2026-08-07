import { useEffect } from "react";
import { useTaStore } from "../../stores/ta.store";
import { apiClient } from "../../api/client";

export function TaDashboardPage() {
  const { stats, loading, error, setStats, setLoading, setError } = useTaStore();

  useEffect(() => {
    setLoading(true);
    apiClient.get("/api/v1/ta/dashboard")
      .then((res: any) => setStats(res.data))
      .catch((err) => setError(err?.message || "加载失败"))
      .finally(() => setLoading(false));
  }, [setStats, setLoading, setError]);

  const cards = [
    { label: "班级数量", value: stats?.class_count ?? "-", color: "bg-zinc-900" },
    { label: "学生总数", value: stats?.student_count ?? "-", color: "bg-blue-700" },
    { label: "待批改", value: stats?.pending_grading ?? "-", color: "bg-amber-600" },
    { label: "活跃预警", value: stats?.active_alerts ?? "-", color: stats?.active_alerts ? "bg-red-600" : "bg-emerald-600" },
  ];

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">助教工作台</h1>
        <p className="mt-1 text-sm text-zinc-500">概览班级情况、待办任务和学情动态</p>
      </div>

      {/* 统计卡片 */}
      {loading ? (
        <div className="text-sm text-zinc-400">加载中...</div>
      ) : error ? (
        <div className="text-sm text-red-500">{error}</div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {cards.map((card) => (
            <div key={card.label} className="rounded-lg border border-zinc-200 bg-white p-5">
              <div className={`mb-3 h-2 w-8 rounded-full ${card.color}`} />
              <div className="text-2xl font-bold text-zinc-900">{card.value}</div>
              <div className="mt-1 text-xs text-zinc-500">{card.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* 快速入口 */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-zinc-700">快速操作</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { to: "/ta/lesson-prep", label: "智能备课", desc: "AI 生成教案与课件" },
            { to: "/ta/grading", label: "作业批改", desc: "批改学生提交的作业" },
            { to: "/ta/diagnosis", label: "学情诊断", desc: "查看班级学习状况" },
          ].map((item) => (
            <a
              key={item.to}
              href={item.to}
              className="rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300"
            >
              <div className="text-sm font-medium text-zinc-900">{item.label}</div>
              <div className="mt-1 text-xs text-zinc-500">{item.desc}</div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
