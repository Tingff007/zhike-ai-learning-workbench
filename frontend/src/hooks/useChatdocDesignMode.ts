import { useQuery } from '@tanstack/react-query';
import { api } from '../api/endpoints';

type ChatdocDesignModeResult = {
  designMode: boolean;
  /** @deprecated 使用 designMode */
  active: boolean;
  configured: boolean;
  credentialSource: string;
  isLoading: boolean;
};

/**
 * ChatDoc UI 设计模式：后端未配置凭证时使用 fixtures 做界面演示，不直接调用厂商 API。
 * 与 Mock 数据源（VITE_USE_MOCKS）无关。
 */
export function useChatdocDesignMode(): ChatdocDesignModeResult {
  const configQuery = useQuery({
    queryKey: ['chatdoc-config'],
    queryFn: () => api.chatdocConfig(),
    staleTime: 60_000,
  });

  const configured = Boolean(configQuery.data?.configured);
  const designMode = !configQuery.isLoading && !configured;

  return {
    designMode,
    /** @deprecated 使用 designMode */
    active: designMode,
    configured,
    credentialSource: configQuery.data?.credential_source ?? 'none',
    isLoading: configQuery.isLoading,
  };
}
