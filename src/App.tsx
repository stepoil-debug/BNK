import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminRoute } from './components/AdminRoute';
import { Layout } from './components/Layout';
import { OwnerRoute } from './components/OwnerRoute';
import { ProtectedRoute } from './components/ProtectedRoute';
import { financeIntegration } from './config/integration';
import { Blocked } from './routes/Blocked';
import { Dashboard } from './routes/Dashboard';
import { DeviceCheck } from './routes/DeviceCheck';
import { FaceEnrollment } from './routes/FaceEnrollment';
import { FinanceUsers } from './routes/FinanceUsers';
import { FinancialPositionForm } from './routes/FinancialPositionForm';
import { History } from './routes/History';
import { Imports } from './routes/Imports';
import { IntranetAccess } from './routes/IntranetAccess';
import { Login } from './routes/Login';
import { MasterAdmin } from './routes/MasterAdmin';
import { MfaChallenge } from './routes/MfaChallenge';
import { Reports } from './routes/Reports';
import { SecurityAdmin } from './routes/SecurityAdmin';
import { SecuritySetup } from './routes/SecuritySetup';

export default function App() {
  const standaloneLoginAllowed = !financeIntegration.enabled || financeIntegration.allowStandaloneLogin;

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/access" element={<IntranetAccess />} />
      <Route path="/security/challenge" element={<MfaChallenge />} />
      <Route
        path="/login"
        element={standaloneLoginAllowed ? <Login /> : <Navigate to="/access" replace />}
      />
      <Route path="/blocked" element={<Blocked />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/security/setup" element={<SecuritySetup />} />
        <Route path="/security/face-enrollment" element={<FaceEnrollment />} />
        <Route path="/security/device-check" element={<DeviceCheck />} />
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/position/new" element={<FinancialPositionForm />} />
          <Route path="/history" element={<History />} />
          <Route path="/imports" element={<Imports />} />
          <Route path="/reports" element={<Reports />} />
          <Route element={<AdminRoute />}>
            <Route path="/access-management" element={<FinanceUsers />} />
            <Route path="/security" element={<SecurityAdmin />} />
          </Route>
          <Route element={<OwnerRoute />}>
            <Route path="/master-administrator" element={<MasterAdmin />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
