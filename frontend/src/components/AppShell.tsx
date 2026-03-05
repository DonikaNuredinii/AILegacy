import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

function navClass({ isActive }: { isActive: boolean }) {
  return (
    "block rounded-lg px-3 py-2 text-sm " +
    (isActive ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100")
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden h-screen w-64 border-r bg-white p-4 md:block">
          <div className="text-sm font-semibold">AILEGACY</div>
          <div className="mt-1 text-xs text-gray-500">Enterprise Demo Console</div>

          <nav className="mt-6 space-y-1">
            <NavLink to="/" className={navClass} end>Dashboard</NavLink>
            <NavLink to="/tickets" className={navClass}>Tickets</NavLink>
            <NavLink to="/ai" className={navClass}>AI Assistant</NavLink>
            {user?.role === "admin" && <NavLink to="/observability" className={navClass}>Observability</NavLink>}
          </nav>

          <div className="mt-6 rounded-lg border p-3">
            <div className="text-xs text-gray-500">Signed in</div>
            <div className="text-sm font-medium">{user?.username}</div>
            <div className="text-xs font-mono text-gray-600">{user?.role}</div>
            <button
              onClick={logout}
              className="mt-3 w-full rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
            >
              Logout
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 p-6">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}