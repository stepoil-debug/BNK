import { FormEvent, useEffect, useState } from 'react';
import { CheckCircle2, PlusCircle, ShieldAlert, UserPlus, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { ApprovedDevice, UserRole } from '../types';

type LocalUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  status: string;
  created_at: string;
};

export function SecurityAdmin() {
  const { session } = useAuth();
  const [devices, setDevices] = useState<ApprovedDevice[]>([]);
  const [users, setUsers] = useState<LocalUserRow[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [newUser, setNewUser] = useState({
    email: '',
    full_name: '',
    password: '',
    role: 'finance_viewer' as UserRole
  });

  async function load() {
    if (!session?.access_token) return;
    setLoading(true);

    const [{ data: deviceData }, { data: eventData }, { data: userData }] = await Promise.all([
      supabase.rpc('local_list_devices', { p_session_token: session.access_token }),
      supabase.rpc('local_list_security_events', { p_session_token: session.access_token }),
      supabase.rpc('local_list_users', { p_session_token: session.access_token })
    ]);

    setDevices((deviceData as ApprovedDevice[]) ?? []);
    setEvents(eventData ?? []);
    setUsers((userData as LocalUserRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [session?.access_token]);

  async function updateDevice(device: ApprovedDevice, status: 'approved' | 'blocked') {
    if (!session?.access_token) return;

    const { error } = await supabase.rpc('local_update_device_status', {
      p_session_token: session.access_token,
      p_device_id: device.id,
      p_status: status
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(status === 'approved' ? 'Dispositivo aprovado.' : 'Dispositivo bloqueado.');
    await load();
  }

  async function createUser(event: FormEvent) {
    event.preventDefault();
    if (!session?.access_token) return;

    const { error } = await supabase.rpc('local_admin_create_user', {
      p_session_token: session.access_token,
      p_email: newUser.email,
      p_password: newUser.password,
      p_full_name: newUser.full_name,
      p_role: newUser.role
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage('Usuário criado com sucesso.');
    setNewUser({ email: '', full_name: '', password: '', role: 'finance_viewer' });
    await load();
  }

  if (loading) return <div className="page-loader">Carregando segurança...</div>;

  return (
    <div className="dashboard-grid">
      {message ? <div className="success-box full-row">{message}</div> : null}

      <section className="panel table-panel large-panel">
        <div className="panel-head">
          <div><h2>Cadastrar novo usuário</h2><p>Somente administradores podem criar acessos locais</p></div>
          <span className="status-pill"><UserPlus size={14} /> Cadastro local</span>
        </div>

        <form className="inline-form" onSubmit={createUser}>
          <label>
            Nome
            <input value={newUser.full_name} onChange={(e) => setNewUser((prev) => ({ ...prev, full_name: e.target.value }))} required />
          </label>
          <label>
            E-mail
            <input type="email" value={newUser.email} onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))} required />
          </label>
          <label>
            Senha provisória
            <input type="password" value={newUser.password} onChange={(e) => setNewUser((prev) => ({ ...prev, password: e.target.value }))} minLength={8} required />
          </label>
          <label>
            Perfil
            <select value={newUser.role} onChange={(e) => setNewUser((prev) => ({ ...prev, role: e.target.value as UserRole }))}>
              <option value="admin">Administrador</option>
              <option value="finance_editor">Financeiro Editor</option>
              <option value="finance_viewer">Financeiro Visualizador</option>
              <option value="auditor">Auditor</option>
            </select>
          </label>
          <button className="primary-btn"><PlusCircle size={18} /> Criar usuário</button>
        </form>
      </section>

      <section className="panel table-panel">
        <div className="panel-head">
          <div><h2>Usuários locais</h2><p>Acessos criados dentro do sistema</p></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th></tr></thead>
            <tbody>
              {users.map((item) => (
                <tr key={item.id}>
                  <td>{item.full_name}</td>
                  <td>{item.email}</td>
                  <td>{item.role}</td>
                  <td><span className={`status-dot ${item.status}`}>{item.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

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
            <article key={event.id} className={`event-card ${event.level || event.severity}`}>
              <strong>{event.event_type}</strong>
              <span>{new Date(event.created_at).toLocaleString('pt-BR')}</span>
              <p>{event.message || JSON.stringify(event.metadata)}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
