import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useSearchParams, useParams } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { TurnosProvider } from './context/TurnosContext';
import { ArticulosProvider } from './context/ArticulosContext';
import { AuthProvider } from './context/AuthContext';
import RequireAuth from './components/RequireAuth';
import ClientLayout from './layouts/ClientLayout';
import Home from './pages/client/Home';
import CancelacionView from './components/CancelacionView';
import { NotificationProvider } from './context/NotificationContext';

/* El panel de administración se carga sólo cuando alguien entra a /admin.
   Quien reserva desde el celu no descarga el código del POS, la grilla ni la
   caja: pesa bastante menos en la primera visita. */
const AdminLayout = lazy(() => import('./layouts/AdminLayout'));
const Login = lazy(() => import('./pages/admin/Login'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const AgendaDiaria = lazy(() => import('./pages/admin/AgendaDiaria'));
const Articulos = lazy(() => import('./pages/admin/Articulos'));
const Cantina = lazy(() => import('./pages/admin/Cantina'));
const CajaDiaria = lazy(() => import('./pages/admin/CajaDiaria'));
const TurnosFijos = lazy(() => import('./pages/admin/TurnosFijos'));
const Configuracion = lazy(() => import('./pages/admin/Configuracion'));
const TorneosModule = lazy(() => import('./modules/torneos/App'));

function PantallaCarga() {
  return (
    <div className="min-h-screen bg-punto-surface flex flex-col items-center justify-center gap-3">
      <div className="w-9 h-9 border-4 border-slate-200 border-t-zinc-900 rounded-full animate-spin" />
      <p className="text-xs font-semibold text-slate-400">Cargando…</p>
    </div>
  );
}

function ClientIndex() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  if (token) {
    return <CancelacionView token={token} />;
  }

  return <Home />;
}

function CancelarTurno() {
  const { codigo, id } = useParams();
  return <CancelacionView token={codigo || id} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <TurnosProvider>
        <ArticulosProvider>
          <AuthProvider>
            <BrowserRouter>
              <Suspense fallback={<PantallaCarga />}>
                <Routes>
                  {/* Rutas Cliente (públicas) */}
                  <Route path="/" element={<ClientLayout />}>
                    <Route index element={<ClientIndex />} />
                    <Route path="c/:codigo" element={<CancelarTurno />} />
                    <Route path="turno/:id" element={<CancelarTurno />} />
                  </Route>

                  {/* Login Admin (público, fuera del layout protegido) */}
                  <Route path="/admin/login" element={<Login />} />

                  {/* Rutas Administrador (requieren sesión) */}
                  <Route
                    path="/admin"
                    element={
                      <RequireAuth>
                        <NotificationProvider>
                          <AdminLayout />
                        </NotificationProvider>
                      </RequireAuth>
                    }
                  >
                    <Route index element={<Dashboard />} />
                    <Route path="grilla" element={<AgendaDiaria />} />
                    <Route path="articulos" element={<Articulos />} />
                    <Route path="cantina" element={<Cantina />} />
                    <Route path="turnos-fijos" element={<TurnosFijos />} />
                    <Route path="caja" element={<CajaDiaria />} />
                    <Route path="torneos/*" element={<TorneosModule />} />
                    <Route path="configuracion" element={<Configuracion />} />
                  </Route>
                </Routes>
              </Suspense>
            </BrowserRouter>
          </AuthProvider>
        </ArticulosProvider>
      </TurnosProvider>
    </ThemeProvider>
  );
}
