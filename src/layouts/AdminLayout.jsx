import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  Package,
  CalendarRange,
  Wallet,
  Settings,
  Bell,
  ChevronRight,
  Menu,
  X,
  LogOut,
  Coffee,
  AlertTriangle,
  CheckCheck,
} from 'lucide-react';
import LogoPadel from '../components/LogoPadel';
import { useTheme } from '../context/ThemeContext';
import { useTurnos } from '../context/TurnosContext';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { themes } from '../utils/themeConfig';
import { supabase } from '../lib/supabaseClient';

let audioCtx = null;

const getAudioCtx = () => {
  if (typeof window !== 'undefined' && !audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }
  return audioCtx;
};

const reproducirAlertaCancelacion = async () => {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const now = ctx.currentTime;

    // Tono 1 (Agudo)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now); // Nota La5
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.15);

    // Tono 2 descendente de alerta
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(587.33, now + 0.18); // Nota Re5
    gain2.gain.setValueAtTime(0.3, now + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.18);
    osc2.stop(now + 0.35);

    console.log('🔔 Alerta sonora reproducida');
  } catch (error) {
    console.error('Error al reproducir audio:', error);
  }
};

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/admin', icon: LayoutDashboard, exact: true },
  { label: 'Grilla de Turnos', path: '/admin/grilla', icon: CalendarDays },
  { label: 'Cantina', path: '/admin/cantina', icon: Coffee },
  { label: 'Artículos', path: '/admin/articulos', icon: Package },
  { label: 'Turnos Fijos', path: '/admin/turnos-fijos', icon: CalendarRange },
  { label: 'Caja Diaria', path: '/admin/caja', icon: Wallet },
  { label: 'Configuración', path: '/admin/configuracion', icon: Settings },
];

const getPageTitle = (pathname) => {
  if (pathname === '/admin') return 'Resumen Operativo';
  if (pathname.includes('grilla')) return 'Grilla de Turnos';
  if (pathname.includes('cantina')) return 'Cantina & Pro-Shop';
  if (pathname.includes('articulos')) return 'Gestor de Artículos';
  if (pathname.includes('turnos-fijos')) return 'Turnos Fijos (Abonos)';
  if (pathname.includes('caja')) return 'Caja Diaria';
  if (pathname.includes('configuracion')) return 'Configuración';
  return 'Panel de Administración';
};

