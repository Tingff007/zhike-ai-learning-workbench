import { useMemo, useState } from 'react';
import { ChevronDown, Copy, ExternalLink, FileJson2 } from 'lucide-react';
import {
  CHATDOC_PIPELINE_STAGES,
  chatdocPipelineEnabledAfterValueChange,
  isChatdocPipelineFieldConfigurable,
  type ChatdocPipelineFieldDef,
  type ChatdocPipelineStageDef,
  type ChatdocPipelineStageId,
} from '../../data/chatdocPipelineFields';
import {
  applyCustomWikiSplitPresetToPipeline,
  applyVendorDefaultSplitToPipeline,
  chatdocSplitPresetCopy,
} from '../../config/chatdocTextbookSplitPreset';
import { buildChatdocPipelineJsonDocument } from '../../utils/chatdocPipelineConfig';

type Props = {
  values: Record<string, string>;
  enabled: Record<string, boolean>;
  onValuesChange: (next: Record<string, string>) => void;
  onEnabledChange: (next: Record<string, boolean>) => void;
  stageIds?: ChatdocPipelineStageId[];
  title?: string;
  description?: string;
  showPreview?: boolean;
  defaultStage?: ChatdocPipelineStageId;
  showEndpointMeta?: boolean;
  compact?: boolean;
};

function fieldLabel(field: ChatdocPipelineFieldDef, compact: boolean): string {
  return compact && field.displayLabel ? field.displayLabel : field.label;
}

function PipelineFieldControl({
  field,
  value,
  enabled,
  configurable,
  compact,
  onValueChange,
  onEnabledChange,
}: {
  field: ChatdocPipelineFieldDef;
  value: string;
  enabled: boolean;
  configurable: boolean;
  compact: boolean;
  onValueChange: (next: string) => void;
  onEnabledChange: (next: boolean) => void;
}): JSX.Element | null {
  const inputId = `chatdoc-pipeline-${field.key}`;
  const alwaysOn = Boolean(field.locked || field.enabledByDefault);
  const showToggle = !alwaysOn || !compact;
  const fieldActive = configurable && (alwaysOn || enabled);
  const disabled = field.locked || !fieldActive;
  const toggleDisabled = field.locked || !configurable;
  const label = fieldLabel(field, compact);

  if (!configurable && field.dependsOn) {
    return null;
  }

  const control = field.type === 'boolean' ? (
    <select
      id={inputId}
      className="input h-9 w-full font-mono text-xs"
      value={value || 'false'}
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.value)}
    >
      <option value="true">true</option>
      <option value="false">false</option>
    </select>
  ) : field.type === 'select' && field.options ? (
    <select
      id={inputId}
      className="input h-9 w-full text-xs"
      value={value}
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {field.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ) : field.type === 'string_list' ? (
    <textarea
      id={inputId}
      className="input min-h-[72px] w-full resize-y font-mono text-xs"
      value={value}
      disabled={disabled}
      placeholder={field.placeholder}
      onChange={(event) => onValueChange(event.target.value)}
    />
  ) : (
    <input
      id={inputId}
      className="input h-9 w-full font-mono text-xs"
      type={field.type === 'number' ? 'number' : 'text'}
      min={field.min}
      max={field.max}
      step={field.step}
      value={value}
      disabled={disabled}
      placeholder={field.placeholder}
      onChange={(event) => onValueChange(event.target.value)}
    />
  );

  const showControl = !compact || fieldActive || alwaysOn;

  return (
    <div
      className={[
        'chatdoc-pipeline-field',
        fieldActive ? '' : ' chatdoc-pipeline-field--off',
        compact ? ' chatdoc-pipeline-field--compact' : '',
        compact && alwaysOn ? ' chatdoc-pipeline-field--always-on' : '',
      ].join('')}
    >
      <div className="chatdoc-pipeline-field__head">
        {showToggle ? (
          <label className="chatdoc-pipeline-field__toggle" htmlFor={`${inputId}-enabled`}>
            <input
              id={`${inputId}-enabled`}
              type="checkbox"
              checked={field.locked ? true : fieldActive}
              disabled={toggleDisabled}
              onChange={(event) => onEnabledChange(event.target.checked)}
            />
            <span className="chatdoc-pipeline-field__label">{label}</span>
            {!compact && <span className="chatdoc-pipeline-field__api font-mono text-[10px] text-slate-400">{field.label}</span>}
          </label>
        ) : (
          <div className="chatdoc-pipeline-field__title">
            <span className="chatdoc-pipeline-field__label">{label}</span>
            {!compact && <span className="chatdoc-pipeline-field__api font-mono text-[10px] text-slate-400">{field.label}</span>}
          </div>
        )}
        {field.locked && <span className="chatdoc-pipeline-field__badge">固定</span>}
      </div>
      {field.description && (
        <p className="chatdoc-pipeline-field__desc">{field.description}</p>
      )}
      {showControl && control}
    </div>
  );
}

