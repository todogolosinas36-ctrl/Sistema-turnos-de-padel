/**
 * PlayoffBracket — cuadro eliminatorio visual.
 *
 * Renderiza el bracket por columnas (rondas de izquierda a derecha) con:
 *  - Cada partido como una tarjeta con las dos parejas y su score.
 *  - Resaltado del ganador y del perdedor.
 *  - Avance automatico: los ganadores se propagan a la ronda siguiente por el
 *    layout (el match `r+1 / orden k` se alinea con los `2k-1` y `2k`).
 *  - Los BYEs se muestran explicitamente para que se entienda por que una
 *    pareja avanza sin jugar.
 *
 * El calculo de posiciones es puro (sin librerias de layout): se usa CSS Grid
 * con filas implicitas y `grid-row` derivado del indice, de modo que el
 * bracket escala a 16 zonas sin scroll en columnas.
 */

import { useMemo, useState } from 'react';
import { useTorneo } from '../store/TorneoStore';
import type { Pareja, ResultadoInput } from '../types';
import { construirBracket, ETIQUETA_FASE, progresoEliminatorio } from '../lib';
import { ScoreForm } from './ScoreForm';
import { Alerta, Badge, Button, Card, EstadoVacio, Spinner } from './ui';

export function PlayoffBracket() {
  const { categoria, partidosPlayoff, parejas, tablas, acciones, guardando, cargando } = useTorneo();

  const [partidoAbierto, setPartidoAbierto] = useState<string | null>(null);

  const porPareja = useMemo(() => new Map(parejas.map((p) => [p.id, p])), [parejas]);
  const bracket = useMemo(() => construirBracket(partidosPlayoff), [partidosPlayoff]);
  const progreso = useMemo(() => progresoEliminatorio(partidosPlayoff), [partidosPlayoff]);

  const partidoAbiertoObj = useMemo(
    () => partidosPlayoff.find((p) => p.id === partidoAbierto) ?? null,
    [partidosPlayoff, partidoAbierto],
  );

  const guardarScore = async (partidoId: string, resultado: ResultadoInput) =>
    acciones.registrarResultado(partidoId, resultado);

  const clasificados = tablas.filter((f) => f.clasificado).length;

  if (!categoria) {
    return (
      <EstadoVacio
        titulo="Seleccioná una categoría"
        descripcion="Cada categoría tiene su propio cuadro eliminatorio, independiente de las demás."
      />
    );
  }

  if (partidosPlayoff.length === 0) {
    return (
      <EstadoVacio
        titulo="Todavía no hay cuadro eliminatorio"
        descripcion={
          'Generá el cuadro desde la pestaña Zonas una vez que haya al menos 2 zonas con todos sus ' +
          'resultados cargados. El cruce evita que el 1° y el 2° de una misma zona queden del mismo lado.'
        }
        icono={<IconoCuadro />}
        accion={
          <Button variante="primario" onClick={() => acciones.setTab('zonas')} disabled={clasificados < 4}>
            Ir a Zonas
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Resumen */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tono="cancha">{bracket.rondas.length} rondas</Badge>
          <Badge tono="neutro">
            {progreso.jugados}/{progreso.total} partidos
          </Badge>
          {progreso.faseActual && <Badge tono="advertencia">En juego: {ETIQUETA_FASE[progreso.faseActual]}</Badge>}
          {bracket.campeon && (
            <Badge tono="exito">Campeón: {nombrePareja(porPareja.get(bracket.campeon))}</Badge>
          )}
          {cargando && <Spinner className="h-4 w-4 text-slate-400" />}
        </div>

        <Button
          variante="fantasma"
          onClick={() => void acciones.generarCuadroPlayoffs()}
          disabled={guardando}
          title="Vuelve a generar el cuadro desde las zonas. Borra los resultados cargados."
        >
          Regenerar cuadro
        </Button>
      </div>

      {bracket.campeon && <Alerta tono="exito">¡Torneo definido! Campeón: {nombrePareja(porPareja.get(bracket.campeon))}.</Alerta>}

      {/* Bracket */}
      <Card className="overflow-x-auto p-5">
        <div className="flex min-w-max gap-8">
          {bracket.rondas.map((ronda) => (
            <Columna key={ronda.ronda} ronda={ronda} porPareja={porPareja} onAbrir={setPartidoAbierto} />
          ))}
        </div>
      </Card>

      <ScoreForm
        abierto={partidoAbiertoObj !== null}
        onCerrar={() => setPartidoAbierto(null)}
        partido={partidoAbiertoObj}
        parejas={porPareja}
        onGuardar={guardarScore}
        cargando={guardando}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Columna de una ronda                                                         */
/* -------------------------------------------------------------------------- */

function Columna({
  ronda,
  porPareja,
  onAbrir,
}: {
  ronda: ReturnType<typeof construirBracket>['rondas'][number];
  porPareja: Map<string, Pareja>;
  onAbrir: (id: string) => void;
}) {
  const n = ronda.partidos.length;
  const ultima = n === 1;

  return (
    <div className="flex w-56 shrink-0 flex-col">
      <div className="mb-3 flex items-center gap-2">
        <h4 className="text-sm font-semibold text-slate-800">{ETIQUETA_FASE[ronda.fase]}</h4>
        {n > 1 && <span className="text-xs text-slate-400">{n} partidos</span>}
      </div>

      {/* El alto de cada slot duplica por ronda: `justify-around` reparte los
          partidos centrado respecto del punto medio de sus dos predecesores. */}
      <div
        className="flex flex-1 flex-col justify-around gap-4"
        style={{ minHeight: `${Math.max(n, 1) * 132}px` }}
      >
        {ronda.partidos.map((slot) => {
          const { partido } = slot;
          const esBye = slot.esBye;

          if (esBye) {
            return (
              <TarjetaBye key={partido.id} slot={slot} porPareja={porPareja} />
            );
          }

          return (
            <TarjetaPartido
              key={partido.id}
              partido={partido}
              porPareja={porPareja}
              onAbrir={onAbrir}
              destacada={ultima}
              terminado={slot.hayGanador}
            />
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function TarjetaBye({
  slot,
  porPareja,
}: {
  slot: ReturnType<typeof construirBracket>['rondas'][number]['partidos'][number];
  porPareja: Map<string, Pareja>;
}) {
  const presente = slot.partido.pareja_1_id ?? slot.partido.pareja_2_id;
  const pareja = presente ? porPareja.get(presente) : undefined;

  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Bye · pasa directo</p>
      <p className="mt-1 truncate text-sm text-slate-600">
        {pareja ? `${pareja.j1_nombre} / ${pareja.j2_nombre}` : 'Sin pareja'}
      </p>
    </div>
  );
}

function TarjetaPartido({
  partido,
  porPareja,
  onAbrir,
  destacada,
  terminado,
}: {
  partido: import('../types').Partido;
  porPareja: Map<string, Pareja>;
  onAbrir: (id: string) => void;
  destacada: boolean;
  terminado: boolean;
}) {
  const hayScore = partido.set1_p1 !== null;

  return (
    <button
      type="button"
      onClick={() => onAbrir(partido.id)}
      className={[
        'w-full rounded-lg border p-2.5 text-left transition hover:shadow-md',
        destacada
          ? 'border-cancha-400 bg-cancha-50 ring-2 ring-cancha-200'
          : hayScore
            ? 'border-slate-200 bg-white'
            : 'border-slate-200 bg-white hover:border-cancha-300',
      ].join(' ')}
    >
      <FilaPareja
        pareja={partido.pareja_1_id ? porPareja.get(partido.pareja_1_id) : undefined}
        sets={partido}
        lado="p1"
        ganador={partido.ganador_id === partido.pareja_1_id}
      />
      <FilaPareja
        pareja={partido.pareja_2_id ? porPareja.get(partido.pareja_2_id) : undefined}
        sets={partido}
        lado="p2"
        ganador={partido.ganador_id === partido.pareja_2_id}
      />
      {!hayScore && (
        <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-cancha-600">
          Cargar resultado
        </p>
      )}
      {terminado && !destacada && (
        <p className="mt-1.5 text-[10px] text-slate-400">Finalizado</p>
      )}
    </button>
  );
}

function FilaPareja({
  pareja,
  sets,
  lado,
  ganador,
}: {
  pareja: Pareja | undefined;
  sets: import('../types').Partido;
  lado: 'p1' | 'p2';
  ganador: boolean;
}) {
  const s1 = lado === 'p1' ? sets.set1_p1 : sets.set1_p2;
  const s2 = lado === 'p1' ? sets.set2_p1 : sets.set2_p2;
  const s3 = lado === 'p1' ? sets.set3_p1 : sets.set3_p2;

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span
        className={[
          'min-w-0 flex-1 truncate text-xs',
          ganador ? 'font-semibold text-cancha-800' : 'text-slate-500',
        ].join(' ')}
      >
        {pareja ? `${pareja.j1_nombre} / ${pareja.j2_nombre}` : 'Por definir'}
      </span>
      <span
        className={[
          'shrink-0 text-xs font-bold tabular-nums',
          ganador ? 'text-cancha-700' : 'text-slate-400',
        ].join(' ')}
      >
        {[s1, s2, s3].filter((v) => v !== null).join(' ') || '–'}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Utilidades                                                                   */
/* -------------------------------------------------------------------------- */

function nombrePareja(p: Pareja | undefined): string {
  return p ? `${p.j1_nombre} / ${p.j2_nombre}` : '—';
}

function IconoCuadro() {
  return (
    <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.3}>
      <rect x="2" y="4" width="5" height="6" rx="1" />
      <rect x="2" y="14" width="5" height="6" rx="1" />
      <rect x="10" y="9" width="5" height="6" rx="1" />
      <rect x="18" y="11" width="4" height="4" rx="1" />
      <path strokeLinecap="round" d="M7 7h2a1 1 0 011 1v3M7 17h2a1 1 0 001-1v-1M15 12h3" />
    </svg>
  );
}

export default PlayoffBracket;
