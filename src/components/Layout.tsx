import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BarChart3, Building2, CreditCard, FileUp, History, LayoutDashboard, LogOut, Shield, WalletCards } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/position/new', label: 'Nova Posição', icon: WalletCards },
  { to: '/history', label: 'Histórico', icon: History },
  { to: '/imports', label: 'Importações', icon: FileUp },
  { to: '/security', label: 'Segurança', icon: Shield, adminOnly: true },
  { to: '/reports', label: 'Relatórios', icon: BarChart3 }
];

export function Layout() {
  const { profile, role, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo-step.png" alt="STEP Integrated Solutions" />
        </div>
        <nav>
          {navItems
            .filter((item) => !item.adminOnly || isAdmin)
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
        <div className="sidebar-note">
          <Building2 size={24} />
          <b>Cofre Financeiro STEP</b>
          <p>Projeto separado, acesso fechado, MFA obrigatório, dispositivo aprovado e auditoria total.</p>
        </div>
        <button className="logout" onClick={handleLogout}>
          <LogOut size={18} /> Sair
        </button>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div>
            <span className="eyebrow">STEP Finance Control</span>
            <h1>Painel Financeiro</h1>
          </div>
          <div className="user-chip">
            <CreditCard size={18} />
            <div>
              <strong>{profile?.full_name || profile?.email || 'Usuário'}</strong>
              <span>{role || 'sem perfil'}</span>
            </div>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
