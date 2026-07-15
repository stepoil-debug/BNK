import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  Crown,
  FileUp,
  History,
  LayoutDashboard,
  LogOut,
  Shield,
  UsersRound,
  WalletCards
} from 'lucide-react';
import { financeAsset, financeIntegration } from '../config/integration';
import { useAuth } from '../context/AuthContext';
import type { FinanceAccessRole } from '../types';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/position/new', label: 'Nova Posição', icon: WalletCards },
  { to: '/history', label: 'Histórico', icon: History },
  { to: '/imports', label: 'Importações', icon: FileUp },
  { to: '/reports', label: 'Relatórios', icon: BarChart3 },
  { to: '/access-management', label: 'Usuários Financeiros', icon: UsersRound, managementOnly: true },
  { to: '/security', label: 'Segurança', icon: Shield, managementOnly: true },
  { to: '/master-administrator', label: 'Administrador Master', icon: Crown, ownerOnly: true }
];

const accessRoleLabels: Record<FinanceAccessRole, string> = {
  owner: 'Proprietário do Financeiro',
  master_admin: 'Administrador Master',
  editor: 'Editor Financeiro',
  viewer: 'Visualizador Financeiro',
  auditor: 'Auditor Financeiro'
};

function monthLabel() {
  const label = new Date().toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric'
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function initials(name?: string | null, email?: string | null) {
  const base = name?.trim() || email?.trim() || 'U';
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function Layout() {
  const { profile, access, canManageUsers, canManageMaster, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();

    if (financeIntegration.enabled) {
      try {
        await fetch(financeIntegration.logoutUrl, {
          method: 'POST',
          credentials: 'include',
          headers: { Accept: 'application/json' }
        });
      } finally {
        window.location.assign(financeIntegration.intranetHomeUrl);
      }
      return;
    }

    navigate('/login');
  }

  return (
    <div className="app-shell modern-shell">
      <aside className="sidebar">
        <div className="brand brand-card">
          <img src={financeAsset('logo-step.png')} alt="STEP Integrated Solutions" />
        </div>

        <nav>
          {navItems
            .filter((item) => !item.managementOnly || canManageUsers)
            .filter((item) => !item.ownerOnly || canManageMaster)
            .map((item) => {
              const Icon = item.icon;
              return (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <Icon size={19} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
        </nav>

        <div className="sidebar-note modern-note">
          <Building2 size={22} />
          <b>Cofre Financeiro STEP</b>
          <p>Dados protegidos, acesso independente da administração comum e rastreabilidade completa.</p>
          <small>Supabase BNK isolado, MFA, cadastro facial e dispositivo aprovado.</small>
        </div>

        <button className="logout" onClick={handleLogout}>
          <LogOut size={18} /> Sair do financeiro
        </button>

        <div className="sidebar-footer">
          <span>© 2026 STEP Integrated Solutions</span>
          <small>Versão 1.2.0</small>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar modern-topbar">
          <div>
            <span className="eyebrow">STEP Finance Control</span>
            <h1>Painel Financeiro</h1>
            <p className="topbar-subtitle">Visão geral da saúde financeira da empresa</p>
          </div>

          <div className="topbar-actions">
            <button type="button" className="topbar-ghost-btn">
              <CalendarDays size={18} />
              <span>{monthLabel()}</span>
              <ChevronDown size={16} />
            </button>

            <button type="button" className="notification-btn" aria-label="Notificações">
              <Bell size={18} />
              <strong>1</strong>
            </button>

            <div className="user-chip modern-user-chip">
              <div className="avatar-badge">{initials(profile?.full_name, profile?.email)}</div>
              <div>
                <strong>{profile?.full_name || access?.full_name || profile?.email || 'Usuário'}</strong>
                <span>{access ? accessRoleLabels[access.role] : 'sem concessão financeira'}</span>
              </div>
              <ChevronDown size={16} className="chip-arrow" />
            </div>
          </div>
        </header>

        <Outlet />
      </main>
    </div>
  );
}
