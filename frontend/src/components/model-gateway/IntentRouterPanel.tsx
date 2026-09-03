import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, Dispatch, ReactNode, SetStateAction } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  Download,
  FileUp,
  ListChecks,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '../../api/endpoints';
import { getApiErrorMessage } from '../../api/client';
import type {
  IntentDefinition,
  IntentRiskLevel,
  IntentRouterConfigView,
  IntentRouterEvalReport,
  IntentRouterRegistryConfig,
  IntentRouterValidationResult,
} from '../../types';
import { ErrorState, LoadingState } from '../shared/StateBlock';

type IntentRouterPanelProps = {
  enabled: boolean;
  onNotice?: (message: string, tone?: 'success' | 'error' | 'info') => void;
};

type EditorMode = 'visual' | 'yaml';

type IntentRouterPayload = {
  yaml_text?: string;
  config?: IntentRouterRegistryConfig;
};

type ActionButtonProps = {
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
  primary?: boolean;
  onClick: () => void;
};

const INTENT_QUERY_KEY = ['intent-router-config'];
const MODE_TABS: Array<[EditorMode, string, LucideIcon]> = [
  ['visual', '可视化', SlidersHorizontal],
  ['yaml', 'YAML 原文', Code2],
];

const RISK_LABEL: Record<IntentRiskLevel, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
};

const RISK_STYLE: Record<IntentRiskLevel, string> = {
  low: 'border-neutral-200 bg-white text-neutral-700',
  medium: 'border-neutral-300 bg-neutral-100 text-neutral-800',
  high: 'border-neutral-900 bg-neutral-950 text-white',
};

function cloneConfig(config: IntentRouterRegistryConfig): IntentRouterRegistryConfig {
  return structuredClone(config);
}

function splitLines(value: string): string[] {
  return value.split('\n').map((item) => item.trim()).filter(Boolean);
}

function joinLines(value?: string[]): string {
  return (value ?? []).join('\n');
}

function joinGroups(value?: string[][]): string {
  return (value ?? []).map((group) => group.join(' + ')).join('\n');
}

function splitGroups(value: string): string[][] {
  return value.split('\n')
    .map((line) => line.split('+').map((item) => item.trim()).filter(Boolean))
    .filter((group) => group.length > 0);
}

function formatPercent(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${Math.round(value * 1000) / 10}%`;
}

function formatThreshold(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '使用全局值';
  return value.toFixed(2);
}

function formatWarmupStatus(status?: string | null): string {
  const normalized = status?.trim().toLowerCase();
  if (!normalized) return '未知';
  if (normalized === 'ready' || normalized === 'ok' || normalized === 'passed') return '就绪';
  if (normalized === 'warming' || normalized === 'warming_up' || normalized === 'loading') return '预热中';
  if (normalized === 'failed' || normalized === 'error') return '失败';
  return status ?? '未知';
}

function formatSemanticProvider(provider?: string | null): string {
  if (!provider) return '默认语义召回';
  if (provider === 'semantic-router') return 'semantic-router 语义召回';
  if (provider === 'small_model') return '轻量本地相似度';
  return provider;
}

function payloadFor(mode: EditorMode, yamlText: string, config: IntentRouterRegistryConfig | null): IntentRouterPayload {
  return mode === 'yaml' ? { yaml_text: yamlText } : { config: config ?? undefined };
}

function updateViewState(
  view: IntentRouterConfigView,
  setYamlText: (value: string) => void,
  setConfigDraft: (value: IntentRouterRegistryConfig | null) => void,
  setSelectedIntent: Dispatch<SetStateAction<string | null>>,
): void {
  setYamlText(view.yaml_text);
  setConfigDraft(view.config ?? null);
  const firstIntent = view.config?.intents?.[0]?.name ?? null;
  setSelectedIntent((current) => (current && view.config?.intents.some((item) => item.name === current) ? current : firstIntent));
}

function ActionButton({ icon: Icon, label, disabled, primary, onClick }: ActionButtonProps): JSX.Element {
  return (
    <button
      type="button"
      className={`flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${
        primary
          ? 'bg-neutral-950 text-white hover:bg-neutral-800'
          : 'border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50'
      }`}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={15} />
      {label}
    </button>
  );
}

function RiskBadge({ risk }: { risk: IntentRiskLevel }): JSX.Element {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${RISK_STYLE[risk]}`}>
      {RISK_LABEL[risk]}
    </span>
  );
}

