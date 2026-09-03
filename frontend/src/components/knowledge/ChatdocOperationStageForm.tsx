import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { ChatdocIntegrationPicker } from './ChatdocIntegrationPicker';
import { ChatdocPipelineConfigPanel } from '../model-gateway/ChatdocPipelineConfigPanel';
import {
  defaultChatdocPipelineFieldEnabled,
  defaultChatdocPipelineFieldValues,
  type ChatdocPipelineStageId,
} from '../../data/chatdocPipelineFields';
import { buildChatdocStageBody } from '../../utils/chatdocPipelineConfig';

type Props = {
  stageId: ChatdocPipelineStageId;
  title: string;
  description: string;
  integrationKey: string;
  onIntegrationKeyChange: (key: string) => void;
  values: Record<string, string>;
  enabled: Record<string, boolean>;
  onValuesChange: (next: Record<string, string>) => void;
  onEnabledChange: (next: Record<string, boolean>) => void;
  showIntegrationPicker?: boolean;
  showPreview?: boolean;
};

type ChatdocOperationStageState = {
  integrationKey: string;
  setIntegrationKey: Dispatch<SetStateAction<string>>;
  values: Record<string, string>;
  setValues: Dispatch<SetStateAction<Record<string, string>>>;
  enabled: Record<string, boolean>;
  setEnabled: Dispatch<SetStateAction<Record<string, boolean>>>;
  stageBody: Record<string, unknown>;
};

export function useChatdocOperationStageState(stageId: ChatdocPipelineStageId): ChatdocOperationStageState {
  const [integrationKey, setIntegrationKey] = useState('');
  const [values, setValues] = useState(defaultChatdocPipelineFieldValues);
  const [enabled, setEnabled] = useState(defaultChatdocPipelineFieldEnabled);

  const stageBody = useMemo(
    () => buildChatdocStageBody(stageId, values, enabled),
    [stageId, values, enabled],
  );

  return {
    integrationKey,
    setIntegrationKey,
    values,
    setValues,
    enabled,
    setEnabled,
    stageBody,
  };
}

export function ChatdocOperationStageForm({
  stageId,
  title,
  description,
  integrationKey,
  onIntegrationKeyChange,
  values,
  enabled,
  onValuesChange,
  onEnabledChange,
  showIntegrationPicker = true,
  showPreview = false,
}: Props): JSX.Element {
  return (
    <div className="space-y-4">
      {showIntegrationPicker && (
        <ChatdocIntegrationPicker value={integrationKey} onChange={onIntegrationKeyChange} />
      )}
      <ChatdocPipelineConfigPanel
        stageIds={[stageId]}
        title={title}
        description={description}
        showPreview={showPreview}
        showEndpointMeta={false}
        compact
        defaultStage={stageId}
        values={values}
        enabled={enabled}
        onValuesChange={onValuesChange}
        onEnabledChange={onEnabledChange}
      />
    </div>
  );
}
