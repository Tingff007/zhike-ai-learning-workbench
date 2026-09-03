import { Navigate, Outlet } from "react-router-dom";
import { useSessionStore } from "../stores/session.store";

/**
 * 助教端权限守卫：只允许 ta 和 admin 角色访问。
 */
export function TAGate(): JSX.Element {
  const user = useSessionStore((state) => state.user);

  if (!user || (user.role !== "ta" && user.role !== "admin")) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
