/**
 * Demo minima del modulo.
 *
 * En tu aplicacion real, reemplazá esto por la ruta del sistema de turnos:
 *
 * ```tsx
 * import { TorneoProvider, TorneoDashboard } from '@/modules/torneos';
 *
 * export default function Page() {
 *   return (
 *     <TorneoProvider>
 *       <TorneoDashboard />
 *     </TorneoProvider>
 *   );
 * }
 * ```
 */

import { useEffect, useState } from 'react';
import { TorneoProvider, TorneoDashboard } from './modules/torneos';
import { estaConfigurado } from './lib/supabase';
import { Alerta, Card } from './modules/torneos/components/ui';

export function App() {
  // Soporta deep link: /torneos?torneo=<uuid>
  const [torneoId] = useState(() => new URLSearchParams(window.location.search).get('torneo'));

  useEffect(() => {
    document.title = 'Torneos de Pádel';
  }, []);

  if (!estaConfigurado) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Alerta tono="advertencia">
          <p className="font-medium">Faltan las credenciales de Supabase.</p>
          <p className="mt-1 text-xs">
            Copiá <code className="rounded bg-amber-100 px-1">.env.example</code> a{' '}
            <code className="rounded bg-amber-100 px-1">.env</code>, completá{' '}
            <code className="rounded bg-amber-100 px-1">VITE_SUPABASE_URL</code> y{' '}
            <code className="rounded bg-amber-100 px-1">VITE_SUPABASE_ANON_KEY</code>, y ejecutá los scripts de{' '}
            <code className="rounded bg-amber-100 px-1">/sql</code> en el editor de Supabase.
          </p>
        </Alerta>

        <Card className="mt-6 p-6 text-sm text-slate-600">
          <p className="font-medium text-slate-800">Mientras tanto, podés ver los algoritmos.</p>
          <p className="mt-1">
            El módulo no depende de la red para calcular nada: el sorteo de zonas, el fixture round-robin, la
            tabla de posiciones y los cruces del cuadro son funciones puras en{' '}
            <code className="rounded bg-slate-100 px-1">src/modules/torneos/lib</code>. Corré{' '}
            <code className="rounded bg-slate-100 px-1">npm test</code> para verlas en acción.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <TorneoProvider torneoInicialId={torneoId}>
      <TorneoDashboard />
    </TorneoProvider>
  );
}

export default App;
