import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function AdminRoute() {
  const { canManageUsers, loading } = useAuth();
  if (loading) return <div className="page-loader">Validando governança financeira...</div>;
  if (!canManageUsers) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
