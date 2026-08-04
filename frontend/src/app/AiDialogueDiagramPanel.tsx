import type { Dispatch, SetStateAction } from 'react';
import { Upload } from 'lucide-react';
import type { DiagramPackImageOptions } from '../utils/resource-generation-payload';
import { diagramAspectOptions, diagramStyleOptions } from './aiDialogueConfig';

export type AiDialogueDiagramPanelProps = {
  imageOptions: DiagramPackImageOptions;
  setImageOptions: Dispatch<SetStateAction<DiagramPackImageOptions>>;
  referenceAssetCount: number;
  referenceUploadBusy: boolean;
  onReferenceUpload: (files: FileList | null) => Promise<void>;
};

/** 渲染教学图解包的图片比例、风格、供应商和参考图上传控制。 */
export function AiDialogueDiagramPanel({
  imageOptions,
  setImageOptions,
  referenceAssetCount,
  referenceUploadBusy,
  onReferenceUpload,
}: AiDialogueDiagramPanelProps): JSX.Element {
  return (
    <div className="diagram-parameter-panel" aria-label="教学图解包参数">
      <div className="diagram-parameter-panel__group">
        <span>比例</span>
        <div className="diagram-parameter-panel__segments">
          {diagramAspectOptions.map((item) => (
            <button
              key={item.value}
              type="button"
              className={imageOptions.aspectRatio === item.value ? 'is-active' : ''}
              onClick={() => setImageOptions((current) => ({ ...current, aspectRatio: item.value }))}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <label className="diagram-parameter-panel__field">
        <span>风格</span>
        <select
          value={imageOptions.stylePreset ?? 'clean_edu'}
          onChange={(event) => setImageOptions((current) => ({ ...current, stylePreset: event.target.value }))}
        >
          {diagramStyleOptions.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </label>
      <label className="diagram-parameter-panel__field diagram-parameter-panel__field--provider">
        <span>Provider</span>
        <input
          value={imageOptions.providerCode ?? ''}
          placeholder="默认图片供应商"
          onChange={(event) => setImageOptions((current) => ({ ...current, providerCode: event.target.value }))}
        />
      </label>
      <label className={`diagram-parameter-panel__upload ${referenceUploadBusy ? 'is-busy' : ''}`}>
        <Upload size={14} />
        {referenceUploadBusy ? '上传中' : `参考图 ${referenceAssetCount}/6`}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          disabled={referenceUploadBusy}
          onChange={(event) => {
            void onReferenceUpload(event.currentTarget.files);
            event.currentTarget.value = '';
          }}
        />
      </label>
      {referenceAssetCount > 0 && (
        <button
          type="button"
          className="diagram-parameter-panel__clear"
          onClick={() => setImageOptions((current) => ({ ...current, referenceAssetIds: [] }))}
        >
          清空
        </button>
      )}
    </div>
  );
}
