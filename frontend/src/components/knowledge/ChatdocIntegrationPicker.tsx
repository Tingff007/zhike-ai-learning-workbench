import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import type { ChatdocConfigView } from '../../types';

type Props = {
  value: string;
  onChange: (integrationKey: string) => void;
  className?: string;
  label?: string;
  hint?: string;
};

function optionLabel(item: ChatdocConfigView): string {
  const name = item.template_label || item.integration_key || item.template_key || '未命名';
  const configured = item.configured ? '' : '（未配置凭证）';
  const active = item.active_integration_key === item.integration_key ? ' · 默认' : '';
  return `${name}${active}${configured}`;
}

export function ChatdocIntegrationPicker({
  value,
  onChange,
  className = '',
  label = '知识库接入',
  hint = '选择用哪个讯飞账号；密钥在网关中心配置。',
}: Props): JSX.Element {
  const instancesQuery = useQuery({
    queryKey: ['chatdoc-config-instances'],
    queryFn: () => api.listChatdocConfigInstances(),
    staleTime: 60_000,
  });

  const items = instancesQuery.data?.items ?? [];
  const activeKey = instancesQuery.data?.active_integration_key ?? items[0]?.integration_key ?? '';

  useEffect(() => {
    if (!value && activeKey) onChange(activeKey);
  }, [value, activeKey, onChange]);

  return (
    <label className={`block text-xs text-slate-500 ${className}`.trim()}>
      {label}
      <select
        className="input mt-1 h-9 w-full text-sm"
        value={value || activeKey}
        onChange={(event) => onChange(event.target.value)}
        disabled={instancesQuery.isLoading || items.length === 0}
      >
        {items.length === 0 ? (
          <option value="">暂无已添加的供应商</option>
        ) : (
          items.map((item) => (
            <option key={item.integration_key} value={item.integration_key ?? ''}>
              {optionLabel(item)}
            </option>
          ))
        )}
      </select>
      {hint && <span className="mt-1 block text-[11px] leading-5 text-slate-400">{hint}</span>}
    </label>
  );
}
