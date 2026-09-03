import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '../api/endpoints';

type RuntimeInfo = Awaited<ReturnType<typeof api.runtimeInfo>>;

/** 只读数据模式（UI 标签/提示）。数据请求请始终走 api.*，不要在组件内自行切换 Mock。 */
export function useDataMode(): UseQueryResult<RuntimeInfo> {
  return useQuery({
    queryKey: ['runtime-info'],
    queryFn: () => api.runtimeInfo(),
    staleTime: Infinity,
    initialData: () => api.runtimeInfo(),
  });
}
