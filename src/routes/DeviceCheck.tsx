import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { MonitorCheck, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getDeviceFingerprint } from '../lib/device';
import { useAuth } from '../context/AuthContext';
import type { ApprovedDevice } from '../types';

export function DeviceCheck() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'checking' | 'pending' | 'approved' | 'blocked' | 'error'>('checking');
  const [error, setError] = useState('');

  useEffect(() => {
    async function check() {
      if (!user) return;
      setStatus('checking');
      try {
        const fingerprint = await getDeviceFingerprint();
        const { data: existing } = await supabase
          .from('approved_devices')
          .select('*')
          .eq('user_id', user.id)
          .eq('fingerprint_hash', fingerprint.fingerprint_hash)
          .maybeSingle<ApprovedDevice>();

        if (!existing) {
          const { error: insertError } = await supabase.from('approved_devices').insert({
            user_id: user.id,
            fingerprint_hash: fingerprint.fingerprint_hash,
            label: `${fingerprint.platform} / ${fingerprint.browser_language}`,
            user_agent: fingerprint.user_agent,
            platform: fingerprint.platform,
            browser_language: fingerprint.browser_language,
            timezone: fingerprint.timezone,
            screen_resolution: fingerprint.screen_resolution,
            status: 'pending'
          });
          if (insertError) throw insertError;

          await supabase.from('security_events').insert({
            user_id: user.id,
            event_type: 'device.pending_created',
            level: 'warning',
            fingerprint_hash: fingerprint.fingerprint_hash,
            user_agent: fingerprint.user_agent,
            metadata: fingerprint
          });
          setStatus('pending');
          return;
        }

        if (existing.status === 'approved') {
          await supabase
            .from('approved_devices')
            .update({ last_seen_at: new Date().toISOString() })
            .eq('id', existing.id);
          setStatus('approved');
          setTimeout(() => navigate('/dashboard'), 500);
          return;
        }

        setStatus(existing.status);
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Falha na verificação do dispositivo.');
      }
    }
    check();
  }, [navigate, user]);

  if (!user) return <Navigate to="/login" replace />;

  if (status === 'approved') {
    return (
      <div className="center-page">
        <section className="setup-card">
          <MonitorCheck size={42} />
          <h1>Dispositivo aprovado</h1>
          <p>Redirecionando para o painel financeiro...</p>
        </section>
      </div>
    );
  }

  return (
    <div className="center-page">
      <section className="setup-card">
        <ShieldAlert size={42} />
        <h1>{status === 'blocked' ? 'Dispositivo bloqueado' : 'Aguardando aprovação do administrador'}</h1>
        {status === 'checking' ? <p>Coletando perfil seguro do dispositivo...</p> : null}
        {status === 'pending' ? <p>Este é um novo computador/celular. O acesso ao painel financeiro ficará bloqueado até o administrador aprovar.</p> : null}
        {status === 'blocked' ? <p>Este dispositivo foi bloqueado. Fale com o administrador.</p> : null}
        {status === 'error' ? <div className="error-box">{error}</div> : null}
      </section>
    </div>
  );
}
