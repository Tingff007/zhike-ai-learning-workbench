import { knowledgeIntegrationCopy as kb } from '../../config/knowledgeIntegration';
import { ProviderIconPicker } from './ProviderIconPicker';
import type { ModelProviderIconItem } from '../../utils/providerIcon';

type Props = {
  displayName: string;
  remarks: string;
  websiteUrl: string;
  iconFile?: string;
  iconItems: ModelProviderIconItem[];
  onDisplayNameChange: (value: string) => void;
  onRemarksChange: (value: string) => void;
  onWebsiteChange: (value: string) => void;
  onIconChange: (filename: string) => void;
  onIconUpload: (file: File) => Promise<string>;
};

export function CustomRagKnowledgeFields({
  displayName,
  remarks,
  websiteUrl,
  iconFile,
  iconItems,
  onDisplayNameChange,
  onRemarksChange,
  onWebsiteChange,
  onIconChange,
  onIconUpload,
}: Props): JSX.Element {
  return (
    <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <ProviderIconPicker
        displayName={displayName || '通用'}
        iconFile={iconFile}
        icons={iconItems}
        onIconChange={onIconChange}
        onUpload={onIconUpload}
      />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-xs text-slate-500">
          供应商名称 *
          <input
            className="input mt-1 w-full bg-white"
            value={displayName}
            onChange={(event) => onDisplayNameChange(event.target.value)}
            placeholder="例如：自建 Dify 知识库"
          />
        </label>
        <label className="text-xs text-slate-500">
          备注
          <input
            className="input mt-1 w-full bg-white"
            value={remarks}
            onChange={(event) => onRemarksChange(event.target.value)}
            placeholder="例如：测试环境 / 院系专用"
          />
        </label>
        <label className="md:col-span-2 text-xs text-slate-500">
          官网 / 文档链接
          <input
            className="input mt-1 w-full bg-white"
            value={websiteUrl}
            onChange={(event) => onWebsiteChange(event.target.value)}
            placeholder="https://docs.example.com（可选）"
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-slate-500">{kb.knowledgeGenericBaseUrlHint}</p>
    </div>
  );
}
