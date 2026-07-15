import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function OwnerRoute() {
  const { canManageMaster, access, loading } = useAuth();
  if (loading) return <div className="page-loader">Validando propriedade financeira...</div>;
  if (!canManageMaster || access?.role !== 'owner') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
