import { Outlet, Link } from 'react-router-dom';
import { Menu } from 'lucide-react';
import LogoPadel from '../components/LogoPadel';

export default function ClientLayout() {
  return (
    <div className="min-h-screen bg-zinc-100 flex justify-center sm:py-6">
      <div className="w-full max-w-md mx-auto min-h-screen sm:min-h-[850px] bg-zinc-50 flex flex-col relative sm:shadow-xl sm:rounded-3xl sm:border sm:border-zinc-200/80 overflow-hidden">
        {/* Header móvil */}
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-zinc-100 px-5 py-4 flex items-center justify-between shadow-xs">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-zinc-950 text-cyan-400 flex items-center justify-center shadow-sm">
              <LogoPadel className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-black tracking-tight text-zinc-900">
                20/10
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Pádel
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/admin"
              className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors"
            >
              Admin
            </Link>
            <button
              type="button"
              className="p-2 rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Contenido */}
        <main className="flex-1 flex flex-col">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
