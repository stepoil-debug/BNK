import { FormEvent, useEffect, useState } from 'react';
import { Ban, CheckCircle2, Eye, PencilLine, RotateCcw, ShieldCheck, UserPlus, UsersRound, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { FinanceAccess, FinanceAccessRole } from '../types';

const roleLabels: Record<FinanceAccessRole, string> = {
  owner: 'Proprietário',
  master_admin: 'Administrador Master',
  editor: 'Edição financeira',
  viewer: 'Somente visualização',
  auditor: 'Auditoria'
};

export function FinanceUsers() {
  const { access, canManageUsers } = useAuth();
  const [users, setUsers] = useState<FinanceAccess[]>([]);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [intranetUserId, setIntranetUserId] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer' | 'auditor'>('viewer');
  const [reason, setReason] = useState('Acesso autorizado ao módulo de Controle Bancário');
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

  async function grant(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { data, error: functionError } = await supabase.functions.invoke('finance-access-control', {
        body: {
          action: 'grant_access',
          corporate_email: email,
          full_name: fullName,
          intranet_user_id: intranetUserId,
          role,
          reason
        }
      });
      if (functionError) throw functionError;
      const granted = (data as { access?: FinanceAccess; message?: string })?.access;
      if (!granted) throw new Error('A concessão não foi confirmada pelo servidor.');

      setMessage(`${granted.full_name || granted.corporate_email} foi autorizado. O cadastro facial será exigido no primeiro acesso.`);
      setEmail('');
      setFullName('');
      setIntranetUserId('');
      setRole('viewer');
      await load();
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : 'Não foi possível conceder o acesso.');
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(user: FinanceAccess, status: 'active' | 'blocked' | 'revoked' | 'pending_face') {
    const operationReason = window.prompt('Informe o motivo desta alteração de acesso:');
    if (!operationReason) return;

    setError('');
    setMessage('');
    const { data, error: functionError } = await supabase.functions.invoke('finance-access-control', {
      body: {
        action: 'change_status',
        target_finance_user_id: user.finance_user_id,
        status,
        reason: operationReason
      }
    });

    if (functionError) {
      setError(functionError.message);
      return;
    }
    const updated = (data as { access?: FinanceAccess })?.access;
    setMessage(`Acesso de ${updated?.full_name || user.full_name || user.corporate_email} atualizado para ${status}.`);
    await load();
  }

  if (!canManageUsers) {
    return <div className="empty-state"><Ban size={42} /><h2>Gestão financeira restrita</h2><p>Administradores comuns, editores e visualizadores não podem acessar esta área.</p></div>;
  }

  return (
    <div className="governance-page">
      <section className="panel governance-hero">
        <div className="governance-icon"><UsersRound size={30} /></div>
        <div>
          <span className="eyebrow">Controle rigoroso</span>
          <h2>Usuários do Financeiro</h2>
          <p>As concessões são independentes das permissões administrativas da Intranet e exigem cadastro facial no primeiro acesso.</p>
        </div>
        <span className="status-pill"><ShieldCheck size={15} /> {access?.role === 'owner' ? 'Proprietário' : 'Administrador Master'}</span>
      </section>

      {message ? <div className="success-box">{message}</div> : null}
      {error ? <div className="error-box">{error}</div> : null}

      <section className="panel">
        <div className="panel-head"><div><h2>Conceder acesso</h2><p>Somente usuários existentes no Supabase principal da Intranet podem ser autorizados</p></div></div>
        <form className="access-grant-form" onSubmit={grant}>
          <label>Nome completo<input value={fullName} onChange={(event) => setFullName(event.target.value)} required /></label>
          <label>E-mail corporativo<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>UUID do usuário no Supabase principal<input value={intranetUserId} onChange={(event) => setIntranetUserId(event.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" required pattern="[0-9a-fA-F-]{36}" /></label>
          <label>Perfil financeiro
            <select value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
              <option value="viewer">Somente visualização</option>
              <option value="editor">Edição financeira</option>
              <option value="auditor">Auditoria</option>
            </select>
          </label>
          <label className="grant-reason">Motivo da concessão<textarea value={reason} onChange={(event) => setReason(event.target.value)} required /></label>
          <button className="primary-btn" disabled={saving}><UserPlus size={18} /> {saving ? 'Autorizando...' : 'Conceder acesso financeiro'}</button>
        </form>
      </section>

      <section className="panel table-panel large-panel">
        <div className="panel-head"><div><h2>Acessos financeiros</h2><p>Lista armazenada exclusivamente no BNK</p></div><span className="panel-tag">{users.length} registros</span></div>
        {loading ? <div className="page-loader">Carregando usuários...</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Usuário</th><th>Perfil</th><th>Acesso</th><th>Biometria</th><th>Último acesso</th><th>Ações</th></tr></thead>
              <tbody>
                {users.map((user) => {
                  const protectedRole = user.role === 'owner' || (user.role === 'master_admin' && access?.role !== 'owner');
                  return (
                    <tr key={user.id}>
                      <td><strong>{user.full_name || user.corporate_email}</strong><br/><small>{user.corporate_email}</small></td>
                      <td><span className={`role-badge role-${user.role}`}>{roleLabels[user.role]}</span></td>
                      <td><span className={`status-dot ${user.status}`}>{user.status}</span></td>
                      <td><span className={`status-dot ${user.biometric_status === 'active' ? 'approved' : 'pending'}`}>{user.biometric_status}</span></td>
                      <td>{user.last_access_at ? new Date(user.last_access_at).toLocaleString('pt-BR') : '-'}</td>
                      <td className="action-cell">
                        {protectedRole ? <span title="Perfil protegido pela governança"><ShieldCheck size={19} aria-label="Perfil protegido" /></span> : (
                          <>
                            {user.status === 'blocked' ? <button className="icon-btn ok" title="Reativar" onClick={() => void changeStatus(user, user.biometric_status === 'active' ? 'active' : 'pending_face')}><RotateCcw size={18} /></button> : null}
                            {user.status !== 'blocked' && user.status !== 'revoked' ? <button className="icon-btn danger" title="Bloquear" onClick={() => void changeStatus(user, 'blocked')}><XCircle size={18} /></button> : null}
                            {user.status !== 'revoked' ? <button className="icon-btn neutral" title="Revogar" onClick={() => void changeStatus(user, 'revoked')}><Ban size={18} /></button> : null}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="access-role-legend">
        <article><Eye size={20} /><strong>Visualização</strong><span>Consulta sem alterar dados.</span></article>
        <article><PencilLine size={20} /><strong>Edição</strong><span>Inclui e atualiza dados financeiros.</span></article>
        <article><CheckCircle2 size={20} /><strong>Auditoria</strong><span>Consulta registros e trilhas de controle.</span></article>
      </section>
    </div>
  );
}
