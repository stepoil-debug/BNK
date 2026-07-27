import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  FileUp,
  History,
  Home,
  LayoutDashboard,
  LogOut,
  Shield,
  WalletCards
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/position/new', label: 'Nova Posição', icon: WalletCards },
  { to: '/history', label: 'Histórico', icon: History },
  { to: '/imports', label: 'Importações', icon: FileUp },
  { to: '/security', label: 'Segurança', icon: Shield, adminOnly: true },
  { to: '/reports', label: 'Relatórios', icon: BarChart3 }
];

const STEP_ONE_HOME = 'https://intranet-stepone.netlify.app/intranet';
const STEP_ONE_FINANCE = 'https://intranet-stepone.netlify.app/intranet/financeiro';
const STEP_ONE_LOGOUT = 'https://intranet-stepone.netlify.app/logout';
const SIDEBAR_COLLAPSE_KEY = 'step.intranet.sidebar.collapsed';

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
  const { profile, role, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1'; }
    catch { return false; }
  });

  function toggleCollapsed() {
    setCollapsed(value => {
      const next = !value;
      try { window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? '1' : '0'); }
      catch { /* Mantém o estado durante a sessão atual. */ }
      return next;
    });
  }

  function goBack() {
    const historyIndex = Number(window.history.state?.idx ?? 0);
    if (historyIndex > 0 || window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign(STEP_ONE_FINANCE);
  }

  async function handleLogout() {
    await signOut();
    window.location.replace(STEP_ONE_LOGOUT);
  }

  return (
    <div className={`app-shell modern-shell ${collapsed ? 'finance-sidebar-collapsed' : ''}`}>
      <aside className="sidebar step-finance-sidebar">
        <div className="step-finance-brand-row">
          <button className="brand step-finance-brand" type="button" onClick={() => window.location.assign(STEP_ONE_HOME)} aria-label="Início do STEP One" title="Início do STEP One">
            <img src="/logo-step.png" alt="STEP One" />
          </button>
          <button className="step-finance-collapse" type="button" onClick={toggleCollapsed} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'} title={collapsed ? 'Expandir menu' : 'Recolher menu'}>
            {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
          </button>
        </div>

        <div className="step-finance-section-label">Módulo atual</div>
        <button className="step-finance-current-module" type="button" onClick={() => navigate('/dashboard')} title="Financeiro">
          <span className="step-finance-module-icon"><WalletCards /></span>
          <span className="step-finance-module-copy"><strong>Financeiro</strong><small>Controle bancário</small></span>
        </button>

        <div className="step-finance-section-label">Navegação</div>
        <nav>
          {navItems
            .filter((item) => !item.adminOnly || isAdmin)
            .map((item) => {
              const Icon = item.icon;
              return (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={item.label}>
                  <Icon size={19} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
        </nav>

        <div className="step-finance-sidebar-footer">
          <button type="button" onClick={goBack}><ArrowLeft /><span>Voltar</span></button>
          <button type="button" onClick={() => window.location.assign(STEP_ONE_HOME)}><Home /><span>Voltar ao início</span></button>
          <button type="button" onClick={() => void handleLogout()}><LogOut /><span>Sair</span></button>
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
                <strong>{profile?.full_name || profile?.email || 'Usuário'}</strong>
                <span>{role || 'sem perfil'}</span>
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
