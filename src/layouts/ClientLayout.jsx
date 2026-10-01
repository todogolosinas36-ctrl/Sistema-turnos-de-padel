import { Outlet } from 'react-router-dom';

export default function ClientLayout() {
  return (
    <div className="min-h-screen bg-slate-950 flex justify-center items-start sm:py-8 px-0 sm:px-4 relative overflow-hidden">
      {/* Ambient glow backgrounds */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-emerald-500/5 blur-3xl" />
        <div className="absolute top-1/3 -right-48 w-[600px] h-[600px] rounded-full bg-indigo-500/5 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] rounded-full bg-slate-800/40 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-4xl min-h-screen sm:min-h-[auto] bg-slate-900/80 backdrop-blur-xl sm:rounded-3xl sm:shadow-2xl border-0 sm:border border-slate-800/80 flex flex-col overflow-hidden transition-all duration-300">
        <main className="flex-1 flex flex-col">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
