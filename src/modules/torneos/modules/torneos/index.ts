/**
 * Punto de entrada del modulo de Torneos de Padel.
 *
 * Uso minimo dentro de tu app:
 *
 * ```tsx
 * import { TorneoProvider, TorneoDashboard } from '@/modules/torneos';
 *
 * export default function TorneosPage() {
 *   return (
 *     <TorneoProvider>
 *       <TorneoDashboard />
 *     </TorneoProvider>
 *   );
 * }
 * ```
 *
 * O, si tu app ya tiene su propio cliente de Supabase:
 *
 * ```tsx
 * <TorneoProvider db={crearDb({ cliente: miClienteSupabase, esquema: 'torneo' })}>
 * ```
 */

/* Layout y componentes */
export { TorneoDashboard, default as Dashboard } from './components/TorneoDashboard';
export { InscripcionesTab } from './components/InscripcionesTab';
export { ZonasView } from './components/ZonasView';
export { PlayoffBracket } from './components/PlayoffBracket';
export { CronogramaGeneral } from './components/CronogramaGeneral';
export { ParejaFormModal, formatearMoneda } from './components/ParejaFormModal';
export { ScoreForm } from './components/ScoreForm';
export { AsignarCanchaHorarioModal } from './components/AsignarCanchaHorarioModal';

/* Primitivas de UI (por si querés reusarlas en tu sistema) */
export * from './components/ui';

/* Estado */
export {
  TorneoProvider,
  useTorneo,
  useTorneoAcciones,
  TABS,
  type TabActiva,
  type AccionesTorneo,
  type ContextoTorneo,
} from './store/TorneoStore';

/* Datos */
export { crearDb, db, ok, fallo, aTorneo, aCategoria, aPareja, aPartido, aCancha } from './api/db';
export type { DbTorneos, DbOpciones, Resultado, ErrorTorneo } from './api/db';

/* Algoritmos de dominio (Parte B) */
export * from './lib';

/* Tipos y errores */
export * from './types';
export * from './errors';