/* ─── Contenido del sidebar (compartido por desktop fijo y drawer mobile) ─── */
function SidebarContent({ currentTheme, onNavigate, showCloseButton, onClose }) {
  const location = useLocation();

  return (
    <>
      {/* Logo Rebranding 20/10 */}
      <div className="h-16 sm:h-20 flex items-center px-5 sm:px-6 border-b border-slate-800/10 gap-3 shrink-0">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-md transition-colors ${currentTheme.logoIconBg}`}
        >
          <LogoPadel className={`w-5 h-5 transition-colors ${currentTheme.logoIconText}`} />
        </div>
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span
            className={`font-black text-2xl tracking-tight leading-none block transition-colors ${currentTheme.logo}`}
          >
            20/10
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Pádel
          </span>
        </div>

        {showCloseButton && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú"
            className="ml-auto w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-black/20 active:scale-95 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navegación */}
      <nav className="flex-1 py-3 sm:py-4 overflow-y-auto overscroll-contain-smooth">
        <ul className="space-y-0.5 px-3 sm:px-0">
          {NAV_ITEMS.map(({ label, path, icon: Icon, exact }) => {
            const isActive = exact
              ? location.pathname === path
              : location.pathname.startsWith(path);

            return (
              <li key={path}>
                <Link
                  to={path}
                  onClick={onNavigate}
                  aria-current={isActive ? 'page' : undefined}
                  className={`group flex items-center gap-3 px-3 sm:px-6 py-3.5 text-sm font-semibold transition-all relative border-r-4 rounded-l-xl sm:rounded-none ${
                    isActive
                      ? currentTheme.sidebarActive
                      : currentTheme.sidebarInactive
                  }`}
                >
                  <Icon
                    className={`shrink-0 transition-colors ${
                      isActive ? currentTheme.iconActive : currentTheme.iconInactive
                    }`}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span className={isActive ? currentTheme.iconActive : ''}>{label}</span>
                  {isActive && (
                    <ChevronRight
                      className={`w-3.5 h-3.5 ml-auto transition-colors ${currentTheme.navChevron}`}
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer Sidebar */}
      <div className="p-3 sm:p-4 border-t border-slate-800/10 shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        <Link
          to="/"
          onClick={onNavigate}
          className="flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold hover:opacity-80 transition-opacity"
        >
          <span className="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center text-xs font-black">
            AD
          </span>
          <div>
            <span className="text-slate-300 block text-xs font-bold leading-tight">
              Administrador
            </span>
            <span className="text-slate-600 text-[10px]">Ver vista cliente →</span>
          </div>
        </Link>
      </div>
    </>
  );
}

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { nombreClub, colorClub, modoLocal, falla, recargar, canchas } = useTurnos();
  const { user, logout } = useAuth();
  const currentTheme = themes[theme] || themes.pro;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [cancelToast, setCancelToast] = useState(null);

  const canchasRef = useRef(canchas);
  useEffect(() => {
    canchasRef.current = canchas;
  }, [canchas]);

  const { notificaciones, limpiarNotificaciones } = useNotifications();

  const emailAdmin = user?.email || 'admin@club.com';
  const iniciales = emailAdmin.slice(0, 2).toUpperCase();

  // Autoplay Unlocker para la alerta sonora
  useEffect(() => {
    const desbloquearAudio = () => {
      const ctx = getAudioCtx();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().then(() => {
          console.log('🔊 AudioContext desbloqueado con éxito');
        });
      }
    };

    window.addEventListener('click', desbloquearAudio, { once: true });
    window.addEventListener('keydown', desbloquearAudio, { once: true });
    window.addEventListener('touchstart', desbloquearAudio, { once: true });

    return () => {
      window.removeEventListener('click', desbloquearAudio);
      window.removeEventListener('keydown', desbloquearAudio);
      window.removeEventListener('touchstart', desbloquearAudio);
    };
  }, []);

  // Cerrar el drawer al navegar (comportamiento esperado en mobile)
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Cerrar el dropdown de notificaciones al navegar
  useEffect(() => {
    setDropdownOpen(false);
  }, [location.pathname]);

  // Bloquear scroll del body + cerrar con Escape mientras el drawer está abierto
  useEffect(() => {
    if (!drawerOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [drawerOpen]);

  // Alerta sonora y visual de cancelación en vivo (Admin)
  useEffect(() => {
    if (modoLocal) return;

    const adminChannel = supabase.channel('admin-cancellations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'turnos' },
        (payload) => {
          let cancelledTurno = null;
          
          if (payload.eventType === 'DELETE') {
            cancelledTurno = payload.old;
          } else if (payload.eventType === 'UPDATE' && payload.new.estado?.toLowerCase() === 'cancelado') {
            // Solo si cambió de estado a cancelado. Si ya estaba cancelado y se actualizó otra cosa, no hacer sonido.
            // Para ser exactos, Supabase Postgres changes nos da payload.old si lo pedimos con REPLICA IDENTITY FULL, pero no siempre.
            // Si llega un cancelado, mostramos alerta.
            cancelledTurno = payload.new;
          }

          if (cancelledTurno) {
            reproducirAlertaCancelacion();
            
            const nombreCancha = canchasRef.current.find(c => c.id === cancelledTurno.cancha_id)?.nombre 
                                || cancelledTurno.cancha_nombre 
                                || 'Cancha';
            const horario = cancelledTurno.hora_inicio ? cancelledTurno.hora_inicio.substring(0, 5) : '';
            const titular = `${cancelledTurno.cliente_nombre || ''} ${cancelledTurno.cliente_apellido || ''}`.trim() || 'Titular';

            setCancelToast({
              id: Date.now(),
              cancha: nombreCancha,
              horario,
              titular
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(adminChannel);
    };
  }, [modoLocal]);

  useEffect(() => {
    if (cancelToast) {
      const timer = setTimeout(() => setCancelToast(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [cancelToast]);

  const handleLogout = async () => {
    setCerrandoSesion(true);
    try {
      await logout();
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
    } finally {
      setCerrandoSesion(false);
      setDrawerOpen(false);
      navigate('/admin/login', { replace: true });
    }
  };

  return (
    <div className="flex h-safe-full bg-punto-surface font-sans overflow-hidden antialiased">
      {/* ─── Sidebar Desktop (lg+) ─── */}
      <aside
        className={`hidden lg:flex w-72 flex-col shrink-0 shadow-xl z-20 transition-colors duration-300 ${currentTheme.sidebar}`}
      >
        <SidebarContent currentTheme={currentTheme} />
      </aside>

      {/* ─── Drawer Mobile (<lg) ─── */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setDrawerOpen(false)}
          />
          {/* Panel */}
          <aside
            className={`relative w-72 max-w-[84vw] flex flex-col shadow-2xl ${currentTheme.sidebar} animate-in slide-in-from-left duration-300`}
          >
            <SidebarContent
              currentTheme={currentTheme}
              onNavigate={() => setDrawerOpen(false)}
              showCloseButton
              onClose={() => setDrawerOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* ─── Área Principal ─── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Topbar */}
        <header className="shrink-0 z-10 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-3 sm:py-0 sm:h-20 lg:h-24 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Botón hamburguesa (solo mobile/tablet) */}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Abrir menú"
              className="lg:hidden shrink-0 w-10 h-10 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 active:scale-95 flex items-center justify-center transition-all"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="min-w-0">
              <h2
                className="text-xl sm:text-3xl lg:text-4xl font-black tracking-tight leading-none truncate drop-shadow-sm transition-colors duration-200"
                style={{ color: colorClub || '#09090b' }}
              >
                {nombreClub}
              </h2>
              <p className="hidden sm:flex text-xs text-slate-400 mt-1.5 font-medium items-center gap-1.5">
                <span className="font-bold text-slate-600">{getPageTitle(location.pathname)}</span>
                <span>•</span>
                <span>
                  {new Date().toLocaleDateString('es-AR', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {/* Notificaciones */}
            <div className="relative">
              <button
                type="button"
                id="btn-notificaciones"
                aria-label="Notificaciones"
                aria-expanded={dropdownOpen}
                aria-haspopup="true"
                onClick={() => setDropdownOpen((v) => !v)}
                className="relative p-2.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <Bell className="w-5 h-5" />
                {/* Badge pulsante cuando hay notificaciones sin leer */}
                {notificaciones.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse border-2 border-white" />
                )}
              </button>

              {/* Dropdown de notificaciones */}
              {dropdownOpen && (
                <>
                  {/* Overlay invisible para cerrar al clickear fuera */}
                  <div
                    className="fixed inset-0 z-40"
                    aria-hidden="true"
                    onClick={() => setDropdownOpen(false)}
                  />
                  <div
                    role="menu"
                    aria-label="Lista de notificaciones"
                    className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 overflow-hidden animate-fade-in"
                  >
                    {/* Cabecera del dropdown */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                      <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-slate-500" />
                        <span className="text-sm font-bold text-slate-700">Notificaciones</span>
                        {notificaciones.length > 0 && (
                          <span className="bg-red-100 text-red-600 text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none">
                            {notificaciones.length}
                          </span>
                        )}
                      </div>
                      {notificaciones.length > 0 && (
                        <button
                          type="button"
                          onClick={() => { limpiarNotificaciones(); setDropdownOpen(false); }}
                          className="text-[11px] font-semibold text-slate-400 hover:text-slate-700 transition-colors flex items-center gap-1"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          Marcar leídas
                        </button>
                      )}
                    </div>

                    {/* Lista */}
                    <div className="max-h-[340px] overflow-y-auto overscroll-contain">
                      {notificaciones.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-400">
                          <Bell className="w-8 h-8 opacity-30" />
                          <p className="text-xs font-medium">Sin notificaciones nuevas</p>
                        </div>
                      ) : (
                        notificaciones.map((notif) => (
                          <div
                            key={notif.id}
                            role="menuitem"
                            className="flex items-start gap-3 px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors last:border-0"
                          >
                            <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center mt-0.5 ${notif.tipo === 'insert' ? 'bg-emerald-50 text-emerald-500' : 'bg-red-50 text-red-500'}`}>
                              {notif.tipo === 'insert' ? <CalendarDays className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                                {notif.tipo === 'insert' ? 'Nuevo turno' : 'Turno cancelado'}
                              </p>
                              <p className="text-sm font-semibold text-slate-800 truncate capitalize leading-tight">
                                {notif.tipo === 'insert' ? notif.nombre : `${notif.nombre} liberó`}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                                {notif.hora} hs &middot; {notif.cancha}
                              </p>
                              {notif.fecha && (
                                <p className="text-[10px] text-slate-400 mt-0.5">{notif.fecha}</p>
                              )}
                            </div>
                            <span className="shrink-0 text-[10px] text-slate-400 tabular-nums pt-0.5">
                              {notif.timestamp.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Footer: Marcar todas */}
                    {notificaciones.length > 0 && (
                      <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50">
                        <button
                          type="button"
                          onClick={() => { limpiarNotificaciones(); setDropdownOpen(false); }}
                          className="w-full text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors py-1 text-center"
                        >
                          Marcar todas como leídas
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="hidden sm:block h-8 w-px bg-slate-200" />

            {/* Avatar Admin */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="hidden lg:block min-w-0">
                <span className="text-xs font-bold text-slate-800 block leading-tight truncate max-w-[180px]">
                  Administrador
                </span>
                <span className="text-[11px] text-slate-400 block truncate max-w-[180px]">
                  {emailAdmin}
                </span>
              </div>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-white flex items-center justify-center text-xs font-black shadow-sm shrink-0">
                {iniciales}
              </div>

              {/* Cerrar sesión */}
              <button
                type="button"
                onClick={handleLogout}
                disabled={cerrandoSesion}
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
                className="w-10 h-10 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 active:scale-95 transition-all flex items-center justify-center disabled:opacity-50 shrink-0"
              >
                <LogOut className="w-4.5 h-4.5" style={{ width: '18px', height: '18px' }} />
              </button>
            </div>
          </div>
        </header>

        {/* Título de página en mobile (reemplaza al subtítulo oculto) */}
        <div className="sm:hidden shrink-0 px-4 pt-3 bg-punto-surface">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            {getPageTitle(location.pathname)}
          </p>
        </div>

        {/* Aviso global: la app está operando sin Supabase */}
        {modoLocal && (
          <div className="shrink-0 flex items-start sm:items-center gap-2.5 px-4 sm:px-6 lg:px-8 py-2.5 bg-amber-100 border-b border-amber-300 text-amber-900">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
            <p className="text-[11px] sm:text-xs font-semibold leading-snug flex-1 min-w-0">
              <span className="font-black">Sin Supabase.</span>{' '}
              {falla?.mensaje ||
                'Los datos se guardan sólo en este navegador y no se comparten entre dispositivos.'}
            </p>
            <button
              type="button"
              onClick={recargar}
              className="shrink-0 text-[11px] font-black uppercase tracking-wide underline hover:no-underline cursor-pointer"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Contenido (Outlet) */}
        <main className="flex-1 overflow-y-auto overscroll-contain-smooth flex flex-col p-4 sm:p-6 lg:p-8 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
          <Outlet />
        </main>

        {/* Toast de Cancelación en vivo */}
        {cancelToast && (
          <div className="fixed bottom-4 sm:bottom-8 right-4 sm:right-8 z-[99999] animate-in slide-in-from-bottom-5 fade-in duration-300">
            <div className="bg-gradient-to-r from-red-600 to-red-500 text-white px-5 py-4 rounded-xl shadow-2xl shadow-red-500/20 flex items-center gap-4 max-w-sm border border-red-400/50">
              <div className="bg-red-950/30 p-2 rounded-lg shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-100" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-extrabold text-sm leading-tight text-white drop-shadow-sm uppercase tracking-wide">
                  ⚠️ Turno Cancelado
                </p>
                <p className="text-sm font-semibold text-red-100 mt-1 truncate">
                  {cancelToast.cancha} - {cancelToast.horario} hs
                </p>
                <p className="text-xs font-medium text-red-200 truncate mt-0.5">
                  Titular: {cancelToast.titular}
                </p>
              </div>
              <button 
                onClick={() => setCancelToast(null)}
                className="shrink-0 p-1.5 hover:bg-red-700/50 rounded-lg transition-colors text-red-200 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
