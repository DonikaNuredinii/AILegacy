import { Routes, Route } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import ForbiddenPage from "./pages/ForbiddenPage";
import DashboardPage from "./pages/DashboardPage";
import TicketsPage from "./pages/TicketsPage";
import AiPage from "./pages/AiPage";
import ObservabilityPage from "./pages/ObservabilityPage";
import { ProtectedRoute, AdminOnlyRoute } from "./auth/guards";
import AppShell from "./components/AppShell";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forbidden" element={<ForbiddenPage />} />

      {/* Protected area */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/ai" element={<AiPage />} />
        </Route>
      </Route>

      {/* Admin-only */}
      <Route element={<AdminOnlyRoute />}>
        <Route element={<AppShell />}>
          <Route path="/observability" element={<ObservabilityPage />} />
        </Route>
      </Route>

      <Route path="*" element={<div className="p-6">Not Found</div>} />
    </Routes>
  );
}