function CustomSplitGroup({
  fields,
  values,
  enabled,
  compact,
  onValueChange,
  onEnabledChange,
  onApplyCustomWikiPreset,
}: {
  fields: ChatdocPipelineFieldDef[];
  values: Record<string, string>;
  enabled: Record<string, boolean>;
  compact: boolean;
  onValueChange: (key: string, next: string) => void;
  onEnabledChange: (key: string, next: boolean) => void;
  onApplyCustomWikiPreset?: () => void;
}): JSX.Element {
  return (
    <div className="chatdoc-pipeline-group chatdoc-pipeline-group--custom-split">
      <div className="chatdoc-pipeline-group__head flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="chatdoc-pipeline-group__title">自定义切分</span>
          <span className="chatdoc-pipeline-group__hint">{chatdocSplitPresetCopy.customHint}</span>
        </div>
        {onApplyCustomWikiPreset && (
          <button type="button" className="btn-secondary h-8 shrink-0 px-3 text-xs" onClick={onApplyCustomWikiPreset}>
            {chatdocSplitPresetCopy.customApplyLabel}
          </button>
        )}
      </div>
      <div className="chatdoc-pipeline-group__fields">
        {fields.map((field) => (
          <PipelineFieldControl
            key={field.key}
            field={field}
            value={values[field.key] ?? ''}
            enabled={enabled[field.key] ?? false}
            configurable={isChatdocPipelineFieldConfigurable(field, values)}
            compact={compact}
            onValueChange={(next) => onValueChange(field.key, next)}
            onEnabledChange={(next) => onEnabledChange(field.key, next)}
          />
        ))}
      </div>
    </div>
  );
}

