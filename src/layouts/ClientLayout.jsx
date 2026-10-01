import { Outlet } from 'react-router-dom';
export default function ClientLayout() {
  return (
    <div className="min-h-screen bg-zinc-100 flex justify-center sm:py-6">
      <div className="w-full max-w-md mx-auto min-h-screen sm:min-h-[850px] bg-zinc-50 flex flex-col relative sm:shadow-xl sm:rounded-3xl sm:border sm:border-zinc-200/80 overflow-hidden">
        {/* Contenido */}
        <main className="flex-1 flex flex-col">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
