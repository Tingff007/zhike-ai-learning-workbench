import { create, type StoreApi, type UseBoundStore } from "zustand";

export type TaDashboardStats = {
  class_count: number;
  student_count: number;
  pending_grading: number;
  active_alerts: number;
};

type TaState = {
  stats: TaDashboardStats | null;
  loading: boolean;
  error: string | null;
  setStats: (stats: TaDashboardStats) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
};

export const useTaStore: UseBoundStore<StoreApi<TaState>> = create<TaState>((set) => ({
  stats: null,
  loading: false,
  error: null,
  setStats: (stats) => set({ stats, loading: false, error: null }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
}));
