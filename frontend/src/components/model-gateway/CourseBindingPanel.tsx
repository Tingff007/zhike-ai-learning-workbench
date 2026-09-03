import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Lightbulb, Save, Shield, X } from 'lucide-react';
import { api } from '../../api/endpoints';
import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';
import { useCurrentCourseId } from '../../hooks/useCourseData';
import type { ChatdocConfigView, Course, CourseModelConfig, ModelProviderHealth } from '../../types';

type BindingForm = {
  chatProvider: string;
  imageProvider: string;
  cloudRagProvider: string;
  remoteKnowledgeBaseId: string;
  defaultAnswerMode: 'default_chat' | 'course_rag_qa';
  allowRagFallbackToChat: boolean;
  requireCitationForCourseAnswer: boolean;
  defaultUseCourseEvidenceForResource: boolean;
  aiBindingEnabled: boolean;
  dailyTokenLimit: string;
  dailyCostLimit: string;
};

function emptyForm(): BindingForm {
  return {
    chatProvider: '',
    imageProvider: '',
    cloudRagProvider: '',
    remoteKnowledgeBaseId: '',
    defaultAnswerMode: 'default_chat',
    allowRagFallbackToChat: false,
    requireCitationForCourseAnswer: true,
    defaultUseCourseEvidenceForResource: true,
    aiBindingEnabled: true,
    dailyTokenLimit: '',
    dailyCostLimit: '',
  };
}

function configToForm(config: CourseModelConfig | undefined): BindingForm {
  return {
    chatProvider: config?.chat_provider ?? '',
    imageProvider: config?.image_provider ?? '',
    cloudRagProvider: config?.cloud_rag_provider_id ?? config?.cloud_rag_provider ?? '',
    remoteKnowledgeBaseId: config?.remote_knowledge_base_id ?? '',
    defaultAnswerMode: config?.default_answer_mode === 'course_rag_qa' ? 'course_rag_qa' : 'default_chat',
    allowRagFallbackToChat: Boolean(config?.allow_rag_fallback_to_chat),
    requireCitationForCourseAnswer: config?.require_citation_for_course_answer ?? true,
    defaultUseCourseEvidenceForResource: config?.default_use_course_evidence_for_resource ?? true,
    aiBindingEnabled: config?.ai_binding_enabled ?? true,
    dailyTokenLimit: config?.daily_token_limit ? String(config.daily_token_limit) : '',
    dailyCostLimit: config?.daily_cost_limit ? String(config.daily_cost_limit) : '',
  };
}

function isDefaultAnswerMode(value: string): value is BindingForm['defaultAnswerMode'] {
  return value === 'default_chat' || value === 'course_rag_qa';
}

function ragLabel(config: ChatdocConfigView): string {
  return `${config.display_label || config.integration_key}${config.active_integration_key === config.integration_key ? ' · 默认' : ''}`;
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suffix: string;
  hint?: string;
}): JSX.Element {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <div className="relative mt-1.5">
        <input
          className="input w-full pr-16 tabular-nums"
          type="number"
          min={0}
          step={suffix === '元' ? 0.01 : 1}
          placeholder="0"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">{suffix}</span>
      </div>
      {hint ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
    </label>
  );
}

