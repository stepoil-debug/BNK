import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyRound, RotateCcw, ShieldCheck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { financeIntegration, financeAsset, safeInternalReturnTo } from '../config/integration';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

type BootstrapPayload = {
  token_hash?: string;
  message?: string;
  code?: string;
};

export function IntranetAccess() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, loading: authLoading, refreshAuthState } = useAuth();
  const started = useRef(false);
  const [working, setWorking] = useState(true);
  const [error, setError] = useState('');

  const returnTo = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return safeInternalReturnTo(params.get('returnTo'));
  }, [location.search]);

  const bootstrap = useCallback(async () => {
    setWorking(true);
    setError('');

    try {
      const response = await fetch(financeIntegration.bootstrapUrl, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ permission: financeIntegration.permission })
      });

      const payload = (await response.json().catch(() => ({}))) as BootstrapPayload;
      if (!response.ok) {
        throw new Error(payload.message || 'Seu acesso ao Controle Bancário não foi autorizado pela Intranet.');
      }
      if (!payload.token_hash) {
        throw new Error('A Intranet não retornou o token temporário de acesso ao financeiro.');
      }

      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: payload.token_hash,
        type: 'magiclink'
      });
      if (verifyError) throw verifyError;

      await refreshAuthState();
      navigate(returnTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível validar o acesso financeiro.');
      setWorking(false);
    }
  }, [navigate, refreshAuthState, returnTo]);

  useEffect(() => {
    if (authLoading) return;
    if (session) {
      navigate(returnTo, { replace: true });
      return;
    }
    if (started.current) return;
    started.current = true;
    void bootstrap();
  }, [authLoading, bootstrap, navigate, returnTo, session]);

  function retry() {
    started.current = true;
    void bootstrap();
  }

  return (
    <div className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <img src={financeAsset('logo-step.png')} alt="STEP" />
          <span>Finance Control</span>
        </div>

        <div>
          <h1>Validação Financeira</h1>
          <p>
            Sua sessão corporativa está sendo validada. Não é necessário informar novamente o usuário e a senha da Intranet.
          </p>
        </div>

        {working || authLoading ? (
          <div className="page-loader">
            <KeyRound size={20} /> Validando permissão e emitindo token temporário...
          </div>
        ) : null}

        {error ? (
          <>
            <div className="error-box">{error}</div>
            <button className="primary-btn" type="button" onClick={retry}>
              <RotateCcw size={18} /> Tentar novamente
            </button>
          </>
        ) : null}

        <div className="auth-security-list">
          <span><ShieldCheck size={16} /> Permissão exigida: financeiro:controle-bancario</span>
          <span><ShieldCheck size={16} /> Token temporário de uso único</span>
          <span><ShieldCheck size={16} /> MFA e dispositivo aprovado permanecem obrigatórios</span>
        </div>
      </section>
    </div>
  );
}
