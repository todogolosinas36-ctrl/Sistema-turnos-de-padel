import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import LogoPadel from '../../components/LogoPadel';
import { Lock, Mail, ArrowLeft, LogIn, AlertCircle, Eye, EyeOff, MessageCircle } from 'lucide-react';

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
    'w-full bg-slate-800/50 border border-slate-700/80 text-white placeholder-slate-500 rounded-xl pl-11 pr-4 py-3.5 text-base sm:text-sm font-medium focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 transition-all';
  const labelCls =
    'block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5';
  const iconCls =
    'w-4 h-4 text-slate-400 group-focus-within:text-cyan-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none transition-colors';

  if (loading || user) return null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 flex items-center justify-center px-4 pt-10 pb-24">
      {/* Orbes de luz ambiental */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 -left-32 w-[28rem] h-[28rem] rounded-full bg-cyan-500/30 blur-3xl animate-orb-a will-change-transform"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -right-32 w-[30rem] h-[30rem] rounded-full bg-emerald-500/25 blur-3xl animate-orb-b will-change-transform"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-blue-600/10 blur-3xl animate-pulse"
      />

      {/* Cuadrícula tipo cancha */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_85%)]"
      />

      <main className="bg-slate-900/60 backdrop-blur-xl border border-white/10 shadow-2xl shadow-cyan-950/40 rounded-3xl p-8 sm:p-10 w-full max-w-md relative z-10 animate-fade-in">
        {/* Encabezado */}
        <header className="flex flex-col items-center mb-8 text-center">
          <div className="flex items-center gap-3 mb-5 drop-shadow-[0_0_15px_rgba(6,182,212,0.4)]">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500 flex items-center justify-center">
              <LogoPadel className="w-8 h-8 text-slate-950 fill-slate-950" />
            </div>
            <span className="text-white font-black text-4xl tracking-tight leading-none">
              20/10
            </span>
          </div>
          <h1 className="text-white font-extrabold tracking-tight text-2xl">
            Panel de Administración
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Gestioná tus canchas, torneos y caja con precisión 20/10
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="login-email" className={labelCls}>Email</label>
            <div className="relative group">
              <Mail className={iconCls} />
              <input
                id="login-email"
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
            <label htmlFor="login-password" className={labelCls}>Contraseña</label>
            <div className="relative group">
              <Lock className={iconCls} />
              <input
                id="login-password"
                type={verPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`${inputCls} pr-12`}
              />
              <button
                type="button"
                id="login-toggle-password"
                onClick={() => setVerPassword((v) => !v)}
                aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-white/5 transition-colors cursor-pointer"
              >
                {verPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2.5 p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-red-300 leading-relaxed">{error}</p>
            </div>
          )}

          <button
            type="submit"
            id="login-submit"
            disabled={enviando}
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold py-3.5 rounded-xl shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:hover:scale-100 disabled:cursor-not-allowed"
          >
            {enviando ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                Ingresando…
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                Iniciar Sesión
              </>
            )}
          </button>
        </form>

        <Link
          to="/"
          className="text-slate-400 hover:text-cyan-400 transition-colors text-sm flex items-center justify-center gap-1.5 mt-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver a la vista de reservas
        </Link>
      </main>

      {/* Firma de desarrollo */}
      <footer className="absolute bottom-4 w-full flex justify-center z-10 px-4">
        <div className="flex flex-wrap items-center justify-center gap-y-1 text-center">
          <span className="text-slate-500 text-xs">
            Desarrollado por{' '}
            <span className="text-slate-300 font-semibold hover:text-cyan-400 transition-colors">
              Mp sistemas
            </span>
          </span>
          <span className="text-slate-600 mx-2" aria-hidden="true">•</span>
          <span className="text-slate-400 text-xs">Soluciones digitales a medida</span>
          <span className="text-slate-600 mx-2 hidden sm:inline" aria-hidden="true">•</span>
          <a
            href="https://wa.me/5493816096311?text=Hola,%20me%20comunico%20por%20el%20sistema%20de%20gesti%C3%B3n"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Contactar por WhatsApp al 3816096311"
            className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 text-xs font-medium transition-colors cursor-pointer"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            3816096311
          </a>
        </div>
      </footer>
    </div>
  );
}
