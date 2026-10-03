/**
 * ZonasView — fase de grupos.
 *
 * Por cada zona muestra:
 *  - La tabla de posiciones (PJ, PG, PP, SA/SC, GA/GB, diferencias) calculada
 *    en vivo a partir de los sets cargados.
 *  - Los partidos de la zona agrupados por ronda, cada uno con su score y un
 *    botón que abre el ScoreForm.
 *  - Si la zona está completa, avisa que el 1° y el 2° clasificaron.
 *
 * Al pie, el botón "Generar cuadro eliminatorio", que se habilita solo cuando
 * hay >= 2 zonas con al menos 2 parejas.
 */

import { useMemo, useState, useEffect } from 'react';
import { useTorneo } from '../store/TorneoStore';
import type { Pareja, Partido, ResultadoInput, TablaFila, ZonaConParejas } from '../types';
import { puedeGenerarPlayoffs } from '../lib';
import { ScoreForm } from './ScoreForm';
import { Alerta, Badge, Button, Card, CardHeader, EstadoVacio, Spinner, Tabla, Td, Th } from './ui';
import { supabase } from '../../../lib/supabase';

/* -------------------------------------------------------------------------- */
/* Columnas de la tabla de posiciones                                           */
/* -------------------------------------------------------------------------- */

const COLUMNAS: { clave: keyof TablaFila | 'dif'; etiqueta: string; titulo: string }[] = [
  { clave: 'posicion', etiqueta: '#', titulo: 'Posición' },
  { clave: 'pareja', etiqueta: 'Pareja', titulo: 'Pareja' },
  { clave: 'pj', etiqueta: 'PJ', titulo: 'Partidos jugados' },
  { clave: 'pg', etiqueta: 'PG', titulo: 'Partidos ganados' },
  { clave: 'pp', etiqueta: 'PP', titulo: 'Partidos perdidos' },
  { clave: 'sa', etiqueta: 'SA', titulo: 'Sets a favor' },
  { clave: 'sc', etiqueta: 'SC', titulo: 'Sets en contra' },
  { clave: 'difSets', etiqueta: 'DS', titulo: 'Diferencia de sets' },
  { clave: 'ga', etiqueta: 'GA', titulo: 'Games a favor' },
  { clave: 'gb', etiqueta: 'GB', titulo: 'Games en contra' },
  { clave: 'difGames', etiqueta: 'DG', titulo: 'Diferencia de games' },
];

