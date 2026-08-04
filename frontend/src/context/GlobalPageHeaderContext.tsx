import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/** 页面注册到 Global Header 左侧身份区的内容。 */
export type GlobalPageHeaderRegistration = {
  title: string;
  subtitle?: ReactNode;
  /** 右侧槽位中的页面级主操作，如上传、历史对比等。 */
  primaryAction?: ReactNode;
};

type GlobalPageHeaderContextValue = {
  registration: GlobalPageHeaderRegistration | null;
  setRegistration: (value: GlobalPageHeaderRegistration | null) => void;
  /** 路由级默认页头，页面未注册时使用。 */
  fallback: GlobalPageHeaderRegistration;
};

const GlobalPageHeaderContext = createContext<GlobalPageHeaderContextValue | null>(null);

type GlobalPageHeaderProviderProps = {
  children: ReactNode;
  fallback: GlobalPageHeaderRegistration;
};

/**
 * 工作台 Global Header 页头注册上下文。
 * 页面通过 `useRegisterGlobalPageHeader` 写入标题与主操作，由 `GlobalHeader` 统一渲染。
 */
export function GlobalPageHeaderProvider({ children, fallback }: GlobalPageHeaderProviderProps): JSX.Element {
  const [registration, setRegistration] = useState<GlobalPageHeaderRegistration | null>(null);
  const value = useMemo(
    () => ({
      registration,
      setRegistration,
      fallback,
    }),
    [fallback, registration],
  );

  return <GlobalPageHeaderContext.Provider value={value}>{children}</GlobalPageHeaderContext.Provider>;
}

/** 读取当前生效的页头信息（页面注册优先，否则使用路由 fallback）。 */
export function useGlobalPageHeaderState(): GlobalPageHeaderRegistration {
  const ctx = useContext(GlobalPageHeaderContext);
  if (!ctx) {
    throw new Error('useGlobalPageHeaderState 必须在 GlobalPageHeaderProvider 内使用');
  }
  return ctx.registration ?? ctx.fallback;
}

/** 是否处于 Global Header 托管模式（工作台内始终为 true）。 */
export function useGlobalPageHeaderActive(): boolean {
  return useContext(GlobalPageHeaderContext) !== null;
}

/**
 * 向 Global Header 注册当前页面的标题、副标题与主操作。
 * 组件卸载时自动清理，避免路由切换残留。
 */
export function useRegisterGlobalPageHeader({
  title,
  subtitle,
  primaryAction,
}: GlobalPageHeaderRegistration): void {
  const ctx = useContext(GlobalPageHeaderContext);
  const setRegistration = ctx?.setRegistration;

  useEffect(() => {
    if (!setRegistration) return undefined;
    setRegistration({ title, subtitle, primaryAction });
    return () => setRegistration(null);
  }, [primaryAction, setRegistration, subtitle, title]);
}
