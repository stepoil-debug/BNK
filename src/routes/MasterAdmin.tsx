import { FormEvent, useEffect, useState } from 'react';
import { Crown, KeyRound, ShieldAlert, UserCog } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { FinanceAccess } from '../types';

export function MasterAdmin() {
  const { access, canManageMaster } = useAuth();
  const [users, setUsers] = useState<FinanceAccess[]>([]);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [intranetUserId, setIntranetUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    const { data, error: functionError } = await supabase.functions.invoke('finance-access-control', {
      body: { action: 'list' }
    });
    if (functionError) setError(functionError.message);
    else setUsers(((data as { users?: FinanceAccess[] })?.users ?? []));
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function assignMaster(event: FormEvent) {
    event.preventDefault();
    if (!canManageMaster) return;

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { data, error: functionError } = await supabase.functions.invoke('finance-access-control', {
        body: {
          action: 'assign_master',
          corporate_email: email,
          full_name: fullName,
          intranet_user_id: intranetUserId || null
        }
      });
      if (functionError) throw functionError;
      const payload = data as { access?: FinanceAccess; message?: string };
      if (!payload.access) throw new Error(payload.message || 'Não foi possível definir o Administrador Master.');

      setMessage(`${payload.access.full_name || payload.access.corporate_email} foi definido como Administrador Master.`);
      setEmail('');
      setFullName('');
      setIntranetUserId('');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao definir o Administrador Master.');
    } finally {
      setSaving(false);
    }
  }

  const master = users.find((user) => user.role === 'master_admin' && user.status !== 'revoked');

  if (!canManageMaster || access?.role !== 'owner') {
    return <div className="empty-state"><ShieldAlert size={42} /><h2>Área exclusiva do Proprietário</h2><p>Esta opção não está disponível para o seu perfil.</p></div>;
  }

  return (
    <div className="governance-page">
      <section className="panel governance-hero">
        <div className="governance-icon owner"><Crown size={30} /></div>
        <div>
          <span className="eyebrow">Governança máxima</span>
          <h2>Administrador Master</h2>
          <p>Somente o Proprietário do Financeiro pode visualizar esta página, nomear ou substituir o Administrador Master.</p>
        </div>
        <span className="status-pill"><KeyRound size={15} /> Controle exclusivo</span>
      </section>

      {message ? <div className="success-box">{message}</div> : null}
      {error ? <div className="error-box">{error}</div> : null}

      <div className="governance-grid">
        <section className="panel">
          <div className="panel-head"><div><h2>Administrador atual</h2><p>Responsável pela concessão operacional dos usuários financeiros</p></div></div>
          {loading ? <div className="page-loader">Consultando governança...</div> : master ? (
            <article className="master-current-card">
              <div className="avatar-badge"><UserCog size={20} /></div>
              <div>
                <strong>{master.full_name || master.corporate_email}</strong>
                <span>{master.corporate_email}</span>
                <small>Biometria: {master.biometric_status} • Acesso: {master.status}</small>
              </div>
            </article>
          ) : (
            <div className="info-box">Nenhum Administrador Master foi definido. Até a nomeação, somente o Proprietário pode administrar acessos.</div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head"><div><h2>{master ? 'Substituir Administrador Master' : 'Definir Administrador Master'}</h2><p>A substituição bloqueia o Administrador Master anterior automaticamente</p></div></div>
          <form className="governance-form" onSubmit={assignMaster}>
            <label>Nome completo<input value={fullName} onChange={(event) => setFullName(event.target.value)} required /></label>
            <label>E-mail corporativo<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label>UUID do usuário na Intranet <small>Opcional até a conexão do Supabase principal</small><input value={intranetUserId} onChange={(event) => setIntranetUserId(event.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /></label>
            <div className="warning-box">A pessoa nomeada poderá conceder acesso de visualização, edição ou auditoria, mas nunca poderá nomear outro Administrador Master nem alterar o Proprietário.</div>
            <button className="primary-btn" disabled={saving}>{saving ? 'Aplicando governança...' : master ? 'Substituir Administrador Master' : 'Definir Administrador Master'}</button>
          </form>
        </section>
      </div>
    </div>
  );
}
