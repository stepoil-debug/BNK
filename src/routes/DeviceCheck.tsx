import { useEffect, useState } from 'react';
import { MonitorCheck, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { getDeviceFingerprint } from '../lib/device';

export function DeviceCheck() {
  const { session, user, refreshAuthState } = useAuth();
  const [status, setStatus] = useState<string>('pending');
  const [message, setMessage] = useState('Aguardando aprovação do administrador.');

  useEffect(() => {
    async function load() {
      if (!session?.access_token || !user?.id) return;

      const fingerprint = await getDeviceFingerprint();
      const { data } = await supabase.rpc('local_get_my_device_status', {
        p_session_token: session.access_token,
        p_fingerprint_hash: fingerprint.fingerprint_hash
      });

      const row = Array.isArray(data) ? data[0] : data;
      setStatus(row?.device_status ?? 'pending');

      if (row?.device_status === 'approved') {
        setMessage('Dispositivo aprovado. Atualize a sessão para continuar.');
        await refreshAuthState();
      } else if (row?.device_status === 'blocked') {
        setMessage('Este dispositivo foi bloqueado. Fale com o administrador.');
      } else {
        setMessage('Este dispositivo está pendente de aprovação.');
      }
    }

    void load();
  }, [session, user, refreshAuthState]);

  return (
    <main className="center-page">
      <section className="setup-card">
        <div className="setup-icon">
          {status === 'blocked' ? <ShieldAlert /> : <MonitorCheck />}
        </div>
        <h1>Dispositivo em validação</h1>
        <p>{message}</p>
        <p>
          Por segurança, o primeiro acesso de cada computador ou celular precisa
          ser liberado pelo administrador.
        </p>
      </section>
    </main>
  );
}
