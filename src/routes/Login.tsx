import { FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Fingerprint, KeyRound, LockKeyhole, Monitor, Shield, ShieldCheck, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getDeviceFingerprint } from '../lib/device';

const ADMIN_EMAIL = 'douglas.tabella@step-og.com';

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const redirectTo = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/dashboard';

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const device = await getDeviceFingerprint();
      const result = await login(email, password, device);

      if (result.device_status === 'pending') {
        navigate('/security/device-check', { replace: true });
        return;
      }

      navigate(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login.');
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
              Login local controlado pelo administrador, sessão protegida,
              aprovação de dispositivo e auditoria completa dos acessos.
            </p>
          </div>

          <div className="secure-layer-grid">
            <div>
              <LockKeyhole size={20} />
              <strong>1º Login Local</strong>
              <span>Usuário criado somente pelo administrador</span>
            </div>
            <div>
              <KeyRound size={20} />
              <strong>2º Senha com hash</strong>
              <span>A senha não fica salva em texto aberto</span>
            </div>
            <div>
              <Monitor size={20} />
              <strong>3º Dispositivo</strong>
              <span>Primeiro acesso liberado pelo administrador</span>
            </div>
            <div>
              <Fingerprint size={20} />
              <strong>4º Auditoria</strong>
              <span>Logs completos de login, sessão e bloqueios</span>
            </div>
          </div>

          <div className="secure-admin-stamp">
            <UserCheck size={18} />
            <span>Administrador inicial: <b>douglas.tabella@step-og.com</b></span>
          </div>
        </aside>

        <section className="secure-login-card">
          <div className="secure-login-top">
            <span className="secure-status-pill">
              <Shield size={15} /> Acesso restrito
            </span>
          </div>

          <form onSubmit={handleLogin} className="secure-login-form">
            <div>
              <h2>Entrar no Cofre Financeiro</h2>
              <p>
                O painel só será liberado para usuários criados pelo administrador
                e dispositivos autorizados.
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
              <LockKeyhole size={18} /> {loading ? 'Validando acesso...' : 'Entrar com segurança'}
            </button>
          </form>

          <div className="secure-checklist">
            <span><ShieldCheck size={16} /> Cadastro local fechado</span>
            <span><ShieldCheck size={16} /> Novos usuários só pelo administrador</span>
            <span><ShieldCheck size={16} /> Dispositivo precisa ser aprovado</span>
            <span><ShieldCheck size={16} /> Alterações financeiras auditadas</span>
          </div>
        </section>
      </div>
    </div>
  );
}