export function CourseBindingPanel({
  chatProviders,
  imageProviders = [],
  onNotice,
}: {
  chatProviders: ModelProviderHealth[];
  imageProviders?: ModelProviderHealth[];
  onNotice: (message: string) => void;
}): JSX.Element {
  const queryClient = useQueryClient();
  const globalCourseId = useCurrentCourseId();
  const navigate = useNavigate();

  const coursesQuery = useQuery({
    queryKey: ['admin-courses-binding'],
    queryFn: api.adminCourses,
  });
  const courses = coursesQuery.data?.items ?? [];

  const [selectedCourseId, setSelectedCourseId] = useState(globalCourseId ?? '');
  const [form, setForm] = useState<BindingForm>(emptyForm);
  const [dirty, setDirty] = useState(false);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId),
    [courses, selectedCourseId],
  );

  const configQuery = useQuery({
    queryKey: ['course-model-config', selectedCourseId],
    queryFn: () => api.courseModelConfig(selectedCourseId),
    enabled: Boolean(selectedCourseId),
  });
  const ragInstancesQuery = useQuery({
    queryKey: ['chatdoc-config-instances'],
    queryFn: api.listChatdocConfigInstances,
  });
  const ragInstances = ragInstancesQuery.data?.items ?? [];

  useEffect(() => {
    if (!selectedCourseId && globalCourseId) {
      setSelectedCourseId(globalCourseId);
    }
  }, [globalCourseId, selectedCourseId]);

  useEffect(() => {
    if (configQuery.data) {
      setForm(configToForm(configQuery.data));
      setDirty(false);
    }
  }, [configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const tokenRaw = form.dailyTokenLimit.trim();
      const costRaw = form.dailyCostLimit.trim();
      return api.updateCourseModelConfig(selectedCourseId, {
        chat_provider: form.chatProvider || null,
        image_provider: form.imageProvider || null,
        cloud_rag_provider: form.cloudRagProvider || null,
        cloud_rag_provider_id: form.cloudRagProvider || null,
        remote_knowledge_base_id: form.remoteKnowledgeBaseId.trim() || null,
        default_answer_mode: form.defaultAnswerMode,
        allow_rag_fallback_to_chat: form.allowRagFallbackToChat,
        require_citation_for_course_answer: form.requireCitationForCourseAnswer,
        default_use_course_evidence_for_resource: form.defaultUseCourseEvidenceForResource,
        ai_binding_enabled: form.aiBindingEnabled,
        daily_token_limit: tokenRaw ? Number(tokenRaw) : 0,
        daily_cost_limit: costRaw ? Number(costRaw) : 0,
      });
    },
    onSuccess: (result) => {
      if (result.status === 'failed') {
        onNotice(result.message ?? '保存失败，请检查供应商是否存在。');
        return;
      }
      onNotice(`${selectedCourse?.title ?? selectedCourseId} 配额已保存，运维舱指标已刷新。`);
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: ['course-model-config', selectedCourseId] });
      void queryClient.invalidateQueries({ queryKey: ['operations-dashboard'] });
      navigate('/admin/operations-monitoring');
    },
    onError: (error) => onNotice(error instanceof Error ? error.message : '保存失败'),
  });

  function patchForm(patch: Partial<BindingForm>): void {
    setForm((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }

  function resetForm(): void {
    setForm(configToForm(configQuery.data));
    setDirty(false);
  }

  function handleSave(): void {
    if (!selectedCourseId) {
      onNotice('请先选择课程。');
      return;
    }
    saveMutation.mutate();
  }

  const chatLabel = (provider: ModelProviderHealth): string =>
    `${provider.display_name}${provider.chat_model ? ` · ${provider.chat_model}` : ''}`;
  const imageLabel = (provider: ModelProviderHealth): string =>
    `${provider.display_name}${provider.image_model || provider.chat_model ? ` · ${provider.image_model || provider.chat_model}` : ''}`;

  return (
    <section className="mt-4">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">按课绑定</h2>
              <p className="mt-1 text-sm text-slate-500">为课程空间配置 Chat 路由与多租户预算熔断阈值</p>
            </div>
            <label className="min-w-[220px] text-xs text-slate-500">
              配置课程
              <select
                className="input mt-1 w-full"
                value={selectedCourseId}
                onChange={(event) => {
                  setSelectedCourseId(event.target.value);
                  setDirty(false);
                }}
              >
                <option value="">选择课程…</option>
                {courses.map((course: Course) => (
                  <option key={course.id} value={course.id}>
                    {course.title} ({course.id})
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {!selectedCourseId && (
          <div className="px-5 py-12 text-center text-sm text-slate-500">请选择一门课程以编辑模型路由与预算配额。</div>
        )}

        {selectedCourseId && (
          <div className="space-y-0">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <BookOpen size={16} className="text-primary" />
                <span>
                  当前配置课程：<strong>{selectedCourse?.title ?? selectedCourseId}</strong>
                  <span className="ml-2 font-mono text-xs text-slate-400">({selectedCourseId})</span>
                </span>
              </div>
            </div>

            <div className="border-b border-slate-200 px-5 py-5">
              <h3 className="text-sm font-semibold text-slate-900">基础模型路由绑定</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="text-xs text-slate-500">
                  Chat 模型
                  <select
                    className="input mt-1 w-full"
                    value={form.chatProvider}
                    onChange={(event) => patchForm({ chatProvider: event.target.value })}
                  >
                    <option value="">跟随全局默认</option>
                    {chatProviders.map((item) => (
                      <option key={item.provider} value={item.provider}>
                        {chatLabel(item)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-500">
                  图片生成
                  <select
                    className="input mt-1 w-full"
                    value={form.imageProvider}
                    onChange={(event) => patchForm({ imageProvider: event.target.value })}
                  >
                    <option value="">跟随全局默认</option>
                    {imageProviders.map((item) => (
                      <option key={item.provider} value={item.provider}>
                        {imageLabel(item)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="text-xs text-slate-500">
                  <span className="block">Embed / 向量化</span>
                  <div className="mt-1 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-600">
                    云端知识库托管 · 请在{' '}
                    <Link to={kb.credentialsRoute} className="text-primary hover:underline">
                      网关中心 · 知识向量化
                    </Link>
                    {' '}配置凭证，文档入库仍在知识大本营操作。
                  </div>
                </div>
              </div>
            </div>

            <div className="border-b border-slate-200 px-5 py-5">
              <h3 className="text-sm font-semibold text-slate-900">AI 编排策略</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="text-xs text-slate-500">
                  Cloud RAG / 课程资料问答
                  <select
                    className="input mt-1 w-full"
                    value={form.cloudRagProvider}
                    onChange={(event) => patchForm({ cloudRagProvider: event.target.value })}
                  >
                    <option value="">跟随当前默认 RAG 实例</option>
                    {ragInstances.map((item) => (
                      <option key={item.integration_key} value={item.integration_key}>
                        {ragLabel(item)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-500">
                  远端知识库 ID
                  <input
                    className="input mt-1 w-full font-mono text-xs"
                    value={form.remoteKnowledgeBaseId}
                    onChange={(event) => patchForm({ remoteKnowledgeBaseId: event.target.value })}
                    placeholder="例如 iflytek repoId，可为空并自动使用课程 Repo"
                  />
                </label>
                <label className="text-xs text-slate-500">
                  默认问答模式
                  <select
                    className="input mt-1 w-full"
                    value={form.defaultAnswerMode}
                    onChange={(event) => {
                      const value = event.target.value;
                      patchForm({ defaultAnswerMode: isDefaultAnswerMode(value) ? value : 'default_chat' });
                    }}
                  >
                    <option value="default_chat">普通学习对话</option>
                    <option value="course_rag_qa">课程资料问答</option>
                  </select>
                </label>
                <div className="grid gap-2 text-xs text-slate-600">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.aiBindingEnabled}
                      onChange={(event) => patchForm({ aiBindingEnabled: event.target.checked })}
                    />
                    启用本课程 AI 绑定
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.requireCitationForCourseAnswer}
                      onChange={(event) => patchForm({ requireCitationForCourseAnswer: event.target.checked })}
                    />
                    课程资料问答必须命中引用
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.defaultUseCourseEvidenceForResource}
                      onChange={(event) => patchForm({ defaultUseCourseEvidenceForResource: event.target.checked })}
                    />
                    资源生成默认使用课程资料依据
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.allowRagFallbackToChat}
                      onChange={(event) => patchForm({ allowRagFallbackToChat: event.target.checked })}
                    />
                    允许资料问答失败后提示切换普通 Chat
                  </label>
                </div>
              </div>
            </div>

            <div className="px-5 py-5">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-amber-600" />
                <h3 className="text-sm font-semibold text-slate-900">空间预算防爆刷配额</h3>
              </div>
              <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <Lightbulb size={14} className="mt-0.5 shrink-0" />
                线上运营真实账单走厂商控制台；此处为系统受控熔断阈值，到达上限时网关将拒绝该课程的新增调用。
              </p>
              <div className="mt-4 grid gap-5 md:grid-cols-2">
                <NumberField
                  label="单日 Token 消耗上限"
                  value={form.dailyTokenLimit}
                  onChange={(value) => patchForm({ dailyTokenLimit: value })}
                  suffix="Tokens"
                  hint="填入 0 或不填代表不设限制"
                />
                <NumberField
                  label="单日费用消耗上限"
                  value={form.dailyCostLimit}
                  onChange={(value) => patchForm({ dailyCostLimit: value })}
                  suffix="元"
                  hint="依据当前绑定模型单价估算，到达该金额时执行安全熔断"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-4">
              <button type="button" className="btn-secondary gap-2" disabled={!dirty} onClick={resetForm}>
                <X size={16} />
                取消
              </button>
              <button
                type="button"
                className="btn-primary gap-2"
                disabled={saveMutation.isPending || configQuery.isLoading}
                onClick={handleSave}
              >
                <Save size={16} />
                {saveMutation.isPending ? '保存中…' : '保存并同步至云原生运维舱'}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
