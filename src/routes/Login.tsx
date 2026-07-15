import { FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { financeAsset } from '../config/integration';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

type MfaState = {
  factorId: string;
  challengeId: string;
  email: string;
};

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshAuthState } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfa, setMfa] = useState<MfaState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const redirectTo = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/dashboard';

  async function afterPasswordLogin() {
    const { data: factorsData } = await supabase.auth.mfa.listFactors();
    const verifiedTotp = factorsData?.totp?.find((factor) => factor.status === 'verified');

    if (!verifiedTotp) {
      navigate('/security/setup');
      return;
    }

    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalData?.currentLevel === 'aal2') {
      await refreshAuthState();
      navigate(redirectTo);
      return;
    }

    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: verifiedTotp.id });
    if (challengeError) throw challengeError;

    setMfa({ factorId: verifiedTotp.id, challengeId: challengeData.id, email });
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      await afterPasswordLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login.');
    } finally {
      setLoading(false);
    }
  }

  async function handleMfa(event: FormEvent) {
    event.preventDefault();
    if (!mfa) return;
    setLoading(true);
    setError('');
    try {
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfa.factorId,
        challengeId: mfa.challengeId,
        code: mfaCode.trim()
      });
      if (verifyError) throw verifyError;
      await refreshAuthState();
      navigate(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido.');
    } finally {
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

        {!mfa ? (
          <form onSubmit={handleLogin}>
            <h1>Acesso Restrito</h1>
            <p>Entre com seu usuário autorizado. O painel só será liberado após MFA e aprovação do dispositivo.</p>
            <label>
              E-mail
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              Senha
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            {error ? <div className="error-box">{error}</div> : null}
            <button className="primary-btn" disabled={loading}>
              <LockKeyhole size={18} /> {loading ? 'Validando...' : 'Entrar'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleMfa}>
            <h1>Token de Segurança</h1>
            <p>Digite o código de 6 dígitos do Authy, Google Authenticator ou Microsoft Authenticator.</p>
            <label>
              Código MFA
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} required />
            </label>
            {error ? <div className="error-box">{error}</div> : null}
            <button className="primary-btn" disabled={loading}>
              <KeyRound size={18} /> {loading ? 'Verificando...' : 'Validar token'}
            </button>
          </form>
        )}

        <div className="auth-security-list">
          <span><ShieldCheck size={16} /> Login fechado por convite</span>
          <span><ShieldCheck size={16} /> MFA obrigatório</span>
          <span><ShieldCheck size={16} /> Dispositivo aprovado pelo admin</span>
        </div>
      </section>
    </div>
  );
}
