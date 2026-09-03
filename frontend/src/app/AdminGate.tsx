import { Navigate, Outlet } from 'react-router-dom';
import { useSessionStore } from '../stores/session.store';

export function AdminGate(): JSX.Element {
  const user = useSessionStore((state) => state.user);

  if (user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
