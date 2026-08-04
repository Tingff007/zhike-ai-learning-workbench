import { Navigate } from 'react-router-dom';

/** @deprecated 凭证已合并至网关中心，保留路由重定向 */
export function ChatDocConfigPage(): JSX.Element {
  return <Navigate to="/admin/model-gateway?tab=knowledge" replace />;
}
