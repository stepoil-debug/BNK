import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute() {
  const { session, loading, role } = useAuth();
  const location = useLocation();

  if (loading) return <div className="page-loader">Validando sessão local...</div>;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  if (role === 'blocked') return <Navigate to="/blocked" replace />;

  return <Outlet />;
}
