import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Pencil, SendHorizontal, X } from 'lucide-react';
import { api } from '../../api/endpoints';
type ArtifactToolbarProps = {
  artifactId: string | null;
  title: string;
  filename: string;
  content: string;
  isMarkdown: boolean;
  canEdit: boolean;
  editing: boolean;
  resourceStatus?: string;
  saving?: boolean;
  onEditStart: () => void;
  onEditCancel: () => void;
  onSave: () => void;
};

export function ArtifactToolbar({
  artifactId,
  title,
  filename,
  content,
  isMarkdown,
  canEdit,
  editing,
  resourceStatus,
  saving = false,
  onEditStart,
  onEditCancel,
  onSave,
}: ArtifactToolbarProps): JSX.Element {
  const queryClient = useQueryClient();

  const submitMutation = useMutation({
    mutationFn: () => api.submitCommunityResource(artifactId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['resource-detail', artifactId] });
      void queryClient.invalidateQueries({ queryKey: ['community-resources'] });
    },
  });

  const isPendingReview = resourceStatus === 'pending_review';

  return (
    <div className="artifact-toolbar">
      {canEdit && isMarkdown && (
        editing ? (
          <>
            <button type="button" className="artifact-toolbar__btn artifact-toolbar__btn--primary" disabled={saving || !artifactId} onClick={onSave}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              保存
            </button>
            <button type="button" className="artifact-toolbar__btn" onClick={onEditCancel}>
              <X size={14} />
              取消
            </button>
          </>
        ) : (
          <button type="button" className="artifact-toolbar__btn" disabled={!artifactId} onClick={onEditStart}>
            <Pencil size={14} />
            编辑
          </button>
        )
      )}
      {artifactId && !isPendingReview && !editing ? (
        <button
          type="button"
          className="artifact-toolbar__btn artifact-toolbar__btn--primary"
          disabled={submitMutation.isPending}
          onClick={() => submitMutation.mutate()}
        >
          {submitMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <SendHorizontal size={14} />}
          提交审核
        </button>
      ) : null}
      {isPendingReview ? <span className="artifact-toolbar__badge">审核中</span> : null}
    </div>
  );
}
