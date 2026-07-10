import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function AdminRoute() {
  const { isAdmin, loading } = useAuth();
  if (loading) return <div className="page-loader">Validando perfil...</div>;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
