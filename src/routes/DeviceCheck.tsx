import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, MonitorCheck, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { getDeviceFingerprint } from '../lib/device';

export function DeviceCheck() {
  const { session, user, refreshAuthState } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>('pending');
  const [message, setMessage] = useState('Aguardando aprovação do administrador.');
  const [checking, setChecking] = useState(false);

  async function checkDevice() {
    if (!session?.access_token || !user?.id) return;

    setChecking(true);

    try {
      const fingerprint = await getDeviceFingerprint();
      const { data, error } = await supabase.rpc('local_get_my_device_status', {
        p_session_token: session.access_token,
        p_fingerprint_hash: fingerprint.fingerprint_hash
      });

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      const nextStatus = row?.device_status ?? 'pending';
      setStatus(nextStatus);

      if (nextStatus === 'approved') {
        setMessage('Dispositivo aprovado. Redirecionando para o dashboard...');
        await refreshAuthState();
        setTimeout(() => navigate('/dashboard', { replace: true }), 800);
      } else if (nextStatus === 'blocked') {
        setMessage('Este dispositivo foi bloqueado. Fale com o administrador.');
      } else {
        setMessage('Este dispositivo está pendente de aprovação.');
      }
    } catch (error) {
      console.error('Falha ao verificar dispositivo:', error);
      setMessage('Não foi possível verificar o dispositivo. Atualize a página ou faça login novamente.');
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    void checkDevice();

    const interval = window.setInterval(() => {
      void checkDevice();
    }, 7000);

    return () => window.clearInterval(interval);
  }, [session?.access_token, user?.id]);

  const approved = status === 'approved';
  const blocked = status === 'blocked';

  return (
    <main className="center-page">
      <section className="setup-card">
        <div className="setup-icon">
          {approved ? <CheckCircle2 /> : blocked ? <ShieldAlert /> : <MonitorCheck />}
        </div>
        <h1>{approved ? 'Dispositivo aprovado' : 'Dispositivo em validação'}</h1>
        <p>{message}</p>
        <p>
          Por segurança, o primeiro acesso de cada computador ou celular precisa
          ser liberado pelo administrador.
        </p>

        <div className="download-row">
          <button className="secondary-btn" onClick={() => void checkDevice()} disabled={checking}>
            {checking ? 'Verificando...' : 'Verificar novamente'}
          </button>
          {approved ? <Link className="primary-btn" to="/dashboard">Ir para o dashboard</Link> : null}
          {blocked ? <Link className="secondary-btn" to="/login">Voltar ao login</Link> : null}
        </div>
      </section>
    </main>
  );
}
