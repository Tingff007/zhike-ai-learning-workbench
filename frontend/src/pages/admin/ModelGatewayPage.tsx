import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  AlertTriangle,
  Check,
  Database,
  Edit3,
  Image as ImageIcon,
  KeyRound,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '../../api/endpoints';
import { getApiErrorMessage } from '../../api/client';
import { AdminPageHeader, AdminPageShell } from '../../components/admin/AdminScaffold';
import { ProviderIconBadge, ProviderIconPicker } from '../../components/model-gateway/ProviderIconPicker';
import { CourseBindingPanel } from '../../components/model-gateway/CourseBindingPanel';
import { GatewayKnowledgeCredentialsPanel } from '../../components/model-gateway/GatewayKnowledgeCredentialsPanel';
import { WorkspaceToast, type ToastTone, type WorkspaceToastItem } from '../../components/shared/WorkspaceToast';
import { ModelGatewayLogsPanel } from '../../components/model-gateway/ModelGatewayLogsPanel';
import { IntentRouterPanel } from '../../components/model-gateway/IntentRouterPanel';
import { ProviderTemplatePresetFields } from '../../components/model-gateway/ProviderTemplatePresetFields';
import { CustomChatProviderFields } from '../../components/model-gateway/CustomChatProviderFields';
import {
  applyCustomChatProvider,
  applyCustomImageProvider,
  applyProviderTemplate,
  createEmptyChatProvider,
  createEmptyImageProvider,
  isChatProviderTemplate,
  isImageProviderTemplate,
  isCredentialOnlyMode,
  loadProviderTemplates,
} from '../../data/modelProviderTemplates';
import { ConfirmDialog } from '../../components/shared/ConfirmDialog';
import {
  ConnectionTestResultPanel,
  EditorActionFeedbackPanel,
  providerTestToSnapshot,
  type ConnectionTestSnapshot,
  type EditorActionFeedback,
} from '../../components/model-gateway/ConnectionTestResultPanel';
import { formatProviderTestNotice } from '../../utils/providerTestNotice';
import type { ProviderTestResult } from '../../types';
import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';
import { loadRagIntegrationTemplates } from '../../data/ragIntegrationTemplates';
import { useCurrentCourseId } from '../../hooks/useCourseData';
import {
  chatProviderHasStoredKey,
  formatValidationNotice,
  normalizeChatProviderPayload,
  slugifyProviderCode,
  validateChatProviderPayload,
} from '../../utils/providerFormValidation';
import type { ModelProviderHealth, ModelProviderPayload, ModelProviderTemplate } from '../../types';
import { GatewayStatusPill, gatewayStatusLabel } from '../../components/model-gateway/GatewayStatusPill';
import {
  clearChatProviderDraft,
  loadChatProviderDraft,
  loadGatewayTab,
  saveChatProviderDraft,
  saveGatewayTab,
  type GatewayTabKey,
} from '../../utils/gatewayPageDraft';

const TAB_KEYS: GatewayTabKey[] = ['chat', 'image', 'knowledge', 'binding', 'intent', 'logs'];
const TAB_KEY_SET = new Set<string>(TAB_KEYS);

const GATEWAY_NAV_ITEMS: Array<{
  key: GatewayTabKey;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { key: 'chat', label: 'Chat 模型', description: '对话与多模态供应商', icon: Database },
  { key: 'image', label: '图片生成', description: '教学图解与图片模型', icon: ImageIcon },
  { key: 'knowledge', label: '知识向量化', description: 'RAG 凭证与向量模型', icon: KeyRound },
  { key: 'binding', label: '按课绑定', description: '课程级模型策略', icon: Zap },
  { key: 'intent', label: '意图路由', description: '意图注册表治理（Intent Registry）', icon: ShieldCheck },
  { key: 'logs', label: '调用日志', description: '请求、追踪与成本', icon: Activity },
];

function isGatewayTabKey(value: string): value is GatewayTabKey {
  return TAB_KEY_SET.has(value);
}

function tabFromSearchParam(value: string | null, fallback?: GatewayTabKey | null): GatewayTabKey {
  if (value === 'reload') return 'chat';
  if (value === 'usage') return 'logs';
  if (value && isGatewayTabKey(value)) return value;
  if (fallback && TAB_KEYS.includes(fallback)) return fallback;
  return 'chat';
}
type ProviderFilters = { query: string; status: string };

function isChatProvider(provider: ModelProviderHealth): boolean {
  return provider.provider_type === 'chat' || provider.provider_type === 'both';
}

function isImageProvider(provider: ModelProviderHealth): boolean {
  return provider.provider_type === 'image' || provider.provider_type === 'image_generation';
}

