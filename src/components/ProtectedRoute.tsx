import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { financeIntegration } from '../config/integration';
import { supabase } from '../lib/supabase';
import { getDeviceFingerprint } from '../lib/device';
import { useAuth } from '../context/AuthContext';
import type { ApprovedDevice } from '../types';

type GateStatus = 'checking' | 'allowed';

const securityPaths = ['/security/setup', '/security/device-check', '/security/face-enrollment'];

export function ProtectedRoute() {
  const { session, loading, role, access, accessError, requiresFaceEnrollment } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [gate, setGate] = useState<GateStatus>('checking');

  useEffect(() => {
    async function runGate() {
      if (loading || !session?.user) return;
      setGate('checking');

      if (!access || access.status === 'blocked' || access.status === 'revoked' || role === 'blocked') {
        navigate('/blocked', { replace: true });
        return;
      }

      const isSecurityPath = securityPaths.includes(location.pathname);
      const isFaceEnrollment = location.pathname === '/security/face-enrollment';

      if (location.pathname !== '/security/setup') {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const hasVerifiedTotp = Boolean(factors?.totp?.some((factor) => factor.status === 'verified'));
        if (!hasVerifiedTotp) {
          navigate('/security/setup', { replace: true });
          return;
        }

        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal?.currentLevel !== 'aal2') {
          const returnTo = requiresFaceEnrollment ? '/security/face-enrollment' : `${location.pathname}${location.search}`;
          navigate(`/security/challenge?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
          return;
        }
      }

      if (requiresFaceEnrollment && !isFaceEnrollment) {
        navigate('/security/face-enrollment', { replace: true });
        return;
      }

      if (!requiresFaceEnrollment && isFaceEnrollment) {
        navigate('/security/device-check', { replace: true });
        return;
      }

      if (!isSecurityPath) {
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
  }, [loading, session, role, access, requiresFaceEnrollment, location, navigate]);

  if (loading) return <div className="page-loader">Validando sessão e governança financeira...</div>;

  if (!session) {
    const returnTo = `${location.pathname}${location.search}`;
    const destination = financeIntegration.enabled
      ? `/access?returnTo=${encodeURIComponent(returnTo)}`
      : '/login';
    return <Navigate to={destination} replace state={{ from: location }} />;
  }

  if (!access || access.status === 'blocked' || access.status === 'revoked' || role === 'blocked') {
    return <Navigate to="/blocked" replace state={{ message: accessError }} />;
  }

  if (gate === 'checking') return <div className="page-loader">Validando MFA, biometria facial e dispositivo...</div>;

  return <Outlet />;
}
