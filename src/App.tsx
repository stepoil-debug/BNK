import { AlertTriangle, CheckCircle2, Database, ShieldCheck } from 'lucide-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminRoute } from './components/AdminRoute';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { isSupabaseConfigured } from './lib/supabase';
import { Blocked } from './routes/Blocked';
import { Dashboard } from './routes/Dashboard';
import { DeviceCheck } from './routes/DeviceCheck';
import { FinancialPositionForm } from './routes/FinancialPositionForm';
import { History } from './routes/History';
import { Imports } from './routes/Imports';
import { Login } from './routes/Login';
import { Reports } from './routes/Reports';
import { SecurityAdmin } from './routes/SecurityAdmin';
import { SecuritySetup } from './routes/SecuritySetup';

function SupabaseConfigMissing() {
  return (
    <div className="config-page">
      <section className="config-card">
        <div className="config-brand">
          <img src="/logo-step.png" alt="STEP" />
          <span>Finance Control</span>
        </div>

        <div className="config-alert">
          <AlertTriangle size={30} />
          <div>
            <h1>Configuração pendente no Netlify</h1>
            <p>
              O sistema foi publicado, mas ainda não recebeu as variáveis do Supabase.
              Por segurança, o painel financeiro não será carregado até essa configuração ser concluída.
            </p>
          </div>
        </div>

        <div className="config-steps">
          <h2>Configure estas variáveis no Netlify</h2>

          <div className="config-env-row">
            <Database size={18} />
            <code>VITE_SUPABASE_URL</code>
          </div>

          <div className="config-env-row">
            <ShieldCheck size={18} />
            <code>VITE_SUPABASE_ANON_KEY</code>
          </div>

          <p className="config-help">
            Caminho: Netlify → Site configuration → Environment variables → Add variable.
            Depois clique em Deploys → Trigger deploy → Clear cache and deploy site.
          </p>

          <div className="config-ok">
            <CheckCircle2 size={18} />
            A Service Role Key nunca deve ser colocada no frontend ou no Netlify público.
          </div>
        </div>
      </section>
    </div>
  );
}

export default function App() {
  if (!isSupabaseConfigured) {
    return <SupabaseConfigMissing />;
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/blocked" element={<Blocked />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/security/setup" element={<SecuritySetup />} />
        <Route path="/security/device-check" element={<DeviceCheck />} />
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/position/new" element={<FinancialPositionForm />} />
          <Route path="/history" element={<History />} />
          <Route path="/imports" element={<Imports />} />
          <Route path="/reports" element={<Reports />} />
          <Route element={<AdminRoute />}>
            <Route path="/security" element={<SecurityAdmin />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
