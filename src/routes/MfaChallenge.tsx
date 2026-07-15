import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { financeAsset, financeIntegration, safeInternalReturnTo } from '../config/integration';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

type ChallengeState = {
  factorId: string;
  challengeId: string;
};

export function MfaChallenge() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, loading: authLoading, refreshAuthState } = useAuth();
  const started = useRef(false);
  const [challenge, setChallenge] = useState<ChallengeState | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const returnTo = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return safeInternalReturnTo(params.get('returnTo'));
  }, [location.search]);

  useEffect(() => {
    if (authLoading || !session || started.current) return;
    started.current = true;

    async function prepareChallenge() {
      try {
        const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;

        const verifiedTotp = factorsData?.totp?.find((factor) => factor.status === 'verified');
        if (!verifiedTotp) {
          navigate('/security/setup', { replace: true });
          return;
        }

        const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aalError) throw aalError;
        if (aalData?.currentLevel === 'aal2') {
          navigate(returnTo, { replace: true });
          return;
        }

        const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
          factorId: verifiedTotp.id
        });
        if (challengeError) throw challengeError;

        setChallenge({ factorId: verifiedTotp.id, challengeId: challengeData.id });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível iniciar o desafio MFA.');
      } finally {
        setLoading(false);
      }
    }

    void prepareChallenge();
  }, [authLoading, navigate, returnTo, session]);

  if (!authLoading && !session) {
    const destination = financeIntegration.enabled
      ? `/access?returnTo=${encodeURIComponent(returnTo)}`
      : '/login';
    return <Navigate to={destination} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!challenge) return;

    setLoading(true);
    setError('');
    try {
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: challenge.factorId,
        challengeId: challenge.challengeId,
        code: code.trim()
      });
      if (verifyError) throw verifyError;

      await refreshAuthState();
      navigate(returnTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código de segurança inválido.');
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <img src={financeAsset('logo-step.png')} alt="STEP" />
          <span>Finance Control</span>
        </div>

        <form onSubmit={handleSubmit}>
          <h1>Segunda Validação</h1>
          <p>Digite o código de 6 dígitos do Authy, Google Authenticator ou Microsoft Authenticator.</p>
          <label>
            Código MFA
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              required
              autoFocus
            />
          </label>
          {error ? <div className="error-box">{error}</div> : null}
          <button className="primary-btn" disabled={loading || !challenge}>
            <KeyRound size={18} /> {loading ? 'Preparando validação...' : 'Validar token'}
          </button>
        </form>

        <div className="auth-security-list">
          <span><ShieldCheck size={16} /> A senha corporativa não é solicitada novamente</span>
          <span><ShieldCheck size={16} /> MFA obrigatório para o módulo financeiro</span>
          <span><ShieldCheck size={16} /> Aprovação do dispositivo mantida</span>
        </div>
      </section>
    </div>
  );
}
