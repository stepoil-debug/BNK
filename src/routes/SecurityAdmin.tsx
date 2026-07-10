import { useEffect, useState } from 'react';
import { CheckCircle2, ShieldAlert, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { ApprovedDevice } from '../types';

export function SecurityAdmin() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<ApprovedDevice[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true);
    const [{ data: deviceData }, { data: eventData }] = await Promise.all([
      supabase.from('approved_devices').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('security_events').select('*').order('created_at', { ascending: false }).limit(50)
    ]);
    setDevices((deviceData as ApprovedDevice[]) ?? []);
    setEvents(eventData ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function updateDevice(device: ApprovedDevice, status: 'approved' | 'blocked') {
    const payload = status === 'approved'
      ? { status, approved_by: user?.id, approved_at: new Date().toISOString() }
      : { status };

    await supabase.from('approved_devices').update(payload).eq('id', device.id);
    await supabase.from('security_events').insert({
      user_id: device.user_id,
      event_type: `device.${status}`,
      level: status === 'approved' ? 'info' : 'critical',
      fingerprint_hash: device.fingerprint_hash,
      user_agent: device.user_agent,
      metadata: { device_id: device.id, approved_by: user?.id }
    });
    setMessage(status === 'approved' ? 'Dispositivo aprovado.' : 'Dispositivo bloqueado.');
    await load();
  }

  if (loading) return <div className="page-loader">Carregando segurança...</div>;

  return (
    <div className="dashboard-grid">
      {message ? <div className="success-box full-row">{message}</div> : null}
      <section className="panel table-panel large-panel">
        <div className="panel-head">
          <div><h2>Dispositivos</h2><p>Aprovação manual obrigatória no primeiro acesso</p></div>
          <span className="status-pill"><ShieldAlert size={14} /> Acesso reforçado</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Status</th><th>Usuário</th><th>Dispositivo</th><th>Timezone</th><th>Último acesso</th><th>Ações</th></tr></thead>
            <tbody>
              {devices.map((device) => (
                <tr key={device.id}>
                  <td><span className={`status-dot ${device.status}`}>{device.status}</span></td>
                  <td>{device.user_id.slice(0, 8)}...</td>
                  <td><strong>{device.platform}</strong><br/><small>{device.screen_resolution}</small></td>
                  <td>{device.timezone}</td>
                  <td>{device.last_seen_at ? new Date(device.last_seen_at).toLocaleString('pt-BR') : '-'}</td>
                  <td className="action-cell">
                    {device.status !== 'approved' ? <button className="icon-btn ok" onClick={() => updateDevice(device, 'approved')}><CheckCircle2 size={18} /></button> : null}
                    {device.status !== 'blocked' ? <button className="icon-btn danger" onClick={() => updateDevice(device, 'blocked')}><XCircle size={18} /></button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel table-panel">
        <div className="panel-head"><div><h2>Eventos de segurança</h2><p>Últimas ações registradas</p></div></div>
        <div className="event-list">
          {events.map((event) => (
            <article key={event.id} className={`event-card ${event.level}`}>
              <strong>{event.event_type}</strong>
              <span>{new Date(event.created_at).toLocaleString('pt-BR')}</span>
              <small>{event.user_agent || 'Sem user-agent'}</small>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