function StagePanel({
  stage,
  values,
  enabled,
  compact,
  onValueChange,
  onEnabledChange,
  onApplyVendorDefault,
  onApplyCustomWikiPreset,
  showEndpointMeta = true,
}: {
  stage: ChatdocPipelineStageDef;
  values: Record<string, string>;
  enabled: Record<string, boolean>;
  compact: boolean;
  onValueChange: (key: string, next: string) => void;
  onEnabledChange: (key: string, next: boolean) => void;
  onApplyVendorDefault?: () => void;
  onApplyCustomWikiPreset?: () => void;
  showEndpointMeta?: boolean;
}): JSX.Element {
  const customSplitEnabled = (values.isSplitDefault ?? 'true') === 'false';
  const mainFields = stage.fields.filter((field) => field.group !== 'custom_split');
  const customSplitFields = stage.fields.filter((field) => field.group === 'custom_split');

  return (
    <div className="chatdoc-pipeline-stage">
      {!compact && (
        <div className="chatdoc-pipeline-stage__meta">
          {showEndpointMeta ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="chatdoc-pipeline-stage__method">{stage.method}</span>
                <code className="chatdoc-pipeline-stage__endpoint">{stage.endpoint}</code>
                {stage.docAnchor && (
                  <a
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    href={stage.docAnchor}
                    target="_blank"
                    rel="noreferrer"
                  >
                    官方文档
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">{stage.hint}</p>
            </>
          ) : (
            <p className="text-xs leading-5 text-slate-600">{stage.hint}</p>
          )}
        </div>
      )}

      <div className="chatdoc-pipeline-stage__fields">
        {mainFields.map((field) => (
          <PipelineFieldControl
            key={field.key}
            field={field}
            value={values[field.key] ?? ''}
            enabled={enabled[field.key] ?? false}
            configurable={isChatdocPipelineFieldConfigurable(field, values)}
            compact={compact}
            onValueChange={(next) => onValueChange(field.key, next)}
            onEnabledChange={(next) => onEnabledChange(field.key, next)}
          />
        ))}

        {compact && !customSplitEnabled && (
          <div className="chatdoc-pipeline-split-note space-y-2">
            <p>{chatdocSplitPresetCopy.vendorDefaultHint}</p>
          </div>
        )}

        {customSplitEnabled && customSplitFields.length > 0 && (
          compact ? (
            <CustomSplitGroup
              fields={customSplitFields}
              values={values}
              enabled={enabled}
              compact={compact}
              onValueChange={onValueChange}
              onEnabledChange={onEnabledChange}
              onApplyCustomWikiPreset={onApplyCustomWikiPreset}
            />
          ) : (
            <>
              {customSplitFields.map((field) => (
              <PipelineFieldControl
                key={field.key}
                field={field}
                value={values[field.key] ?? ''}
                enabled={enabled[field.key] ?? false}
                configurable={isChatdocPipelineFieldConfigurable(field, values)}
                compact={compact}
                onValueChange={(next) => onValueChange(field.key, next)}
                onEnabledChange={(next) => onEnabledChange(field.key, next)}
              />
            ))}
            </>
          )
        )}
      </div>
    </div>
  );
}

export function ChatdocPipelineConfigPanel({
  values,
  enabled,
  onValuesChange,
  onEnabledChange,
  stageIds,
  title = 'ChatDoc 流水线参数',
  description = '默认使用讯飞内置 wiki 切分（不传 extend）；仅在不满意时再开启自定义切分。',
  showPreview = true,
  defaultStage = 'upload_preprocess',
  showEndpointMeta = true,
  compact = false,
}: Props): JSX.Element {
  const visibleStages = useMemo(
    () => (stageIds?.length ? CHATDOC_PIPELINE_STAGES.filter((stage) => stageIds.includes(stage.id)) : CHATDOC_PIPELINE_STAGES),
    [stageIds],
  );
  const [activeStage, setActiveStage] = useState<ChatdocPipelineStageId>(
    visibleStages.some((stage) => stage.id === defaultStage) ? defaultStage : visibleStages[0]?.id ?? 'upload_preprocess',
  );
  const [previewOpen, setPreviewOpen] = useState(!compact);
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const jsonDocument = useMemo(
    () => buildChatdocPipelineJsonDocument(values, enabled),
    [values, enabled],
  );

  const jsonText = useMemo(() => JSON.stringify(jsonDocument, null, 2), [jsonDocument]);

  const activeStageDef = visibleStages.find((stage) => stage.id === activeStage) ?? visibleStages[0]!;
  const singleStage = visibleStages.length === 1;

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopyHint('已复制 JSON');
      window.setTimeout(() => setCopyHint(null), 1800);
    } catch {
      setCopyHint('复制失败');
    }
  }

  function handleApplyVendorDefault(): void {
    const next = applyVendorDefaultSplitToPipeline(values, enabled);
    onValuesChange(next.values);
    onEnabledChange(next.enabled);
  }

  function handleApplyCustomWikiPreset(): void {
    const next = applyCustomWikiSplitPresetToPipeline(values, enabled);
    onValuesChange(next.values);
    onEnabledChange(next.enabled);
  }

  const showSplitPresets =
    activeStageDef.id === 'upload_preprocess' && visibleStages.some((s) => s.id === 'upload_preprocess');

  return (
    <section className={`chatdoc-pipeline-panel mb-4${compact ? ' chatdoc-pipeline-panel--compact' : ''}`}>
      <div className="chatdoc-pipeline-panel__head">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {showSplitPresets && (
            <>
              <button type="button" className="btn-primary h-8 px-3 text-xs" onClick={handleApplyVendorDefault}>
                {chatdocSplitPresetCopy.vendorDefaultApplyLabel}
              </button>
              <button type="button" className="btn-secondary h-8 px-3 text-xs" onClick={handleApplyCustomWikiPreset}>
                {chatdocSplitPresetCopy.customApplyLabel}
              </button>
            </>
          )}
          {!compact && (
            <a
              className="btn-secondary h-8 gap-1.5 px-3 text-xs"
              href="https://chatdoc.xfyun.cn/docs#/"
              target="_blank"
              rel="noreferrer"
            >
              API V2 文档
              <ExternalLink size={13} />
            </a>
          )}
        </div>
      </div>

      {!singleStage && (
        <div className="chatdoc-pipeline-tabs" role="tablist" aria-label="ChatDoc 流水线阶段">
          {visibleStages.map((stage) => (
            <button
              key={stage.id}
              type="button"
              role="tab"
              aria-selected={activeStage === stage.id}
              className={`chatdoc-pipeline-tabs__item${activeStage === stage.id ? ' chatdoc-pipeline-tabs__item--active' : ''}`}
              onClick={() => setActiveStage(stage.id)}
            >
              <span className="chatdoc-pipeline-tabs__short">{stage.shortLabel}</span>
              <span className="chatdoc-pipeline-tabs__full">{stage.label}</span>
            </button>
          ))}
        </div>
      )}

      <StagePanel
        stage={activeStageDef}
        values={values}
        enabled={enabled}
        compact={compact}
        onValueChange={(key, next) => {
          onValuesChange({ ...values, [key]: next });
          const nextEnabled = chatdocPipelineEnabledAfterValueChange(key, next, enabled);
          if (nextEnabled !== enabled) onEnabledChange(nextEnabled);
        }}
        onEnabledChange={(key, next) => onEnabledChange({ ...enabled, [key]: next })}
        onApplyVendorDefault={showSplitPresets ? handleApplyVendorDefault : undefined}
        onApplyCustomWikiPreset={showSplitPresets ? handleApplyCustomWikiPreset : undefined}
        showEndpointMeta={showEndpointMeta}
      />

      {showPreview && (
      <div className="chatdoc-pipeline-preview">
        <button
          type="button"
          className="chatdoc-pipeline-preview__toggle"
          aria-expanded={previewOpen}
          onClick={() => setPreviewOpen((open) => !open)}
        >
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FileJson2 size={16} className="text-primary" />
            {compact ? 'JSON 预览' : '实时 JSON 配置预览'}
          </span>
          <span className="inline-flex items-center gap-2 text-xs text-slate-500">
            <span className="text-xs text-slate-500">
                {copyHint ?? (singleStage ? '当前阶段 JSON' : '五阶段合并文档')}
              </span>
            <ChevronDown
              size={16}
              className={`transition-transform${previewOpen ? ' rotate-180' : ''}`}
            />
          </span>
        </button>
        {previewOpen && (
          <div className="chatdoc-pipeline-preview__body">
            <div className="chatdoc-pipeline-preview__toolbar">
              <span className="text-xs text-slate-500">
                当前阶段高亮：
                <strong className="ml-1 font-medium text-slate-800">{activeStageDef.label}</strong>
              </span>
              <button type="button" className="btn-secondary h-8 gap-1.5 px-3 text-xs" onClick={() => { void handleCopy(); }}>
                <Copy size={14} />
                复制 JSON
              </button>
            </div>
            <pre className="chatdoc-pipeline-preview__code">{jsonText}</pre>
          </div>
        )}
      </div>
      )}
    </section>
  );
}