export function ZonasView() {
  const { categoria, zonas, partidosPorZona, tablas, acciones, guardando, cargando } = useTorneo();

  const [partidoAbierto, setPartidoAbierto] = useState<Partido | null>(null);

  const [cuposPorZona, setCuposPorZona] = useState<Map<string, number>>(() => {
    const map = new Map<string, number>();
    for (const z of zonas) {
      map.set(z.id, (z as any).clasificados_count ?? 2);
    }
    return map;
  });

  useEffect(() => {
    setCuposPorZona((prev) => {
      let cambiado = false;
      const nuevo = new Map(prev);
      for (const z of zonas) {
        const dbCupo = (z as any).clasificados_count;
        // Si la DB tiene un valor, y es distinto a nuestro estado actual, actualizamos.
        // Solo sobrescribimos si el valor viene efectivamente de la DB y es distinto.
        if (dbCupo !== undefined && dbCupo !== prev.get(z.id)) {
          nuevo.set(z.id, dbCupo);
          cambiado = true;
        } else if (dbCupo === undefined && !prev.has(z.id)) {
          nuevo.set(z.id, 2);
          cambiado = true;
        }
      }
      return cambiado ? nuevo : prev;
    });
  }, [zonas]);

  const porPareja = useMemo(() => {
    const mapa = new Map<string, Pareja>();
    for (const z of zonas) for (const p of z.parejas) mapa.set(p.id, p);
    return mapa;
  }, [zonas]);

  /** Tabla de cada zona: la global se parte por `zona_id`. */
  const tablasPorZona = useMemo(() => {
    const mapa = new Map<string, TablaFila[]>();
    for (const fila of tablas) {
      if (!fila.zona_id) continue;
      const lista = mapa.get(fila.zona_id) ?? [];
      lista.push(fila);
      mapa.set(fila.zona_id, lista);
    }
    for (const lista of mapa.values()) lista.sort((a, b) => a.posicion - b.posicion);
    return mapa;
  }, [tablas]);

  const zonasCompletas = useMemo(
    () =>
      zonas.filter((z) => {
        const tabla = tablasPorZona.get(z.id) ?? [];
        return tabla.length >= 2 && tabla.every((f) => f.pendientes === 0);
      }).length,
    [zonas, tablasPorZona],
  );

  const getCupo = (zonaId: string, totalParejas: number) => {
    return cuposPorZona.get(zonaId) ?? Math.min(2, totalParejas);
  };

  const totalClasificados = useMemo(
    () => zonas.reduce((sum, z) => sum + getCupo(z.id, z.parejas.length), 0),
    [zonas, cuposPorZona],
  );

  const faseInicio = useMemo(() => {
    if (totalClasificados <= 2) return 'Final';
    if (totalClasificados <= 4) return 'Semifinales (4)';
    if (totalClasificados <= 8) return 'Cuartos de Final (8)';
    if (totalClasificados <= 16) return 'Octavos de Final (16)';
    return `${totalClasificados} parejas`;
  }, [totalClasificados]);

  const puedeGenerarCuadro = zonas.length >= 2 && zonasCompletas >= 2 && totalClasificados >= 4;

  const guardarScore = async (partidoId: string, resultado: ResultadoInput) =>
    acciones.registrarResultado(partidoId, resultado);

  if (!categoria) {
    return (
      <EstadoVacio
        titulo="Seleccioná una categoría"
        descripcion="Las zonas son independientes por categoría: elegí una pestaña para ver su fixture."
      />
    );
  }

  if (zonas.length === 0) {
    return (
      <EstadoVacio
        titulo="Todavía no hay zonas sorteadas"
        descripcion={
          'En la pestaña Inscripciones, cargá las parejas y presioná "Sortear zonas". ' +
          'Solo entran las parejas con pago confirmado (pagado o seña).'
        }
        icono={<IconoZonas />}
        accion={
          <Button variante="primario" onClick={() => acciones.setTab('inscripciones')}>
            Ir a Inscripciones
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Resumen de la fase */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <Badge tono="cancha">{zonas.length} zonas</Badge>
          <Badge tono={zonasCompletas === zonas.length ? 'exito' : 'advertencia'}>
            {zonasCompletas} de {zonas.length} completas
          </Badge>
          {cargando && <Spinner className="h-4 w-4 text-slate-400" />}
        </div>

        <div className="flex items-center gap-2">
          <Button variante="fantasma" onClick={() => void acciones.generarFixtureZonas()} disabled={guardando}>
            Regenerar fixture
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl shadow-sm transition-all cursor-pointer"
            onClick={() => void acciones.generarCuadroPlayoffs(cuposPorZona.size > 0 ? cuposPorZona : undefined)}
            cargando={guardando}
            disabled={!puedeGenerarPlayoffs(zonas.length)}
          >
            Generar cuadro eliminatorio
          </Button>
        </div>
      </div>

      {!puedeGenerarCuadro && zonas.length >= 2 && (
        <Alerta tono="advertencia">
          Para generar el cuadro necesitás al menos <strong>2 zonas completas</strong> (con todos sus partidos
          cargados) y al menos 4 clasificados. Ahora mismo hay {zonasCompletas} zonas completas y {totalClasificados} clasificados.
        </Alerta>
      )}

      {/* Configuración de clasificados por zona */}
      {zonas.length >= 2 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-800">Clasificados a Playoffs</h3>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-600">Total clasificados:</span>
              <span className="bg-blue-600 text-white font-bold px-2 py-0.5 rounded-lg">{totalClasificados}</span>
              <span className="text-slate-500">→</span>
              <span className="font-semibold text-blue-700">{faseInicio}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {zonas.map((zona) => {
              const maxParejasZona = zona.parejas.length;
              const cupoActual = getCupo(zona.id, maxParejasZona);
              return (
                <div key={zona.id} className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm">
                  <span className="text-xs font-semibold text-slate-700">{zona.nombre}</span>
                  <span className="text-[10px] text-slate-400">({maxParejasZona}p)</span>
                  <select
                    value={cupoActual}
                    onChange={async (e) => {
                      const nuevoValor = Number(e.target.value);
                      const nuevo = new Map(cuposPorZona);
                      nuevo.set(zona.id, nuevoValor);
                      setCuposPorZona(nuevo);
                      
                      // Persistencia en base de datos
                      await supabase
                        .schema('torneo')
                        .from('torneo_zonas')
                        .update({ clasificados_count: nuevoValor })
                        .eq('id', zona.id);
                    }}
                    className="h-7 w-14 rounded-md border border-slate-300 bg-white text-xs font-bold text-center text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {Array.from({ length: maxParejasZona }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cards por zona */}
      <div className="grid gap-4 xl:grid-cols-2">
        {zonas.map((zona) => (
          <CardZona
            key={zona.id}
            zona={zona}
            tabla={tablasPorZona.get(zona.id) ?? []}
            partidos={partidosPorZona.get(zona.id) ?? []}
            porPareja={porPareja}
            cupo={getCupo(zona.id, zona.parejas.length)}
            onCargarScore={(p) => setPartidoAbierto(p)}
          />
        ))}
      </div>

      <ScoreForm
        abierto={partidoAbierto !== null}
        onCerrar={() => setPartidoAbierto(null)}
        partido={partidoAbierto}
        parejas={porPareja}
        onGuardar={guardarScore}
        cargando={guardando}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Card de una zona                                                             */
/* -------------------------------------------------------------------------- */

function CardZona({
  zona,
  tabla,
  partidos,
  porPareja,
  cupo,
  onCargarScore,
}: {
  zona: ZonaConParejas;
  tabla: TablaFila[];
  partidos: Partido[];
  porPareja: Map<string, Pareja>;
  cupo: number;
  onCargarScore: (partido: Partido) => void;
}) {
  const porRonda = useMemo(() => {
    const mapa = new Map<number, Partido[]>();
    for (const p of partidos) {
      const r = p.ronda ?? 1;
      const lista = mapa.get(r) ?? [];
      lista.push(p);
      mapa.set(r, lista);
    }
    return [...mapa.entries()].sort((a, b) => a[0] - b[0]);
  }, [partidos]);

  const completa = tabla.length >= 2 && tabla.every((f) => f.pendientes === 0);
  const indebida = tabla.some((f) => f.pendientes > 0);

  return (
    <Card className="overflow-hidden">
      <CardHeader
        titulo={
          <span className="flex items-center gap-2">
            {zona.nombre}
            <span className="text-xs font-normal text-slate-400">
              {zona.parejas.length} parejas · {partidos.length} partidos
            </span>
          </span>
        }
        acciones={
          completa ? (
            <Badge tono="exito" conPunto>
              Lista para el cuadro
            </Badge>
          ) : indebida ? (
            <Badge tono="advertencia" conPunto>
              {tabla.reduce((a, f) => a + f.pendientes, 0) / 2} partidos pendientes
            </Badge>
          ) : (
            <Badge tono="neutro">Sin resultados</Badge>
          )
        }
      />

      {/* Tabla de posiciones */}
      <Tabla>
        <thead>
          <tr>
            {COLUMNAS.map((c) => (
              <Th key={c.etiqueta} alinear={c.clave === 'pareja' ? 'izquierda' : 'centro'} title={c.titulo}>
                {c.etiqueta}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tabla.map((fila) => (
            <FilaPosicion key={fila.pareja.id} fila={fila} cupo={cupo} />
          ))}
          {tabla.length === 0 && (
            <tr>
              <Td colSpan={COLUMNAS.length} className="py-6 text-center text-slate-400">
                Sin parejas en esta zona.
              </Td>
            </tr>
          )}
        </tbody>
      </Tabla>

      {/* Partidos por ronda */}
      <div className="space-y-3 border-t border-slate-100 p-4">
        {porRonda.map(([ronda, lista]) => (
          <div key={ronda}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Ronda {ronda}
            </p>
            <ul className="space-y-1.5">
              {lista.map((partido) => (
                <li key={partido.id}>
                  <FilaPartido partido={partido} porPareja={porPareja} onCargar={onCargarScore} />
                </li>
              ))}
            </ul>
          </div>
        ))}

        {partidos.length === 0 && (
          <p className="py-2 text-center text-xs text-slate-400">
            Esta zona tiene menos de 2 parejas, así que no genera partidos.
          </p>
        )}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function FilaPosicion({ fila, cupo }: { fila: TablaFila; cupo: number }) {
  const esTop = fila.posicion <= cupo;

  return (
    <tr className={esTop ? 'bg-cancha-50/40' : undefined}>
      <Td alinear="centro">
        <span
          className={[
            'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
            fila.posicion === 1
              ? 'bg-amber-100 text-amber-700'
              : fila.posicion === 2
                ? 'bg-slate-200 text-slate-600'
                : 'bg-slate-50 text-slate-400',
          ].join(' ')}
        >
          {fila.posicion}
        </span>
      </Td>
      <Td>
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-slate-800">{fila.pareja.j1_nombre}</span>
          {esTop && <span className="text-[10px] text-cancha-600">clasifica</span>}
          <div className="text-slate-500">{fila.pareja.j2_nombre}</div>
        </div>
      </Td>
      <Td alinear="centro" className="tabular-nums">{fila.pj}</Td>
      <Td alinear="centro" className="tabular-nums font-medium text-emerald-700">{fila.pg}</Td>
      <Td alinear="centro" className="tabular-nums text-slate-500">{fila.pp}</Td>
      <Td alinear="centro" className="tabular-nums">{fila.sa}</Td>
      <Td alinear="centro" className="tabular-nums text-slate-500">{fila.sc}</Td>
      <CeldaDiferencia valor={fila.difSets} />
      <Td alinear="centro" className="tabular-nums">{fila.ga}</Td>
      <Td alinear="centro" className="tabular-nums text-slate-500">{fila.gb}</Td>
      <CeldaDiferencia valor={fila.difGames} />
    </tr>
  );
}

function CeldaDiferencia({ valor }: { valor: number }) {
  const tono = valor > 0 ? 'text-emerald-700' : valor < 0 ? 'text-red-600' : 'text-slate-400';
  return (
    <Td alinear="centro" className={`tabular-nums font-medium ${tono}`}>
      {valor > 0 ? `+${valor}` : valor}
    </Td>
  );
}

/* -------------------------------------------------------------------------- */

function FilaPartido({
  partido,
  porPareja,
  onCargar,
}: {
  partido: Partido;
  porPareja: Map<string, Pareja>;
  onCargar: (partido: Partido) => void;
}) {
  const p1 = partido.pareja_1_id ? porPareja.get(partido.pareja_1_id) : undefined;
  const p2 = partido.pareja_2_id ? porPareja.get(partido.pareja_2_id) : undefined;
  const ganador = partido.ganador_id;
  const tieneScore = partido.set1_p1 !== null;

  return (
    <button
      type="button"
      onClick={() => onCargar(partido)}
      className={[
        'flex w-full items-center gap-3 rounded-lg border p-2 text-left transition hover:shadow-sm',
        tieneScore ? 'border-cancha-200 bg-cancha-50/40 hover:border-cancha-300' : 'border-slate-200 bg-white hover:border-slate-300',
      ].join(' ')}
    >
      <div className="min-w-0 flex-1">
        <div
          className={[
            'truncate text-sm',
            ganador === partido.pareja_1_id ? 'font-semibold text-cancha-800' : 'text-slate-700',
          ].join(' ')}
        >
          {p1 ? `${p1.j1_nombre} / ${p1.j2_nombre}` : 'Por definir'}
        </div>
        <div
          className={[
            'truncate text-sm',
            ganador === partido.pareja_2_id ? 'font-semibold text-cancha-800' : 'text-slate-700',
          ].join(' ')}
        >
          {p2 ? `${p2.j1_nombre} / ${p2.j2_nombre}` : 'Por definir'}
        </div>
      </div>

      {tieneScore ? (
        <div className="shrink-0 text-right">
          <div className="text-sm font-bold tabular-nums text-cancha-800">
            {partido.set1_p1} · {partido.set1_p2}
          </div>
          <div className="text-xs tabular-nums text-slate-500">
            {(partido.set2_p1 ?? '-') + '-' + (partido.set2_p2 ?? '-')}
            {partido.set3_p1 !== null && ` · TB ${partido.set3_p1}-${partido.set3_p2}`}
          </div>
        </div>
      ) : (
        <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-500">
          Cargar score
        </span>
      )}
    </button>
  );
}

function IconoZonas() {
  return (
    <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.3}>
      <rect x="3" y="3" width="8" height="18" rx="1.5" />
      <rect x="13" y="3" width="8" height="18" rx="1.5" />
      <path d="M7 7v10M17 7v10" strokeLinecap="round" />
    </svg>
  );
}