function MetricCell({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }): JSX.Element {
  return (
    <div className="border-r border-neutral-200 px-4 py-3 last:border-r-0">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-neutral-950">{value}</div>
      {detail && <div className="mt-1 truncate text-xs text-neutral-500">{detail}</div>}
    </div>
  );
}

function FieldLabel({
  label,
  children,
  wide,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}): JSX.Element {
  return (
    <label className={`${wide ? 'xl:col-span-2' : ''} text-xs font-medium text-neutral-500`}>
      {label}
      {children}
    </label>
  );
}

function DashboardTrend({
  intents,
  evaluation,
}: {
  intents: IntentDefinition[];
  evaluation?: IntentRouterEvalReport | null;
}): JSX.Element {
  const points = intents.length > 0 ? intents : [{ priority: 20 }, { priority: 40 }, { priority: 70 }, { priority: 50 }] as IntentDefinition[];
  const areaA = points.map((item, index) => {
    const x = 16 + (index * 760) / Math.max(1, points.length - 1);
    const y = 120 - Math.min(92, Math.max(18, (item.priority % 80) + 20));
    return `${x},${y}`;
  }).join(' ');
  const areaB = points.map((item, index) => {
    const x = 16 + (index * 760) / Math.max(1, points.length - 1);
    const y = 146 - Math.min(70, Math.max(14, ((item.utterances?.length ?? 1) * 12) + (item.enabled ? 8 : 0)));
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-neutral-950">路由表现</div>
          <div className="mt-0.5 text-xs text-neutral-500">意图优先级、样本覆盖率与最近一次评测</div>
        </div>
        <span className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600">
          {evaluation ? `准确率 ${formatPercent(evaluation.accuracy)}` : '暂无评测'}
        </span>
      </div>
      <svg viewBox="0 0 800 190" className="h-56 w-full bg-white" role="img" aria-label="意图路由趋势">
        <defs>
          <linearGradient id="intentAreaA" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#171717" stopOpacity="0.52" />
            <stop offset="100%" stopColor="#171717" stopOpacity="0.08" />
          </linearGradient>
          <linearGradient id="intentAreaB" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#737373" stopOpacity="0.48" />
            <stop offset="100%" stopColor="#737373" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        {[32, 72, 112, 152].map((y) => (
          <line key={y} x1="16" x2="780" y1={y} y2={y} stroke="#e5e5e5" strokeWidth="1" />
        ))}
        <polygon points={`16,168 ${areaA} 780,168`} fill="url(#intentAreaA)" />
        <polyline points={areaA} fill="none" stroke="#171717" strokeWidth="1.5" />
        <polygon points={`16,168 ${areaB} 780,168`} fill="url(#intentAreaB)" />
        <polyline points={areaB} fill="none" stroke="#525252" strokeWidth="1.2" />
        <line x1="16" x2="780" y1="168" y2="168" stroke="#d4d4d4" strokeWidth="1" />
        {['注册表', '规则', '语义召回', '模型判别', '发布'].map((label, index) => (
          <text key={label} x={48 + index * 160} y="182" fill="#737373" fontSize="11">{label}</text>
        ))}
      </svg>
    </div>
  );
}

function ValidationPanel({ validation }: { validation?: IntentRouterValidationResult | null }): JSX.Element {
  if (!validation) {
    return <div className="rounded-lg border border-neutral-200 bg-white px-3 py-3 text-sm text-neutral-500">暂无校验结果。</div>;
  }
  if (validation.ok) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white px-3 py-3 text-sm text-neutral-700">
        <div className="flex items-center gap-2 font-medium text-neutral-950"><CheckCircle2 size={16} />校验通过</div>
        <p className="mt-1 text-xs text-neutral-500">当前配置符合注册表结构规范（Registry schema）。</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-neutral-900 bg-neutral-950 px-3 py-3 text-sm text-white">
      <div className="flex items-center gap-2 font-medium"><AlertTriangle size={16} />校验未通过</div>
      <div className="mt-2 grid gap-2">
        {validation.errors.map((item, index) => (
          <div key={`${item.path}-${index}`} className="rounded-md border border-white/15 bg-white/10 px-2 py-1.5">
            <div className="font-mono text-[11px] text-white/70">{item.path}</div>
            <div className="mt-0.5 text-xs">{item.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EvaluationPanel({ evaluation }: { evaluation?: IntentRouterEvalReport | null }): JSX.Element {
  if (!evaluation) {
    return <div className="rounded-lg border border-neutral-200 bg-white px-3 py-3 text-sm text-neutral-500">暂无评测快照。</div>;
  }
  const rows = Object.entries(evaluation.by_intent ?? {}).filter(([, value]) => value.support > 0);
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div className="grid grid-cols-2 border-b border-neutral-200">
        <MetricCell label="准确率" value={formatPercent(evaluation.accuracy)} />
        <MetricCell label="澄清率" value={formatPercent(evaluation.clarification_rate)} />
      </div>
      <div className="max-h-60 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">意图</th>
              <th className="px-3 py-2 font-medium">精确率 P</th>
              <th className="px-3 py-2 font-medium">召回率 R</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([intent, item]) => (
              <tr key={intent} className="border-t border-neutral-200">
                <td className="max-w-[130px] truncate px-3 py-2 font-mono text-neutral-700">{intent}</td>
                <td className="px-3 py-2">{formatPercent(item.precision)}</td>
                <td className="px-3 py-2">{formatPercent(item.recall)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function IntentRouterPanel({ enabled, onNotice }: IntentRouterPanelProps): JSX.Element {
  const queryClient = useQueryClient();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<EditorMode>('visual');
  const [yamlText, setYamlText] = useState('');
  const [configDraft, setConfigDraft] = useState<IntentRouterRegistryConfig | null>(null);
  const [selectedIntentName, setSelectedIntentName] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<IntentRouterValidationResult | null>(null);
  const [evaluationResult, setEvaluationResult] = useState<IntentRouterEvalReport | null>(null);
  const [intentQuery, setIntentQuery] = useState('');

  const configQuery = useQuery({
    queryKey: INTENT_QUERY_KEY,
    queryFn: api.intentRouterConfig,
    enabled,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!configQuery.data) return;
    updateViewState(configQuery.data, setYamlText, setConfigDraft, setSelectedIntentName);
    setValidationResult(configQuery.data.validation);
    setEvaluationResult(configQuery.data.evaluation ?? null);
  }, [configQuery.data]);

  const filteredIntents = useMemo(() => {
    const query = intentQuery.trim().toLowerCase();
    const intents = configDraft?.intents ?? [];
    if (!query) return intents;
    return intents.filter((item) => [
      item.display_name,
      item.name,
      item.response_route,
      item.description,
      item.risk_level,
    ].some((value) => String(value).toLowerCase().includes(query)));
  }, [configDraft?.intents, intentQuery]);

  const selectedIntent = useMemo(
    () => configDraft?.intents.find((item) => item.name === selectedIntentName) ?? configDraft?.intents[0] ?? null,
    [configDraft, selectedIntentName],
  );

  function notify(message: string, tone: 'success' | 'error' | 'info' = 'success'): void {
    onNotice?.(message, tone);
  }

  function applyConfigUpdate(updater: (draft: IntentRouterRegistryConfig) => void): void {
    setConfigDraft((current) => {
      if (!current) return current;
      const next = cloneConfig(current);
      updater(next);
      return next;
    });
  }

  function updateIntent(updater: (intent: IntentDefinition) => void): void {
    if (!selectedIntentName) return;
    applyConfigUpdate((draft) => {
      const intent = draft.intents.find((item) => item.name === selectedIntentName);
      if (intent) updater(intent);
    });
  }

  const saveMutation = useMutation({
    mutationFn: () => api.saveIntentRouterConfig(payloadFor(mode, yamlText, configDraft)),
    onSuccess: (view) => {
      queryClient.setQueryData(INTENT_QUERY_KEY, view);
      updateViewState(view, setYamlText, setConfigDraft, setSelectedIntentName);
      notify('意图路由草稿已保存。');
    },
    onError: (error) => notify(getApiErrorMessage(error, '保存草稿失败。'), 'error'),
  });

  const validateMutation = useMutation({
    mutationFn: () => api.validateIntentRouterConfig(payloadFor(mode, yamlText, configDraft)),
    onSuccess: (result) => {
      setValidationResult(result);
      notify(result.ok ? '配置校验通过。' : '配置校验未通过。', result.ok ? 'success' : 'info');
    },
    onError: (error) => notify(getApiErrorMessage(error, '校验失败。'), 'error'),
  });

  const evaluateMutation = useMutation({
    mutationFn: () => api.evaluateIntentRouterConfig(payloadFor(mode, yamlText, configDraft)),
    onSuccess: (result) => {
      setEvaluationResult(result);
      notify(`评测完成：准确率 ${formatPercent(result.accuracy)}。`);
    },
    onError: (error) => notify(getApiErrorMessage(error, '评测失败。'), 'error'),
  });

  const reloadMutation = useMutation({
    mutationFn: api.reloadIntentRouterConfig,
    onSuccess: (view) => {
      queryClient.setQueryData(INTENT_QUERY_KEY, view);
      updateViewState(view, setYamlText, setConfigDraft, setSelectedIntentName);
      setValidationResult(view.validation);
      setEvaluationResult(view.evaluation ?? null);
      notify('已从文件重新加载配置。');
    },
    onError: (error) => notify(getApiErrorMessage(error, '从文件重新加载失败。'), 'error'),
  });

  const publishMutation = useMutation({
    mutationFn: () => api.publishIntentRouterConfig(payloadFor(mode, yamlText, configDraft)),
    onSuccess: (view) => {
      queryClient.setQueryData(INTENT_QUERY_KEY, view);
      updateViewState(view, setYamlText, setConfigDraft, setSelectedIntentName);
      setValidationResult(view.validation);
      setEvaluationResult(view.evaluation ?? null);
      notify('意图路由注册表已发布生效。');
    },
    onError: (error) => notify(getApiErrorMessage(error, '发布失败。'), 'error'),
  });

  const rollbackMutation = useMutation({
    mutationFn: api.rollbackIntentRouterConfig,
    onSuccess: (view) => {
      queryClient.setQueryData(INTENT_QUERY_KEY, view);
      updateViewState(view, setYamlText, setConfigDraft, setSelectedIntentName);
      setValidationResult(view.validation);
      setEvaluationResult(view.evaluation ?? null);
      notify('已回滚到上一版本。');
    },
    onError: (error) => notify(getApiErrorMessage(error, '回滚失败。'), 'error'),
  });

  const exportMutation = useMutation({
    mutationFn: api.exportIntentRouterConfig,
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'intent_registry.yaml';
      link.click();
      URL.revokeObjectURL(url);
      notify('已导出意图路由 YAML。');
    },
    onError: (error) => notify(getApiErrorMessage(error, '导出失败。'), 'error'),
  });

  const importMutation = useMutation({
    mutationFn: api.importIntentRouterConfig,
    onSuccess: (view) => {
      queryClient.setQueryData(INTENT_QUERY_KEY, view);
      updateViewState(view, setYamlText, setConfigDraft, setSelectedIntentName);
      setValidationResult(view.validation);
      notify('YAML 已导入为草稿。');
    },
    onError: (error) => notify(getApiErrorMessage(error, '导入失败。'), 'error'),
  });

  function handleImport(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) importMutation.mutate(file);
  }

  if (configQuery.isLoading) return <LoadingState label="正在加载意图路由配置..." />;
  if (configQuery.isError) return <ErrorState label={getApiErrorMessage(configQuery.error, '意图路由配置加载失败。')} />;

  const view = configQuery.data;
  const busy = saveMutation.isPending || validateMutation.isPending || evaluateMutation.isPending
    || reloadMutation.isPending || publishMutation.isPending || rollbackMutation.isPending
    || exportMutation.isPending || importMutation.isPending;
  const intentCount = configDraft?.intents.length ?? 0;
  const enabledCount = configDraft?.intents.filter((item) => item.enabled).length ?? 0;

  return (
    <section>
      <input ref={importInputRef} type="file" accept=".yaml,.yml,text/yaml,application/x-yaml" className="hidden" onChange={handleImport} />

      <div className="grid gap-4">
        <header className="rounded-lg border border-neutral-200 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-200 px-4 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-neutral-950" />
                <h2 className="text-lg font-semibold tracking-tight text-neutral-950">意图路由注册表</h2>
              </div>
              <p className="mt-1 max-w-5xl truncate text-xs text-neutral-500">
                当前路径：<span className="font-mono text-neutral-700">{view?.active_path}</span>
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <ActionButton icon={RefreshCw} label="重载" disabled={busy} onClick={() => reloadMutation.mutate()} />
              <ActionButton icon={ListChecks} label="校验" disabled={busy} onClick={() => validateMutation.mutate()} />
              <ActionButton icon={Play} label="评测" disabled={busy} onClick={() => evaluateMutation.mutate()} />
              <ActionButton icon={Save} label="保存草稿" disabled={busy} onClick={() => saveMutation.mutate()} />
              <ActionButton icon={ShieldCheck} label="发布" primary disabled={busy} onClick={() => publishMutation.mutate()} />
              <ActionButton icon={RotateCcw} label="回滚" disabled={busy} onClick={() => rollbackMutation.mutate()} />
              <ActionButton icon={Download} label="导出" disabled={busy} onClick={() => exportMutation.mutate()} />
              <ActionButton icon={FileUp} label="导入" disabled={busy} onClick={() => importInputRef.current?.click()} />
            </div>
          </div>
          <div className="grid border-b border-neutral-200 xl:grid-cols-5">
            <MetricCell label="当前版本" value={<span className="font-mono text-base">{view?.active_version}</span>} detail={`配置版本：${configDraft?.version ?? '默认注册表'}`} />
            <MetricCell label="草稿状态" value={view?.has_draft ? '有草稿' : '干净'} detail={view?.draft_version ?? '无草稿'} />
            <MetricCell label="校验状态" value={validationResult?.ok ? '通过' : '需检查'} detail={`${validationResult?.errors.length ?? 0} 个问题`} />
            <MetricCell label="预热状态" value={formatWarmupStatus(view?.embedding_warmup_status)} detail={formatSemanticProvider(configDraft?.global.semantic_provider)} />
            <MetricCell label="意图数" value={`${enabledCount}/${intentCount}`} detail="已启用 / 总数" />
          </div>
          <div className="p-4">
            <DashboardTrend intents={configDraft?.intents ?? []} evaluation={evaluationResult} />
          </div>
        </header>

        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-100 p-1">
            {MODE_TABS.map(([key, label, Icon]) => (
              <button
                key={String(key)}
                type="button"
                className={`flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${mode === key ? 'bg-white text-neutral-950 shadow-sm' : 'text-neutral-500 hover:text-neutral-950'}`}
                onClick={() => setMode(key as EditorMode)}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
          <label className="relative block w-[320px]">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              className="h-9 w-full rounded-md border border-neutral-200 bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-neutral-200"
              placeholder="搜索意图、路由 route 或风险"
              value={intentQuery}
              onChange={(event) => setIntentQuery(event.target.value)}
            />
          </label>
        </div>

        {mode === 'visual' ? (
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_430px]">
            <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-50 text-neutral-500">
                  <tr>
                    <th className="w-10 px-4 py-3 font-medium">
                      <input type="checkbox" aria-label="选择全部意图" />
                    </th>
                    <th className="px-3 py-3 font-medium">意图</th>
                    <th className="px-3 py-3 font-medium">路由</th>
                    <th className="px-3 py-3 font-medium">风险</th>
                    <th className="px-3 py-3 font-medium">阈值</th>
                    <th className="px-3 py-3 font-medium">状态</th>
                    <th className="px-3 py-3 text-right font-medium">优先级</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIntents.map((intent) => {
                    const active = selectedIntent?.name === intent.name;
                    return (
                      <tr
                        key={intent.name}
                        className={`cursor-pointer border-t border-neutral-200 ${active ? 'bg-neutral-100' : 'hover:bg-neutral-50'}`}
                        onClick={() => setSelectedIntentName(intent.name)}
                      >
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={active} readOnly aria-label={`选择 ${intent.display_name}`} />
                        </td>
                        <td className="min-w-[220px] px-3 py-3">
                          <div className="font-medium text-neutral-950">{intent.display_name}</div>
                          <div className="mt-0.5 font-mono text-xs text-neutral-500">{intent.name}</div>
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-neutral-700">{intent.response_route}</td>
                        <td className="px-3 py-3"><RiskBadge risk={intent.risk_level} /></td>
                        <td className="px-3 py-3 text-neutral-600">{formatThreshold(intent.execution_threshold)}</td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-xs text-neutral-700">
                            <span className={`h-1.5 w-1.5 rounded-full ${intent.enabled ? 'bg-neutral-950' : 'bg-neutral-300'}`} />
                            {intent.enabled ? '已启用' : '已停用'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs text-neutral-600">{intent.priority}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredIntents.length === 0 && (
                <div className="border-t border-neutral-200 px-4 py-12 text-center text-sm text-neutral-500">没有匹配的意图。</div>
              )}
            </div>

            <aside className="grid content-start gap-4">
              {selectedIntent && (
                <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
                  <div className="border-b border-neutral-200 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-neutral-950">{selectedIntent.display_name}</div>
                        <div className="mt-0.5 truncate font-mono text-xs text-neutral-500">{selectedIntent.name}</div>
                      </div>
                      <RiskBadge risk={selectedIntent.risk_level} />
                    </div>
                  </div>

                  <div className="grid gap-4 px-4 py-4">
                    <div className="grid gap-3 xl:grid-cols-2">
                      <FieldLabel label="显示名">
                        <input className="input mt-1 w-full" value={selectedIntent.display_name} onChange={(event) => updateIntent((intent) => { intent.display_name = event.target.value; })} />
                      </FieldLabel>
                      <FieldLabel label="优先级">
                        <input className="input mt-1 w-full" type="number" value={selectedIntent.priority} onChange={(event) => updateIntent((intent) => { intent.priority = Number(event.target.value); })} />
                      </FieldLabel>
                      <FieldLabel label="响应路由 route" wide>
                        <input className="input mt-1 w-full font-mono text-xs" value={selectedIntent.response_route} onChange={(event) => updateIntent((intent) => { intent.response_route = event.target.value; })} />
                      </FieldLabel>
                      <FieldLabel label="风险等级">
                        <select className="input mt-1 w-full" value={selectedIntent.risk_level} onChange={(event) => updateIntent((intent) => { intent.risk_level = event.target.value as IntentDefinition['risk_level']; })}>
                          <option value="low">低风险</option>
                          <option value="medium">中风险</option>
                          <option value="high">高风险</option>
                        </select>
                      </FieldLabel>
                      <label className="mt-6 inline-flex h-10 items-center gap-2 rounded-md border border-neutral-200 px-3 text-sm text-neutral-700">
                        <input type="checkbox" checked={selectedIntent.enabled} onChange={(event) => updateIntent((intent) => { intent.enabled = event.target.checked; })} />
                        启用意图
                      </label>
                      <FieldLabel label="说明" wide>
                        <textarea className="input mt-1 min-h-20 w-full py-2" value={selectedIntent.description} onChange={(event) => updateIntent((intent) => { intent.description = event.target.value; })} />
                      </FieldLabel>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-3">
                      <FieldLabel label={`执行阈值 · ${formatThreshold(selectedIntent.execution_threshold)}`}>
                        <input className="input mt-1 w-full" type="number" min="0" max="1" step="0.01" value={selectedIntent.execution_threshold ?? ''} onChange={(event) => updateIntent((intent) => { intent.execution_threshold = event.target.value ? Number(event.target.value) : null; })} />
                      </FieldLabel>
                      <FieldLabel label={`澄清阈值 · ${formatThreshold(selectedIntent.clarification_threshold)}`}>
                        <input className="input mt-1 w-full" type="number" min="0" max="1" step="0.01" value={selectedIntent.clarification_threshold ?? ''} onChange={(event) => updateIntent((intent) => { intent.clarification_threshold = event.target.value ? Number(event.target.value) : null; })} />
                      </FieldLabel>
                      <FieldLabel label={`分差阈值 · ${formatThreshold(selectedIntent.margin_threshold)}`}>
                        <input className="input mt-1 w-full" type="number" min="0" max="1" step="0.01" value={selectedIntent.margin_threshold ?? ''} onChange={(event) => updateIntent((intent) => { intent.margin_threshold = event.target.value ? Number(event.target.value) : null; })} />
                      </FieldLabel>
                    </div>

                    <div className="grid gap-3">
                      <FieldLabel label={`正例样本 utterances · ${selectedIntent.utterances.length}`}>
                        <textarea className="input mt-1 min-h-28 w-full py-2 font-mono text-xs leading-relaxed" value={joinLines(selectedIntent.utterances)} onChange={(event) => updateIntent((intent) => { intent.utterances = splitLines(event.target.value); })} />
                      </FieldLabel>
                      <FieldLabel label={`负例样本 negative_utterances · ${selectedIntent.negative_utterances.length}`}>
                        <textarea className="input mt-1 min-h-24 w-full py-2 font-mono text-xs leading-relaxed" value={joinLines(selectedIntent.negative_utterances)} onChange={(event) => updateIntent((intent) => { intent.negative_utterances = splitLines(event.target.value); })} />
                      </FieldLabel>
                      <FieldLabel label="精确匹配规则 exact_any">
                        <textarea className="input mt-1 min-h-20 w-full py-2 font-mono text-xs leading-relaxed" value={joinLines(selectedIntent.rules.exact_any)} onChange={(event) => updateIntent((intent) => { intent.rules.exact_any = splitLines(event.target.value); })} />
                      </FieldLabel>
                      <FieldLabel label="包含任一规则 contains_any">
                        <textarea className="input mt-1 min-h-20 w-full py-2 font-mono text-xs leading-relaxed" value={joinLines(selectedIntent.rules.contains_any)} onChange={(event) => updateIntent((intent) => { intent.rules.contains_any = splitLines(event.target.value); })} />
                      </FieldLabel>
                      <FieldLabel label="同时包含规则 contains_all">
                        <textarea className="input mt-1 min-h-20 w-full py-2 font-mono text-xs leading-relaxed" value={joinGroups(selectedIntent.rules.contains_all)} onChange={(event) => updateIntent((intent) => { intent.rules.contains_all = splitGroups(event.target.value); })} />
                      </FieldLabel>
                      <FieldLabel label="负向包含规则 negative_contains_any">
                        <textarea className="input mt-1 min-h-20 w-full py-2 font-mono text-xs leading-relaxed" value={joinLines(selectedIntent.rules.negative_contains_any)} onChange={(event) => updateIntent((intent) => { intent.rules.negative_contains_any = splitLines(event.target.value); })} />
                      </FieldLabel>
                      <FieldLabel label="允许动作">
                        <textarea className="input mt-1 min-h-20 w-full py-2 font-mono text-xs leading-relaxed" value={joinLines(selectedIntent.allowed_actions)} onChange={(event) => updateIntent((intent) => { intent.allowed_actions = splitLines(event.target.value); })} />
                      </FieldLabel>
                      <FieldLabel label="适用页面">
                        <textarea className="input mt-1 min-h-20 w-full py-2 font-mono text-xs leading-relaxed" value={joinLines(selectedIntent.applicable_pages)} onChange={(event) => updateIntent((intent) => { intent.applicable_pages = splitLines(event.target.value); })} />
                      </FieldLabel>
                    </div>
                  </div>
                </div>
              )}

              <ValidationPanel validation={validationResult} />
              <EvaluationPanel evaluation={evaluationResult} />
            </aside>
          </div>
        ) : (
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
              <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-neutral-950">
                  <Code2 size={16} />
                  YAML 原文
                </div>
                <span className="rounded-full border border-neutral-200 px-2 py-1 font-mono text-xs text-neutral-500">
                  {yamlText.split('\n').length} 行
                </span>
              </div>
              <textarea
                className="min-h-[680px] w-full resize-y border-0 bg-neutral-950 px-4 py-4 font-mono text-xs leading-relaxed text-neutral-100 outline-none"
                value={yamlText}
                spellCheck={false}
                onChange={(event) => setYamlText(event.target.value)}
              />
            </div>
            <aside className="grid content-start gap-4">
              <ValidationPanel validation={validationResult} />
              <EvaluationPanel evaluation={evaluationResult} />
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}
