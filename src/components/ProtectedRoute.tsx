import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { getDeviceFingerprint } from '../lib/device';

type GateStatus = 'checking' | 'allowed';

const freePaths = ['/security/device-check'];

export function ProtectedRoute() {
  const { session, loading, role } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [gate, setGate] = useState<GateStatus>('checking');

  useEffect(() => {
    let cancelled = false;

    async function validateDevice() {
      if (loading) return;

      if (!session?.access_token) {
        if (!cancelled) setGate('allowed');
        return;
      }

      if (role === 'blocked') {
        navigate('/blocked', { replace: true });
        return;
      }

      if (freePaths.includes(location.pathname)) {
        if (!cancelled) setGate('allowed');
        return;
      }

      if (!cancelled) setGate('checking');

      try {
        const fingerprint = await getDeviceFingerprint();
        const { data, error } = await supabase.rpc('local_get_my_device_status', {
          p_session_token: session.access_token,
          p_fingerprint_hash: fingerprint.fingerprint_hash
        });

        if (error) throw error;

        const row = Array.isArray(data) ? data[0] : data;
        const status = row?.device_status;

        if (status !== 'approved') {
          navigate('/security/device-check', { replace: true });
          return;
        }

        if (!cancelled) setGate('allowed');
      } catch (error) {
        console.error('Falha ao validar dispositivo:', error);
        navigate('/security/device-check', { replace: true });
      }
    }

    void validateDevice();

    return () => {
      cancelled = true;
    };
  }, [loading, session, role, location.pathname, navigate]);

  if (loading) return <div className="page-loader">Validando sessão local...</div>;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  if (role === 'blocked') return <Navigate to="/blocked" replace />;
  if (gate === 'checking') return <div className="page-loader">Validando dispositivo autorizado...</div>;

  return <Outlet />;
}
