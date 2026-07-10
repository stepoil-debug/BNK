import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminRoute } from './components/AdminRoute';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
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

export default function App() {
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
