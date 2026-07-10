import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getDeviceFingerprint } from '../lib/device';
import { useAuth } from '../context/AuthContext';
import type { ApprovedDevice } from '../types';

type GateStatus = 'checking' | 'allowed';

const setupPaths = ['/security/setup', '/security/device-check'];

export function ProtectedRoute() {
  const { session, loading, role } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [gate, setGate] = useState<GateStatus>('checking');

  useEffect(() => {
    async function runGate() {
      if (loading || !session?.user) return;
      setGate('checking');

      if (role === 'blocked') {
        navigate('/blocked', { replace: true });
        return;
      }

      const isSecuritySetupPath = setupPaths.includes(location.pathname);

      if (location.pathname !== '/security/setup') {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const hasVerifiedTotp = Boolean(factors?.totp?.some((factor) => factor.status === 'verified'));
        if (!hasVerifiedTotp) {
          navigate('/security/setup', { replace: true });
          return;
        }

        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal?.currentLevel !== 'aal2') {
          navigate('/login', { replace: true, state: { from: location } });
          return;
        }
      }

      if (!isSecuritySetupPath) {
        const fingerprint = await getDeviceFingerprint();
        const { data: device } = await supabase
          .from('approved_devices')
          .select('*')
          .eq('user_id', session.user.id)
          .eq('fingerprint_hash', fingerprint.fingerprint_hash)
          .maybeSingle<ApprovedDevice>();

        if (!device || device.status !== 'approved') {
          navigate('/security/device-check', { replace: true });
          return;
        }
      }

      setGate('allowed');
    }
    void runGate();
  }, [loading, session, role, location, navigate]);

  if (loading || gate === 'checking') return <div className="page-loader">Validando camadas de segurança...</div>;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  if (role === 'blocked') return <Navigate to="/blocked" replace />;

  return <Outlet />;
}