function readMetaString(meta: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = meta?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function BoolIcon({ value }: { value?: boolean }): JSX.Element {
  return value
    ? <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700"><Check size={14} /></span>
    : <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-400"><X size={14} /></span>;
}

function StatStrip({
  providers,
  knowledgeConfigured,
  knowledgeLoading,
}: {
  providers: ModelProviderHealth[];
  knowledgeConfigured?: boolean;
  knowledgeLoading?: boolean;
}): JSX.Element {
  const healthyCount = providers.filter((item) => item.status === 'healthy').length;
  const healthRate = providers.length ? Math.round((healthyCount / providers.length) * 100) : 0;
  const chatCount = providers.filter(isChatProvider).length;
  const imageCount = providers.filter(isImageProvider).length;
  const knowledgeDetail = knowledgeLoading
    ? '检测中…'
    : knowledgeConfigured
      ? '云端 RAG 已就绪'
      : '待配置 AppId / Secret';
  const stats = [
    { label: 'Chat 供应商', value: chatCount, detail: `共 ${providers.length} 条记录`, icon: Database },
    { label: '图片生成', value: imageCount, detail: imageCount ? '教学图解可选' : '未配置 ImageProvider', icon: ImageIcon },
    { label: '已启用', value: providers.filter((item) => item.is_active).length, detail: `${providers.filter((item) => !item.is_active).length} 个禁用`, icon: Zap },
    { label: '健康正常', value: healthyCount, detail: `健康率 ${healthRate}%`, icon: ShieldCheck },
    { label: '知识向量化', value: knowledgeLoading ? '…' : knowledgeConfigured ? '已配置' : '未配置', detail: knowledgeDetail, icon: KeyRound },
  ];
  return (
    <div className="grid gap-3 xl:grid-cols-5">
      {stats.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-neutral-500">{item.label}</div>
                <div className="mt-1 text-2xl font-semibold text-neutral-950">{item.value}</div>
                <div className="mt-1 text-xs text-neutral-500">{item.detail}</div>
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-neutral-700">
                <Icon size={20} />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
function GatewaySidebar({
  activeTab,
  onSelect,
  chatCount,
  imageCount,
  providerCount,
  abnormalCount,
  knowledgeConfigured,
}: {
  activeTab: GatewayTabKey;
  onSelect: (tab: GatewayTabKey) => void;
  chatCount: number;
  imageCount: number;
  providerCount: number;
  abnormalCount: number;
  knowledgeConfigured?: boolean;
}): JSX.Element {
  function badgeFor(tab: GatewayTabKey): string {
    if (tab === 'chat') return `${chatCount}`;
    if (tab === 'image') return `${imageCount}`;
    if (tab === 'knowledge') return knowledgeConfigured ? '已配置' : '待配置';
    if (tab === 'logs') return abnormalCount > 0 ? `${abnormalCount} 异常` : `${providerCount} 源`;
    return '';
  }

  return (
    <aside className="gateway-sidebar flex min-h-0 min-w-0 flex-col rounded-lg border border-neutral-200 bg-white p-3">
      <div className="flex items-center gap-2 px-2 py-2">
        <span className="h-3 w-3 rounded-full border-2 border-neutral-950" />
        <div className="text-base font-semibold text-neutral-950">智课网关</div>
      </div>
      <div className="mt-3 flex items-center gap-2 px-1">
        <button type="button" className="flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-neutral-950 px-3 text-sm font-medium text-white hover:bg-neutral-800" onClick={() => onSelect('chat')}>
          <Plus size={15} />
          快速新增
        </button>
        <button type="button" className="flex h-9 w-9 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50" onClick={() => onSelect('logs')} title="查看调用日志">
          <Activity size={15} />
        </button>
      </div>
      <nav className="mt-3 grid min-h-0 min-w-0 flex-1 content-start gap-1 overflow-y-auto overflow-x-hidden pr-1" aria-label="网关中心模块">
        {GATEWAY_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.key;
          const badge = badgeFor(item.key);
          return (
            <button
              key={item.key}
              type="button"
              className={`group grid min-h-[54px] w-full min-w-0 grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-3 py-2 text-left transition-colors ${
                active
                  ? 'bg-neutral-950 text-white'
                  : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950'
              }`}
              onClick={() => onSelect(item.key)}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                active ? 'bg-white/10 text-white' : 'text-neutral-600'
              }`}
              >
                <Icon size={16} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{item.label}</span>
                <span className={`mt-0.5 block truncate text-xs ${active ? 'text-white/65' : 'text-neutral-500'}`}>
                  {item.description}
                </span>
              </span>
              {badge && (
                <span className={`max-w-[64px] shrink-0 truncate rounded-full px-1.5 py-0.5 text-center text-[11px] font-medium ${
                  active ? 'bg-white text-neutral-950' : 'bg-neutral-100 text-neutral-500'
                }`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function filterProviders(providers: ModelProviderHealth[], filters: ProviderFilters): ModelProviderHealth[] {
  const query = filters.query.trim().toLowerCase();
  const abnormal = new Set(['degraded', 'unhealthy', 'failed', 'down']);
  return providers.filter((item) => {
    const matchesQuery = !query || [
      item.display_name,
      item.provider,
      item.chat_model,
      item.embedding_model,
      item.protocol,
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
    const matchesStatus = filters.status === 'all'
      || (filters.status === 'abnormal' ? abnormal.has(item.status) : item.status === filters.status);
    return matchesQuery && matchesStatus;
  });
}

function providerToPayload(provider: ModelProviderHealth): ModelProviderPayload {
  return {
    provider: provider.provider,
    display_name: provider.display_name,
    provider_type: provider.provider_type ?? 'embedding',
    base_url: provider.base_url ?? '',
    protocol: provider.protocol ?? 'openai_compatible',
    api_key: '',
    clear_api_key: false,
    chat_model: provider.chat_model ?? '',
    embedding_model: provider.embedding_model ?? '',
    image_model: provider.image_model ?? readMetaString(provider.meta_json, 'image_model') ?? provider.chat_model ?? '',
    embedding_dimension: provider.embedding_dimension ?? 1024,
    max_batch_size: provider.max_batch_size ?? 10,
    rate_limit_rps: provider.rate_limit_rps ?? undefined,
    supports_stream: provider.supports_stream ?? false,
    supports_tool_call: provider.supports_tool_call ?? false,
    supports_json_mode: provider.supports_json_mode ?? false,
    health_status: provider.status ?? 'standby',
    priority: provider.priority ?? 10,
    is_active: provider.is_active ?? true,
    is_default: provider.is_default ?? false,
    daily_limit: provider.daily_limit ?? null,
    cost_config_json: provider.cost_config_json ?? {},
    meta_json: provider.meta_json ?? {},
  };
}

type TabKey = GatewayTabKey;

export function ModelGatewayPage(): JSX.Element {
  const queryClient = useQueryClient();
  const courseId = useCurrentCourseId();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>(() => tabFromSearchParam(searchParams.get('tab'), loadGatewayTab()));

  useEffect(() => {
    if (searchParams.get('tab') === 'reload') {
      setSearchParams((params) => {
        const next = new URLSearchParams(params);
        next.delete('tab');
        return next;
      }, { replace: true });
      return;
    }
    if (searchParams.get('tab') === 'usage') {
      setSearchParams((params) => {
        const next = new URLSearchParams(params);
        next.set('tab', 'logs');
        return next;
      }, { replace: true });
      return;
    }
    setActiveTab(tabFromSearchParam(searchParams.get('tab')));
  }, [searchParams, setSearchParams]);

  function selectTab(tab: TabKey): void {
    setActiveTab(tab);
    saveGatewayTab(tab);
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      if (tab === 'chat') next.delete('tab');
      else next.set('tab', tab);
      return next;
    }, { replace: true });
  }
  const [editing, setEditing] = useState<ModelProviderPayload | null>(() => loadChatProviderDraft());
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [providerFilters, setProviderFilters] = useState<ProviderFilters>({ query: '', status: 'all' });
  const [toast, setToast] = useState<WorkspaceToastItem | null>(null);

  function showToast(message: string, tone: ToastTone = 'info'): void {
    setToast({ id: `gateway-toast-${Date.now()}`, message, tone });
  }
  const [editorTestResult, setEditorTestResult] = useState<ConnectionTestSnapshot | null>(null);
  const [editorFeedback, setEditorFeedback] = useState<EditorActionFeedback | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ provider: string; displayName: string } | null>(null);

  useEffect(() => {
    saveGatewayTab(activeTab);
  }, [activeTab]);

  useEffect(() => {
    saveChatProviderDraft(editing);
  }, [editing]);

  function closeChatEditor(): void {
    setEditing(null);
    setIsAddingNew(false);
    setEditorTestResult(null);
    setEditorFeedback(null);
    clearChatProviderDraft();
  }

  function notifyEditor(message: string, tone: EditorActionFeedback['tone'] = 'info'): void {
    setEditorFeedback({ message, tone });
  }

  function updateChatEditor(next: ModelProviderPayload | null): void {
    if (next === null) {
      closeChatEditor();
      return;
    }
    setEditing(next);
  }

  const templatesQuery = useQuery({
    queryKey: ['model-provider-templates'],
    queryFn: () => loadProviderTemplates(),
    retry: 1,
    staleTime: 60_000,
  });
  const providerTemplates = templatesQuery.data?.items ?? [];
  const templatesUsingBundledFallback = templatesQuery.data?.source === 'bundled';

  const providersQuery = useQuery({ queryKey: ['model-providers', 'all'], queryFn: () => api.modelProviders('all') });
  // 与 Chat 供应商列表相同：进入网关中心即预取，切到「知识向量化」时直接用缓存，无需全屏加载
  useQuery({
    queryKey: ['rag-integration-templates'],
    queryFn: () => loadRagIntegrationTemplates(),
    staleTime: 60_000,
  });
  useQuery({
    queryKey: ['chatdoc-config-instances'],
    queryFn: () => api.listChatdocConfigInstances(),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const knowledgeConfigQuery = useQuery({
    queryKey: ['chatdoc-config', 'gateway-summary'],
    queryFn: () => api.chatdocConfig(),
    staleTime: 30_000,
  });
  const providers = providersQuery.data?.items ?? [];
  const chatProviders = useMemo(
    () => providers.filter(isChatProvider),
    [providers],
  );
  const imageProviders = useMemo(
    () => providers.filter(isImageProvider),
    [providers],
  );
  const visibleChatProviders = useMemo(() => filterProviders(chatProviders, providerFilters), [chatProviders, providerFilters]);
  const visibleImageProviders = useMemo(() => filterProviders(imageProviders, providerFilters), [imageProviders, providerFilters]);
  const chatTemplates = useMemo(() => providerTemplates.filter(isChatProviderTemplate), [providerTemplates]);
  const imageTemplates = useMemo(() => providerTemplates.filter(isImageProviderTemplate), [providerTemplates]);

  const invalidateProviders = (): void => {
    queryClient.invalidateQueries({ queryKey: ['model-providers'] });
    queryClient.invalidateQueries({ queryKey: ['model-provider-health'] });
    queryClient.invalidateQueries({ queryKey: ['model-provider-logs'] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload: ModelProviderPayload) => {
      if (isAddingNew) {
        // 新增模式：始终 POST（忽略已存在的 provider code）
        return api.saveModelProvider(payload, undefined);
      }
      return api.saveModelProvider(payload, providers.some((item) => item.provider === payload.provider) ? payload.provider : undefined);
    },
    onSuccess: (result) => {
      const label = providers.find((item) => item.provider === result.provider)?.display_name ?? result.provider;
      if (isAddingNew) {
        setIsAddingNew(false);
      }
      notifyEditor(`「${label}」${kb.chatEditorSaveSuccess}`, 'success');
      invalidateProviders();
    },
    onError: (error) => {
      notifyEditor(getApiErrorMessage(error, '保存失败，请检查填写项后重试。'), 'error');
    },
  });
  const testMutation = useMutation<ProviderTestResult, Error, string>({
    mutationFn: api.testProvider,
    onSuccess: (result) => {
      showToast(formatProviderTestNotice(result), result.status === 'passed' ? 'success' : 'error');
      invalidateProviders();
    },
    onError: (error) => {
      showToast(getApiErrorMessage(error, '连接测试失败，未收到服务器详情。'), 'error');
    },
  });
  const testDraftMutation = useMutation({
    mutationFn: api.testModelProviderDraft,
    onMutate: () => {
      setEditorFeedback(null);
    },
    onSuccess: (result: ProviderTestResult) => {
      setEditorTestResult(providerTestToSnapshot(result));
    },
    onError: (error) => {
      const message = getApiErrorMessage(error, '连接测试失败，未收到服务器详情。');
      setEditorTestResult({ status: 'failed', message });
    },
  });
  const checkAllMutation = useMutation({
    mutationFn: api.checkAllModelProviders,
    onSuccess: (result) => {
      showToast(`批量检查完成：${result.checked} 个供应商，健康 ${result.passed}，降级 ${result.degraded}，失败 ${result.failed}。`, 'success');
      invalidateProviders();
    },
    onError: (error) => showToast(error instanceof Error ? error.message : '批量健康检查失败。', 'error'),
  });
  const defaultMutation = useMutation({
    mutationFn: api.setDefaultProvider,
    onSuccess: (result) => {
      showToast(`${result.provider} 已设为默认供应商。`, 'success');
      invalidateProviders();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: api.deleteModelProvider,
    onSuccess: (result) => {
      const parts: string[] = [];
      if (result.deleted_call_logs) parts.push(`清除 ${result.deleted_call_logs} 条调用日志`);
      if (result.cleared_course_bindings) parts.push(`解除 ${result.cleared_course_bindings} 门课程绑定`);
      showToast(`${result.provider} 已删除${parts.length ? `（${parts.join('，')}）` : ''}。`, 'success');
      setDeleteTarget(null);
      invalidateProviders();
      queryClient.invalidateQueries({ queryKey: ['model-provider-logs'] });
    },
    onError: (error) => showToast(error instanceof Error ? error.message : '删除失败，请稍后重试。', 'error'),
  });
  const reloadMutation = useMutation({
    mutationFn: api.reloadModelProviders,
    onSuccess: (result) => showToast(`已发布热加载事件：${result.channel}`, 'success'),
  });
  function requestDeleteProvider(providerCode: string): void {
    const item = providers.find((entry) => entry.provider === providerCode);
    setDeleteTarget({ provider: providerCode, displayName: item?.display_name ?? providerCode });
  }

  function confirmDeleteProvider(): void {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.provider);
  }

  function saveProvider(payload: ModelProviderPayload): void {
    const existing = providers.find((item) => item.provider === payload.provider);
    const notice = formatValidationNotice(validateChatProviderPayload(payload, providerTemplates, existing));
    if (notice) {
      notifyEditor(notice, 'error');
      return;
    }
    setEditorFeedback(null);
    const normalized = normalizeChatProviderPayload(payload);
    saveMutation.mutate({ ...normalized, api_key: normalized.api_key || undefined });
  }

  function chooseTemplate(key: string): void {
    if (!key) {
      if (editing) setEditing(activeTab === 'image' ? applyCustomImageProvider(editing) : applyCustomChatProvider(editing));
      return;
    }
    const next = applyProviderTemplate(providerTemplates, key);
    if (!next) return;
    if (isAddingNew) {
      // 新增模式：模板只作为预填参考，不锁定 provider code，允许用户自定义
      const template = providerTemplates.find((t) => t.key === key);
      setEditing({
        ...next,
        provider: '',
        display_name: template?.label ?? next.display_name,
        image_model: next.image_model ?? readMetaString(next.meta_json, 'image_model') ?? next.chat_model,
        meta_json: {
          ...(next.meta_json ?? {}),
          template: key,
        },
      });
    } else {
      setEditing(next);
    }
  }

  const abnormalProviderCount = providers.filter((item) => ['degraded', 'unhealthy', 'failed', 'down'].includes(item.status)).length;

  return (
    <AdminPageShell className="admin-gateway-page">
      <div className="gateway-workbench-layout grid min-h-0 gap-3 xl:grid-cols-[260px_minmax(0,1fr)]">
        <GatewaySidebar
          activeTab={activeTab}
          onSelect={selectTab}
          chatCount={chatProviders.length}
          imageCount={imageProviders.length}
          providerCount={providers.length}
          abnormalCount={abnormalProviderCount}
          knowledgeConfigured={knowledgeConfigQuery.data?.configured}
        />

        <main className="gateway-workbench-main min-h-0 min-w-0">
          <div className="gateway-workbench-header mb-3">
            <AdminPageHeader
              title="网关中心"
              description={kb.gatewaySubtitle}
              actions={(
                <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                  <button className="flex h-9 items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-800 hover:bg-neutral-50" disabled={checkAllMutation.isPending} onClick={() => checkAllMutation.mutate()}><Activity size={16} />检查全部</button>
                  <button className="flex h-9 items-center justify-center gap-2 rounded-md bg-neutral-950 px-3 text-sm font-medium text-white hover:bg-neutral-800" disabled={reloadMutation.isPending} onClick={() => reloadMutation.mutate()}><RefreshCw size={16} />热加载</button>
                </div>
              )}
            />

            {activeTab !== 'intent' && (
              <div className="mt-4">
                <StatStrip
                  providers={providers}
                  knowledgeConfigured={knowledgeConfigQuery.data?.configured}
                  knowledgeLoading={knowledgeConfigQuery.isLoading}
                />
              </div>
            )}
          </div>

          <div className="gateway-workbench-content min-w-0">
          {activeTab === 'chat' && (
            <section>
              <ProviderToolbar
                title="Chat / 多模态供应商"
                total={chatProviders.length}
                visible={visibleChatProviders.length}
                filters={providerFilters}
                onFiltersChange={setProviderFilters}
                onCheckAll={() => checkAllMutation.mutate()}
                checking={checkAllMutation.isPending}
                onAdd={() => {
                  setIsAddingNew(true);
                  clearChatProviderDraft();
                  setEditorTestResult(null);
                  setEditorFeedback(null);
                  setEditing(applyCustomChatProvider(createEmptyChatProvider()));
                }}
              />
              <ProviderCardGrid
                providers={visibleChatProviders}
                onEdit={(item) => {
                  setIsAddingNew(false);
                  setEditorTestResult(null);
                  setEditorFeedback(null);
                  setEditing(providerToPayload(item));
                }}
                onTest={(provider) => testMutation.mutate(provider)}
                onDefault={(provider) => defaultMutation.mutate(provider)}
                onDelete={requestDeleteProvider}
                busyProvider={testMutation.variables}
              />
            </section>
          )}

          {activeTab === 'image' && (
            <section>
              <ProviderToolbar
                title="图片生成供应商"
                total={imageProviders.length}
                visible={visibleImageProviders.length}
                filters={providerFilters}
                onFiltersChange={setProviderFilters}
                onCheckAll={() => checkAllMutation.mutate()}
                checking={checkAllMutation.isPending}
                onAdd={() => {
                  setIsAddingNew(true);
                  clearChatProviderDraft();
                  setEditorTestResult(null);
                  setEditorFeedback(null);
                  setEditing(applyCustomImageProvider(createEmptyImageProvider()));
                }}
              />
              <ProviderCardGrid
                providers={visibleImageProviders}
                onEdit={(item) => {
                  setIsAddingNew(false);
                  setEditorTestResult(null);
                  setEditorFeedback(null);
                  setEditing(providerToPayload(item));
                }}
                onTest={(provider) => testMutation.mutate(provider)}
                onDefault={(provider) => defaultMutation.mutate(provider)}
                onDelete={requestDeleteProvider}
                busyProvider={testMutation.variables}
              />
            </section>
          )}

          <section className={activeTab === 'knowledge' ? '' : 'hidden'} aria-hidden={activeTab !== 'knowledge'}>
            <GatewayKnowledgeCredentialsPanel
              variant="gateway"
              enabled={activeTab === 'knowledge'}
              onToast={(message, tone) => {
                showToast(message, tone ?? 'success');
                void queryClient.invalidateQueries({ queryKey: ['chatdoc-config'] });
              }}
            />
          </section>

          {activeTab === 'binding' && (
            <CourseBindingPanel chatProviders={chatProviders} imageProviders={imageProviders} onNotice={(message) => showToast(message, 'success')} />
          )}

          {activeTab === 'intent' && (
            <IntentRouterPanel
              enabled={activeTab === 'intent'}
              onNotice={(message, tone) => showToast(message, tone ?? 'success')}
            />
          )}

          {activeTab === 'logs' && (
            <ModelGatewayLogsPanel
              enabled={activeTab === 'logs'}
              providers={providers}
              courseId={courseId}
              onNotice={(message) => showToast(message, 'success')}
            />
          )}
          </div>
        </main>
      </div>

      <ProviderEditor
        value={editing}
        addMode={isAddingNew}
        visible={activeTab === 'chat' || activeTab === 'image'}
        providers={providers}
        templates={activeTab === 'image' ? imageTemplates : chatTemplates}
        templatesLoading={templatesQuery.isPending}
        templatesUsingBundledFallback={templatesUsingBundledFallback}
        onChange={updateChatEditor}
        onSave={saveProvider}
        onTemplate={chooseTemplate}
        testResult={editorTestResult}
        onTest={() => {
          if (!editing) return;
          const existing = providers.find((item) => item.provider === editing.provider);
          const normalized = normalizeChatProviderPayload(editing);
          const notice = formatValidationNotice(validateChatProviderPayload(normalized, providerTemplates, existing));
          if (notice) {
            notifyEditor(notice, 'error');
            return;
          }
          testDraftMutation.mutate({ ...normalized, api_key: normalized.api_key || undefined });
        }}
        editorFeedback={editorFeedback}
        testing={testDraftMutation.isPending}
        saving={saveMutation.isPending}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除供应商"
        tone="danger"
        confirmLabel="确认删除"
        loading={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteProvider}
        description={deleteTarget ? (
          <>
            <p>
              确认删除供应商「{deleteTarget.displayName}」
              <span className="font-mono text-slate-500">（{deleteTarget.provider}）</span>
              ？
            </p>
            <p className="mt-2 text-red-600">
              将永久删除该供应商及其全部调用日志，并解除相关课程绑定。此操作不可恢复。
            </p>
          </>
        ) : null}
      />

      <WorkspaceToast toast={toast} onDismiss={() => setToast(null)} />
    </AdminPageShell>
  );
}

function ProviderToolbar({
  title,
  total,
  visible,
  filters,
  onFiltersChange,
  onCheckAll,
  checking,
  onAdd,
}: {
  title: string;
  total: number;
  visible: number;
  filters: ProviderFilters;
  onFiltersChange: (filters: ProviderFilters) => void;
  onCheckAll: () => void;
  checking: boolean;
  onAdd: () => void;
}): JSX.Element {
  return (
    <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          <div className="mt-0.5 text-xs text-slate-500">显示 {visible} / {total} 个供应商</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary h-9 gap-2" disabled={checking} onClick={onCheckAll}><Activity size={15} />检查全部</button>
          <button className="btn-primary h-9 gap-2" onClick={onAdd}><Plus size={16} />新增供应商</button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_auto]">
        <label className="relative block">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input h-9 w-full pl-9"
            placeholder="搜索供应商、模型或协议"
            value={filters.query}
            onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })}
          />
        </label>
        <select className="input h-9 w-full" value={filters.status} onChange={(event) => onFiltersChange({ ...filters, status: event.target.value })}>
          <option value="all">全部状态</option>
          <option value="healthy">健康</option>
          <option value="standby">待检测</option>
          <option value="degraded">降级</option>
          <option value="unhealthy">异常</option>
          <option value="down">不可用</option>
          <option value="abnormal">仅异常/降级</option>
        </select>
        <button
          className={`btn-secondary h-9 px-3 ${filters.status === 'abnormal' ? 'border-amber-300 bg-amber-50 text-amber-700' : ''}`}
          onClick={() => onFiltersChange({ ...filters, status: filters.status === 'abnormal' ? 'all' : 'abnormal' })}
        >
          <AlertTriangle size={15} />
          仅异常
        </button>
      </div>
    </div>
  );
}

function GatewayHealthAtom({ status }: { status?: string }): JSX.Element {
  const normalized = status ?? 'standby';
  const danger = ['down', 'unhealthy', 'failed', 'degraded'].includes(normalized);
  return (
    <span className={`gateway-atom ${danger ? 'gateway-atom--down' : normalized === 'healthy' || normalized === 'passed' ? 'gateway-atom--healthy' : 'gateway-atom--standby'}`}>
      <i />
      <i />
      <i />
    </span>
  );
}

function providerStatusText(status?: string): string {
  return gatewayStatusLabel(status ?? 'standby');
}

function ProviderCardGrid({
  providers,
  onEdit,
  onTest,
  onDefault,
  onDelete,
  busyProvider,
}: {
  providers: ModelProviderHealth[];
  onEdit: (provider: ModelProviderHealth) => void;
  onTest: (provider: string) => void;
  onDefault: (provider: string) => void;
  onDelete: (provider: string) => void;
  busyProvider?: string;
}): JSX.Element {
  if (providers.length === 0) {
    return <div className="gateway-empty">暂无供应商</div>;
  }

  return (
    <div className="gateway-card-grid gateway-card-grid--list">
      {providers.map((item) => {
        const modelName = item.image_model || readMetaString(item.meta_json, 'image_model') || item.chat_model || item.embedding_model || '-';
        const keyLabel = item.key_configured ? item.key_masked ?? '已配置' : '未配置';
        const websiteUrl = typeof item.meta_json?.website_url === 'string' ? item.meta_json.website_url : '';
        const iconFile = typeof item.meta_json?.icon_file === 'string' ? item.meta_json.icon_file : undefined;
        return (
          <article
            key={item.provider}
            className={`gateway-provider-card gateway-provider-card--compact${item.is_default ? ' gateway-provider-card--active' : ''}`}
          >
            <div className="gateway-provider-card__row gateway-provider-card__row--provider">
              <div className="gateway-provider-card__main">
                <ProviderIconBadge displayName={item.display_name} iconFile={iconFile} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="gateway-provider-card__name">{item.display_name}</div>
                    {item.is_default && (
                      <span className="gateway-provider-card__active-tag">默认</span>
                    )}
                  </div>
                  <div className="gateway-provider-card__meta">
                    {item.provider} · {item.protocol ?? '-'}
                    {websiteUrl ? (
                      <>
                        {' · '}
                        <a className="text-primary hover:underline" href={websiteUrl} target="_blank" rel="noreferrer">
                          官网
                        </a>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="gateway-provider-card__field">
                <span>模型</span>
                <strong title={modelName}>{modelName}</strong>
              </div>

              <div className="gateway-provider-card__field">
                <span>Key</span>
                <strong title={keyLabel}>{keyLabel}</strong>
              </div>

              <div className="gateway-provider-card__status">
                <span>状态</span>
                <GatewayStatusPill status={item.status} />
              </div>

              <div className="gateway-provider-card__hover-actions" aria-label="供应商操作">
                <button type="button" className="gateway-provider-card__icon-btn" title="编辑" onClick={() => onEdit(item)}>
                  <Edit3 size={15} />
                </button>
                <button
                  type="button"
                  className="gateway-provider-card__icon-btn"
                  title="测试连接"
                  disabled={busyProvider === item.provider}
                  onClick={() => onTest(item.provider)}
                >
                  <Activity size={15} />
                </button>
                {!item.is_default && (
                  <button
                    type="button"
                    className="gateway-provider-card__icon-btn"
                    title="设为默认"
                    onClick={() => onDefault(item.provider)}
                  >
                    <Star size={15} />
                  </button>
                )}
                <button
                  type="button"
                  className="gateway-provider-card__icon-btn gateway-provider-card__icon-btn--danger"
                  title="删除"
                  onClick={() => onDelete(item.provider)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ProviderTable({
  providers,
  mode,
  onEdit,
  onTest,
  onDefault,
  onDelete,
  busyProvider,
}: {
  providers: ModelProviderHealth[];
  mode: 'chat' | 'embedding';
  onEdit: (provider: ModelProviderHealth) => void;
  onTest: (provider: string) => void;
  onDefault: (provider: string) => void;
  onDelete: (provider: string) => void;
  busyProvider?: string;
}): JSX.Element {
  const cols = mode === 'embedding'
    ? 'grid-cols-[minmax(190px,1.25fr)_minmax(150px,1fr)_76px_84px_76px_76px_152px]'
    : 'grid-cols-[minmax(190px,1.25fr)_minmax(150px,1fr)_76px_84px_76px_76px_152px]';
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className={`grid ${cols} bg-slate-50 px-4 py-2 text-[11px] font-semibold text-slate-500`}>
        <span>供应商</span><span>模型</span><span>{mode === 'embedding' ? '维度' : '流式'}</span><span>状态</span><span>默认</span><span>启用</span><span className="text-right">操作</span>
      </div>
      {providers.map((item, index) => (
        <div key={item.provider} className={`grid min-h-14 ${cols} items-center border-t border-slate-100 px-4 py-2 text-xs transition hover:bg-blue-50/50 ${index % 2 ? 'bg-slate-50/35' : 'bg-white'}`}>
          <span className="flex min-w-0 items-center gap-2 pr-2">
            <ProviderIconBadge
              displayName={item.display_name}
              iconFile={typeof item.meta_json?.icon_file === 'string' ? item.meta_json.icon_file : undefined}
              size="sm"
            />
            <span className="min-w-0">
              <span className="block truncate font-medium">{item.display_name}</span>
              <span className="block truncate text-[11px] text-slate-500">{item.provider} · {item.protocol ?? '-'}</span>
            </span>
          </span>
          <span className="truncate">{mode === 'embedding' ? item.embedding_model : item.chat_model}</span>
          <span>{mode === 'embedding' ? item.embedding_dimension ?? '-' : <BoolIcon value={item.supports_stream} />}</span>
          <GatewayStatusPill status={item.status} />
          <BoolIcon value={item.is_default} />
          <BoolIcon value={item.is_active} />
          <span className="flex gap-1">
            <button className="btn-secondary h-7 w-7 px-0" title="编辑" onClick={() => onEdit(item)}><Edit3 size={13} /></button>
            <button className="btn-secondary h-7 w-7 px-0" title="测试" disabled={busyProvider === item.provider} onClick={() => onTest(item.provider)}><Activity size={13} /></button>
            <button className="btn-secondary h-7 w-7 px-0" title="设为默认" onClick={() => onDefault(item.provider)}><Star size={13} /></button>
            <button className="btn-secondary h-7 w-7 px-0 text-red-600" title="删除" onClick={() => onDelete(item.provider)}><Trash2 size={13} /></button>
          </span>
        </div>
      ))}
      {providers.length === 0 && <div className="border-t border-slate-100 py-8 text-center text-sm text-slate-500">暂无供应商。</div>}
    </div>
  );
}

function ProviderEditor({
  value,
  addMode = false,
  visible = true,
  providers,
  templates,
  templatesLoading,
  templatesUsingBundledFallback,
  onChange,
  onSave,
  onTemplate,
  onTest,
  testing,
  saving,
  testResult,
  editorFeedback,
}: {
  value: ModelProviderPayload | null;
  addMode?: boolean;
  visible?: boolean;
  providers: ModelProviderHealth[];
  templates: ModelProviderTemplate[];
  templatesLoading: boolean;
  templatesUsingBundledFallback: boolean;
  onChange: (value: ModelProviderPayload | null) => void;
  onSave: (value: ModelProviderPayload) => void;
  onTemplate: (key: string) => void;
  onTest: () => void;
  testing: boolean;
  saving: boolean;
  testResult?: ConnectionTestSnapshot | null;
  editorFeedback?: EditorActionFeedback | null;
}): JSX.Element | null {
  const queryClient = useQueryClient();
  const iconsQuery = useQuery({
    queryKey: ['model-provider-icons'],
    queryFn: () => api.modelProviderIcons(),
    enabled: Boolean(value),
  });
  const uploadIconMutation = useMutation({
    mutationFn: api.uploadModelProviderIcon,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['model-provider-icons'] });
    },
  });
  const deleteIconMutation = useMutation({
    mutationFn: api.deleteModelProviderIcon,
    onSuccess: (_result, filename) => {
      if (value && (value.meta_json?.icon_file === filename)) {
        onChange({ ...value, meta_json: { ...(value.meta_json ?? {}), icon_file: '' } });
      }
      void queryClient.invalidateQueries({ queryKey: ['model-provider-icons'] });
    },
  });
  if (!value || !visible) return null;
  const form = value ?? createEmptyChatProvider();
  const isImageProviderForm = form.provider_type === 'image' || form.provider_type === 'image_generation';
  const existing = providers.find((item) => item.provider === form.provider);
  const isNew = !existing;
  const hasStoredKey = chatProviderHasStoredKey(form, existing);
  const setField = <K extends keyof ModelProviderPayload>(key: K, next: ModelProviderPayload[K]) => onChange({ ...form, [key]: next });
  const meta = form.meta_json ?? {};
  const cost = form.cost_config_json ?? {};
  const setMeta = (next: Record<string, unknown>) => setField('meta_json', { ...meta, ...next });
  const setCost = (next: Record<string, unknown>) => setField('cost_config_json', { ...cost, ...next });
  const websiteUrl = typeof meta.website_url === 'string' ? meta.website_url : '';
  const remarks = typeof meta.remarks === 'string' ? meta.remarks : '';
  const iconFile = typeof meta.icon_file === 'string' ? meta.icon_file : '';
  const selectedTemplate = typeof meta.template === 'string' && meta.template.trim() ? meta.template : '';
  const iconItems = iconsQuery.data?.items ?? [];
  const isCredentialOnly = !addMode && isCredentialOnlyMode(form, templates);
  const fallbackProviders = Array.isArray(meta.fallback_providers) ? meta.fallback_providers.map(String) : [];
  const fallbackEnabled = meta.fallback_enabled !== false;
  const chatFallbackCandidates = providers.filter((item) => item.provider !== form.provider && (item.chat_model || item.provider_type === 'chat' || item.provider_type === 'both'));
  const providerCodePreview = form.provider.trim() || slugifyProviderCode(form.display_name) || (isImageProviderForm ? 'custom_image' : 'custom_chat');
  const moveFallback = (provider: string, direction: -1 | 1): void => {
    const index = fallbackProviders.indexOf(provider);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= fallbackProviders.length) return;
    const next = [...fallbackProviders];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setMeta({ fallback_providers: next, fallback_mode: 'ordered' });
  };
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/20 backdrop-blur-[1px]">
      <button className="absolute inset-0 cursor-default" aria-label="关闭配置面板" onClick={() => onChange(null)} />
      <aside className="relative z-10 flex h-full w-full max-w-3xl flex-col border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">供应商配置</h2>
            <p className="mt-1 text-sm text-slate-500">
              {addMode
                ? '选择预置模板后会自动填入参数，所有字段均支持修改。填写完毕即可保存为新供应商。'
                : isCredentialOnly
                  ? kb.providerCredentialHint
                  : kb.chatCustomAddHint}
            </p>
          </div>
          <button className="btn-secondary h-8 px-3" onClick={() => onChange(null)}>关闭</button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          <label className="mb-4 block text-xs text-slate-500">
            预置模板
            <select
              className="input mt-1 w-full"
              value={selectedTemplate}
              disabled={templatesLoading || (!addMode && !isNew)}
              onChange={(event) => onTemplate(event.target.value)}
            >
              <option value="">
                {templatesLoading ? '加载模板中…' : templates.length === 0 ? '暂无预置模板' : addMode ? '自定义 OpenAI 兼容（手动填写）' : '编辑模式（不可更换模板）'}
              </option>
              {templates.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
            {templatesUsingBundledFallback && (
              <p className="mt-1 text-[11px] text-amber-700">
                未能从后端拉取最新模板，已使用内置副本。请确认后端已启动（默认端口 8001）后刷新页面。
              </p>
            )}
          </label>

          <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <ProviderIconPicker
              displayName={form.display_name}
              iconFile={iconFile}
              icons={iconItems}
              uploading={uploadIconMutation.isPending}
              deleting={deleteIconMutation.isPending}
              onIconChange={(filename) => setMeta({ icon_file: filename })}
              onUpload={async (file) => {
                const result = await uploadIconMutation.mutateAsync(file);
                return result.filename;
              }}
              onDelete={async (filename) => { await deleteIconMutation.mutateAsync(filename); }}
            />
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-xs text-slate-500">
                供应商名称{!isCredentialOnly ? ' *' : ''}
                <input
                  className="input mt-1 w-full"
                  value={form.display_name}
                  readOnly={isCredentialOnly}
                  onChange={(event) => {
                    const display_name = event.target.value;
                    onChange({
                      ...form,
                      display_name,
                      provider: form.provider.trim() || (isNew ? slugifyProviderCode(display_name) : form.provider),
                    });
                  }}
                  placeholder="例如：Claude 官方"
                />
              </label>
              {isCredentialOnly ? (
                <label className="md:col-span-2 text-xs text-slate-500">
                  API 请求地址
                  <input className="input mt-1 w-full bg-slate-50 font-mono text-xs" value={form.base_url ?? ''} readOnly tabIndex={-1} />
                </label>
              ) : (
                <label className="text-xs text-slate-500">
                  备注
                  <input
                    className="input mt-1 w-full"
                    value={remarks}
                    onChange={(event) => setMeta({ remarks: event.target.value })}
                    placeholder="例如：公司专用账号"
                  />
                </label>
              )}
              {!isCredentialOnly && (
                <label className="md:col-span-2 text-xs text-slate-500">
                  官网链接
                  <input
                    className="input mt-1 w-full"
                    placeholder="https://example.com（可选）"
                    value={websiteUrl}
                    onChange={(event) => setMeta({ website_url: event.target.value })}
                  />
                </label>
              )}
            </div>
            {!isCredentialOnly && websiteUrl && (
              <p className="mt-2 text-xs text-slate-500">
                协议说明与错误码以
                <a className="mx-1 text-primary hover:underline" href={websiteUrl} target="_blank" rel="noreferrer">官方文档</a>
                为准；{kb.chatEditorTroubleshootHint}
              </p>
            )}
          </div>

          {isCredentialOnly && (
            <>
              <ProviderTemplatePresetFields
                form={form}
                existing={existing}
                websiteUrl={websiteUrl}
                apiKeyRequired={isNew || !hasStoredKey}
                hasStoredKey={hasStoredKey}
                onApiKey={(api_key) => setField('api_key', api_key)}
              />
              <div className="mb-4 flex flex-wrap gap-4 text-sm">
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={Boolean(form.is_active)} onChange={(event) => setField('is_active', event.target.checked)} />启用</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={Boolean(form.is_default)} onChange={(event) => setField('is_default', event.target.checked)} />设为默认</label>
              </div>
            </>
          )}

          {!isCredentialOnly && (
          <>
          <CustomChatProviderFields
            form={form}
            existing={existing}
            capability={isImageProviderForm ? 'image' : 'chat'}
            onField={setField}
            onMeta={setMeta}
          />

          <details className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">高级参数</summary>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <label className="text-xs text-slate-500">
                接入标识
                <input
                  className="input mt-1 w-full font-mono text-xs"
                  value={form.provider}
                  onChange={(event) => setField('provider', event.target.value)}
                  placeholder={providerCodePreview}
                />
                <span className="mt-1 block text-[11px] text-slate-500">留空将按供应商名称自动生成：{providerCodePreview}</span>
              </label>
              <label className="text-xs text-slate-500">
                优先级
                <input className="input mt-1 w-full" type="number" value={form.priority ?? 10} onChange={(event) => setField('priority', Number(event.target.value) || 10)} />
              </label>
              <label className="text-xs text-slate-500">
                RPS 限制
                <input className="input mt-1 w-full" type="number" value={form.rate_limit_rps ?? ''} onChange={(event) => setField('rate_limit_rps', event.target.value ? Number(event.target.value) : null)} />
              </label>
              <label className="text-xs text-slate-500">
                每日 Token 上限
                <input className="input mt-1 w-full" type="number" value={form.daily_limit ?? ''} onChange={(event) => setField('daily_limit', event.target.value ? Number(event.target.value) : null)} />
              </label>
              <div className="lg:col-span-2 grid grid-cols-3 gap-2 text-sm">
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={Boolean(form.supports_stream)} onChange={(event) => setField('supports_stream', event.target.checked)} />流式</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={Boolean(form.supports_json_mode)} onChange={(event) => setField('supports_json_mode', event.target.checked)} />JSON</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={Boolean(form.supports_tool_call)} onChange={(event) => setField('supports_tool_call', event.target.checked)} />Tool</label>
              </div>
            </div>
          </details>

          <details className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">成本配置</summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="text-xs text-slate-500">币种<input className="input mt-1 w-full" value={String(cost.currency ?? 'CNY')} onChange={(event) => setCost({ currency: event.target.value })} /></label>
              <label className="text-xs text-slate-500">每日成本上限<input className="input mt-1 w-full" type="number" value={String(cost.daily_cost_limit ?? '')} onChange={(event) => setCost({ daily_cost_limit: event.target.value ? Number(event.target.value) : undefined })} /></label>
              {isImageProviderForm ? (
                <label className="text-xs text-slate-500">单张图片<input className="input mt-1 w-full" type="number" step="0.0001" value={String(cost.image_unit_price ?? '')} onChange={(event) => setCost({ image_unit_price: event.target.value ? Number(event.target.value) : undefined })} /></label>
              ) : (
                <>
                  <label className="text-xs text-slate-500">输入/1K<input className="input mt-1 w-full" type="number" step="0.0001" value={String(cost.input_token_price ?? '')} onChange={(event) => setCost({ input_token_price: event.target.value ? Number(event.target.value) : undefined })} /></label>
                  <label className="text-xs text-slate-500">输出/1K<input className="input mt-1 w-full" type="number" step="0.0001" value={String(cost.output_token_price ?? '')} onChange={(event) => setCost({ output_token_price: event.target.value ? Number(event.target.value) : undefined })} /></label>
                </>
              )}
            </div>
          </details>

          {!isImageProviderForm && (
          <details className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">回退策略</summary>
            <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_280px]">
              <div>
                <label className="mb-3 inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={fallbackEnabled} onChange={(event) => setMeta({ fallback_enabled: event.target.checked, fallback_mode: 'ordered' })} />
                  启用回退链
                </label>
                <div className="grid max-h-48 gap-2 overflow-auto text-sm">
                  {chatFallbackCandidates.map((item) => {
                    const checked = fallbackProviders.includes(item.provider);
                    const order = fallbackProviders.indexOf(item.provider);
                    return (
                      <div key={item.provider} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${checked ? 'border-blue-200 bg-blue-50' : 'border-slate-200'}`}>
                        <label className="flex min-w-0 flex-1 items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              const next = event.target.checked
                                ? [...fallbackProviders, item.provider]
                                : fallbackProviders.filter((provider) => provider !== item.provider);
                              setMeta({ fallback_providers: next, fallback_mode: 'ordered' });
                            }}
                          />
                          <span className="truncate">{checked ? `${order + 1}. ` : ''}{item.display_name}</span>
                        </label>
                        {checked && (
                          <span className="flex gap-1">
                            <button className="btn-secondary h-7 w-7 px-0" title="向上移动" disabled={order <= 0} onClick={() => moveFallback(item.provider, -1)}><ArrowUp size={13} /></button>
                            <button className="btn-secondary h-7 w-7 px-0" title="向下移动" disabled={order === fallbackProviders.length - 1} onClick={() => moveFallback(item.provider, 1)}><ArrowDown size={13} /></button>
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {chatFallbackCandidates.length === 0 && <div className="text-xs text-slate-500">暂无可选备用 Chat 供应商。</div>}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                <div className="font-semibold text-slate-900">当前顺序</div>
                <div className="mt-2 space-y-1">
                  {fallbackProviders.length > 0
                    ? fallbackProviders.map((provider, index) => <div key={provider}>{index + 1}. {providers.find((item) => item.provider === provider)?.display_name ?? provider}</div>)
                    : <div>未配置时按全局优先级回退。</div>}
                </div>
                <label className="mt-3 inline-flex items-center gap-2">
                  <input type="checkbox" checked={meta.skip_unhealthy !== false} onChange={(event) => setMeta({ skip_unhealthy: event.target.checked })} />
                  跳过异常或熔断供应商
                </label>
              </div>
            </div>
          </details>
          )}
          </>
          )}

        </div>

        <div className="border-t border-slate-200 px-5 py-4">
          <EditorActionFeedbackPanel feedback={editorFeedback} />
          <ConnectionTestResultPanel loading={testing} result={testResult} />
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" type="button" onClick={() => onChange(null)}>取消</button>
            <button
              className="btn-secondary gap-2"
              type="button"
              disabled={testing}
              title="使用当前表单中的配置测试连通性（无需先保存）"
              onClick={onTest}
            >
              <Activity size={16} />
              {testing ? '测试中…' : '测试连接'}
            </button>
            <button className="btn-primary gap-2" type="button" disabled={saving} onClick={() => onSave(value)}><Save size={16} />保存配置</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
