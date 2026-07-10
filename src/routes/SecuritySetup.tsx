import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Smartphone, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

type EnrollState = {
  factorId: string;
  qrCode: string;
  secret: string;
};

export function SecuritySetup() {
  const navigate = useNavigate();
  const [enroll, setEnroll] = useState<EnrollState | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function start() {
      setLoading(true);
      setError('');
      try {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const verified = factors?.totp?.find((factor) => factor.status === 'verified');
        if (verified) {
          navigate('/security/device-check');
          return;
        }

        const { data, error: enrollError } = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: 'STEP Finance Control'
        });
        if (enrollError) throw enrollError;
        setEnroll({
          factorId: data.id,
          qrCode: data.totp.qr_code,
          secret: data.totp.secret
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível iniciar MFA.');
      } finally {
        setLoading(false);
      }
    }
    start();
  }, [navigate]);

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!enroll) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: enroll.factorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: enroll.factorId,
        challengeId: challenge.id,
        code: code.trim()
      });
      if (verifyError) throw verifyError;

      setMessage('MFA ativado com sucesso. Agora vamos validar o dispositivo.');
      setTimeout(() => navigate('/security/device-check'), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="center-page">
      <section className="setup-card">
        <div className="setup-icon"><Smartphone size={34} /></div>
        <h1>Configuração obrigatória de segurança</h1>
        <p>Antes de acessar o painel financeiro, configure um autenticador. Use Authy, Google Authenticator, Microsoft Authenticator ou app compatível.</p>

        <div className="download-row">
          <a className="secondary-btn" href="https://authy.com/download/" target="_blank" rel="noreferrer">Baixar Authy</a>
          <a className="secondary-btn" href="https://support.google.com/accounts/answer/1066447" target="_blank" rel="noreferrer">Google Authenticator</a>
        </div>

        {loading && !enroll ? <div className="info-box">Gerando QR Code seguro...</div> : null}
        {enroll ? (
          <form onSubmit={verify} className="mfa-form">
            <div className="qr-box">
              <img src={enroll.qrCode} alt="QR Code MFA" />
            </div>
            <details>
              <summary>Não consigo escanear o QR Code</summary>
              <code>{enroll.secret}</code>
            </details>
            <label>
              Código gerado no aplicativo
              <input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required />
            </label>
            {error ? <div className="error-box">{error}</div> : null}
            {message ? <div className="success-box"><ShieldCheck size={16} /> {message}</div> : null}
            <button className="primary-btn" disabled={loading}>
              <KeyRound size={18} /> {loading ? 'Validando...' : 'Validar e ativar segurança'}
            </button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
