import { FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Fingerprint, KeyRound, LockKeyhole, Monitor, Shield, ShieldCheck, UserCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

type MfaState = {
  factorId: string;
  challengeId: string;
  email: string;
};

const ADMIN_EMAIL = 'douglas.tabella@step-og.com';

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshAuthState } = useAuth();
  const [email, setEmail] = useState(ADMIN_EMAIL);
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
    <div className="secure-auth-page">
      <div className="secure-auth-shell">
        <aside className="secure-auth-panel">
          <div className="secure-logo-block">
            <img src="/logo-step.png" alt="STEP Integrated Solutions" />
            <div>
              <strong>STEP BANK</strong>
              <span>Cofre financeiro corporativo</span>
            </div>
          </div>

          <div className="secure-headline">
            <div className="secure-icon-orbit">
              <ShieldCheck size={42} />
            </div>
            <h1>Acesso blindado ao painel financeiro</h1>
            <p>
              Ambiente isolado, autenticação em camadas, aprovação de dispositivo
              e auditoria completa para proteger os dados bancários da STEP.
            </p>
          </div>

          <div className="secure-layer-grid">
            <div>
              <LockKeyhole size={20} />
              <strong>1º Login</strong>
              <span>E-mail autorizado e senha forte</span>
            </div>
            <div>
              <KeyRound size={20} />
              <strong>2º Token MFA</strong>
              <span>Authy, Google ou Microsoft Authenticator</span>
            </div>
            <div>
              <Monitor size={20} />
              <strong>3º Dispositivo</strong>
              <span>Primeiro acesso liberado pelo administrador</span>
            </div>
            <div>
              <Fingerprint size={20} />
              <strong>4º Biometria</strong>
              <span>Passkey, Face ID, Touch ID ou Windows Hello</span>
            </div>
          </div>

          <div className="secure-admin-stamp">
            <UserCheck size={18} />
            <span>Administrador inicial configurado: <b>douglas.tabella@step-og.com</b></span>
          </div>
        </aside>

        <section className="secure-login-card">
          <div className="secure-login-top">
            <span className="secure-status-pill">
              <Shield size={15} /> Acesso restrito
            </span>
          </div>

          {!mfa ? (
            <form onSubmit={handleLogin} className="secure-login-form">
              <div>
                <h2>Entrar no Cofre Financeiro</h2>
                <p>
                  O painel só será liberado após validação do token MFA e aprovação
                  do dispositivo cadastrado.
                </p>
              </div>

              <label>
                E-mail corporativo
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>

              <label>
                Senha
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  required
                />
              </label>

              {error ? <div className="error-box">{error}</div> : null}

              <button className="secure-primary-btn" disabled={loading}>
                <LockKeyhole size={18} /> {loading ? 'Validando credenciais...' : 'Entrar com segurança'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleMfa} className="secure-login-form">
              <div>
                <h2>Token de Segurança</h2>
                <p>Digite o código de 6 dígitos gerado no seu aplicativo autenticador.</p>
              </div>

              <label>
                Código MFA
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  placeholder="000000"
                  required
                />
              </label>

              {error ? <div className="error-box">{error}</div> : null}

              <button className="secure-primary-btn" disabled={loading}>
                <KeyRound size={18} /> {loading ? 'Verificando token...' : 'Validar token'}
              </button>
            </form>
          )}

          <div className="secure-checklist">
            <span><ShieldCheck size={16} /> Cadastro fechado por convite</span>
            <span><ShieldCheck size={16} /> MFA obrigatório para todos</span>
            <span><ShieldCheck size={16} /> Dispositivo precisa ser aprovado</span>
            <span><ShieldCheck size={16} /> Alterações financeiras auditadas</span>
          </div>
        </section>
      </div>
    </div>
  );
}
