import { BrowserRouter, Routes, Route, useSearchParams } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { TurnosProvider } from './context/TurnosContext';
import { ArticulosProvider } from './context/ArticulosContext';
import { AuthProvider } from './context/AuthContext';
import RequireAuth from './components/RequireAuth';
import ClientLayout from './layouts/ClientLayout';
import AdminLayout from './layouts/AdminLayout';
import Home from './pages/client/Home';
import Login from './pages/admin/Login';
import Dashboard from './pages/admin/Dashboard';
import AgendaDiaria from './pages/admin/AgendaDiaria';
import Articulos from './pages/admin/Articulos';
import CajaDiaria from './pages/admin/CajaDiaria';
import TurnosFijos from './pages/admin/TurnosFijos';
import Configuracion from './pages/admin/Configuracion';
import CancelacionView from './components/CancelacionView';

function ClientIndex() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  if (token) {
    return <CancelacionView token={token} />;
  }

  return <Home />;
}

export default function App() {
  return (
    <ThemeProvider>
      <TurnosProvider>
        <ArticulosProvider>
          <AuthProvider>
            <BrowserRouter>
              <Routes>
                {/* Rutas Cliente (públicas) */}
                <Route path="/" element={<ClientLayout />}>
                  <Route index element={<ClientIndex />} />
                </Route>

                {/* Login Admin (público, fuera del layout protegido) */}
                <Route path="/admin/login" element={<Login />} />

                {/* Rutas Administrador (requieren sesión) */}
                <Route
                  path="/admin"
                  element={
                    <RequireAuth>
                      <AdminLayout />
                    </RequireAuth>
                  }
                >
                  <Route index element={<Dashboard />} />
                  <Route path="grilla" element={<AgendaDiaria />} />
                  <Route path="articulos" element={<Articulos />} />
                  <Route path="cantina" element={<Articulos />} />
                  <Route path="turnos-fijos" element={<TurnosFijos />} />
                  <Route path="caja" element={<CajaDiaria />} />
                  <Route path="configuracion" element={<Configuracion />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </ArticulosProvider>
      </TurnosProvider>
    </ThemeProvider>
  );
}
