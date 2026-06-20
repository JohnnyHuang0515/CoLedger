import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ClubEntryPage } from './pages/ClubEntryPage';
import { JoinPage } from './pages/JoinPage';
import { DashboardPage } from './pages/DashboardPage';
import { SharedHoldingsPage } from './pages/SharedHoldingsPage';
import { SummaryPage } from './pages/SummaryPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { MembersPage } from './pages/MembersPage';
import { ActivityPage } from './pages/ActivityPage';
import { ClubLayout } from './club/ClubLayout';
import { RequireAuth } from './auth/RequireAuth';

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Invite link — public; handles its own login/register gating */}
      <Route path="/join/:token" element={<JoinPage />} />

      {/* Landing — resolve / create / join a club */}
      <Route
        path="/"
        element={
          <RequireAuth>
            <ClubEntryPage />
          </RequireAuth>
        }
      />

      {/* Club-scoped routes (BUILD-CONTRACT §6) */}
      <Route
        path="/clubs/:clubId"
        element={
          <RequireAuth>
            <ClubLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="holdings" element={<SharedHoldingsPage />} />
        <Route path="summary" element={<SummaryPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="activity" element={<ActivityPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
