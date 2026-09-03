import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { api } from '../api/endpoints';
import type { DiagramPackImageOptions } from '../utils/resource-generation-payload';
import { explainResourceError } from '../utils/workspace-errors';
import type { WorkspaceToastItem } from '../components/shared/WorkspaceToast';

export type UseDiagramPackReferenceUploadInput = {
  isCourseMode: boolean;
  courseId: string;
  currentRole: string;
  onToast: (message: string, tone?: WorkspaceToastItem['tone']) => void;
};

export type UseDiagramPackReferenceUploadResult = {
  diagramPackImageOptions: DiagramPackImageOptions;
  setDiagramPackImageOptions: Dispatch<SetStateAction<DiagramPackImageOptions>>;
  referenceAssetCount: number;
  referenceUploadBusy: boolean;
  handleDiagramReferenceUpload: (files: FileList | null) => Promise<void>;
};

const MAX_DIAGRAM_REFERENCE_IMAGES = 6;

/** 截取本次允许上传的图包参考图文件，避免组件内重复维护数量限制。 */
export function selectDiagramReferenceFiles(files: Iterable<File> | null | undefined): File[] {
  if (!files) return [];
  return Array.from(files).slice(0, MAX_DIAGRAM_REFERENCE_IMAGES);
}

/** 合并已存在和新上传的参考图 ID，并按上传上限去重截断。 */
export function mergeDiagramReferenceAssetIds(
  currentIds: string[] | undefined,
  uploadedItems: Array<{ id?: string | null } | null | undefined>,
): string[] {
  const nextIds = uploadedItems
    .map((item) => item?.id)
    .filter((id): id is string => Boolean(id));
  return Array.from(new Set([...(currentIds ?? []), ...nextIds])).slice(0, MAX_DIAGRAM_REFERENCE_IMAGES);
}

/** 管理图解包参考图上传状态，并把上传结果同步到图片生成参数。 */
export function useDiagramPackReferenceUpload({
  isCourseMode,
  courseId,
  currentRole,
  onToast,
}: UseDiagramPackReferenceUploadInput): UseDiagramPackReferenceUploadResult {
  const [diagramPackImageOptions, setDiagramPackImageOptions] = useState<DiagramPackImageOptions>({
    aspectRatio: '1:1',
    stylePreset: 'clean_edu',
    referenceAssetIds: [],
    providerCode: '',
  });
  const [referenceUploadBusy, setReferenceUploadBusy] = useState(false);
  const referenceAssetCount = diagramPackImageOptions.referenceAssetIds?.length ?? 0;

  const handleDiagramReferenceUpload = useCallback(async (files: FileList | null): Promise<void> => {
    const selectedFiles = selectDiagramReferenceFiles(files);
    if (!selectedFiles.length) return;
    setReferenceUploadBusy(true);
    try {
      const result = await api.uploadResourceReferenceImages(selectedFiles, isCourseMode ? courseId : null);
      const nextIds = (result.items ?? [])
        .map((item) => item?.id)
        .filter((id): id is string => Boolean(id));
      setDiagramPackImageOptions((current) => ({
        ...current,
        referenceAssetIds: mergeDiagramReferenceAssetIds(current.referenceAssetIds, result.items ?? []),
      }));
      onToast(nextIds.length ? `已上传 ${nextIds.length} 张参考图` : '参考图已处理', 'success');
    } catch (error) {
      const explained = explainResourceError(error, { hasCourse: isCourseMode, isUserMode: currentRole === 'student' });
      onToast(explained.rootCause ? `${explained.summary}（${explained.rootCause}）` : explained.summary, 'error');
    } finally {
      setReferenceUploadBusy(false);
    }
  }, [courseId, currentRole, isCourseMode, onToast]);

  return {
    diagramPackImageOptions,
    setDiagramPackImageOptions,
    referenceAssetCount,
    referenceUploadBusy,
    handleDiagramReferenceUpload,
  };
}
