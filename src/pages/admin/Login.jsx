import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import LogoPadel from '../../components/LogoPadel';
import { Lock, Mail, ArrowLeft, LogIn, AlertCircle } from 'lucide-react';

export default function Login() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const destino = location.state?.from || '/admin';

  // Si ya hay sesión activa, no mostrar el login
  useEffect(() => {
    if (!loading && user) {
      navigate(destino, { replace: true });
    }
  }, [user, loading, destino, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);

    try {
      await login(email, password);
      navigate(destino, { replace: true });
    } catch (err) {
      console.error('Error de login:', err);
      // Mensajes genéricos: no revelamos si el email existe o no
      setError(
        err?.message === 'Invalid login credentials'
          ? 'Credenciales incorrectas. Revisá el email y la contraseña.'
          : err?.message || 'No se pudo iniciar sesión. Intentá nuevamente.'
      );
    } finally {
      setEnviando(false);
    }
  };

  const inputCls =
    'w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3.5 text-base sm:text-sm text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all';

  if (loading || user) return null;

  return (
    <div className="min-h-screen bg-punto-surface flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-zinc-950 text-cyan-400 flex items-center justify-center shadow-lg mb-4">
            <LogoPadel className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black text-zinc-900 tracking-tight text-center">
            Panel de Administración
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1 text-center">
            Iniciá sesión para gestionar los turnos
          </p>
        </div>

        {/* Formulario */}
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-4"
        >
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="email"
                required
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@complejo.com"
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type={verPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`${inputCls} pr-16`}
              />
              <button
                type="button"
                onClick={() => setVerPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              >
                {verPassword ? 'Ocultar' : 'Ver'}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-red-700 leading-relaxed">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="w-full py-4 rounded-xl bg-zinc-900 text-white font-bold text-sm hover:bg-zinc-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:active:scale-100 cursor-pointer"
          >
            {enviando ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Ingressando…
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                Iniciar Sesión
              </>
            )}
          </button>
        </form>

        {/* Volver a la vista cliente */}
        <Link
          to="/"
          className="mt-6 flex items-center justify-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver a la vista de reservas
        </Link>
      </div>
    </div>
  );
}
