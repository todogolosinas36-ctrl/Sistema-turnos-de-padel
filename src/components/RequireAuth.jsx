import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function PantallaCarga() {
  return (
    <div className="min-h-screen bg-punto-surface flex flex-col items-center justify-center gap-3">
      <div className="w-9 h-9 border-4 border-slate-200 border-t-zinc-900 rounded-full animate-spin" />
      <p className="text-xs font-semibold text-slate-400">Verificando sesión…</p>
    </div>
  );
}

/**
 * Envuelve las rutas /admin. While Supabase restores the session it shows a
 * loader (avoiding a flash of the panel); if there is no session it redirects
 * to the login page remembering where the user was trying to go.
 */
export default function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PantallaCarga />;

  if (!user) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
