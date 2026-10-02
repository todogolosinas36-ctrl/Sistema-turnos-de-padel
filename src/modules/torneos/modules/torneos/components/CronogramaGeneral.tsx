/**
 * CronogramaGeneral — grilla por cancha con validacion de superposiciones.
 *
 * Dos partes:
 *  1. Grilla visual: una columna por cancha, con los partidos posicionados en
 *     escala de tiempo (minutes desde las 00:00) y solapados a la vista.
 *  2. Panel de conflictos: doble reserva, pareja jugando dos veces y descanso
 *     insuficiente. Los errores bloquean el guardado; las advertencias no.
 *
 * La asignacion se hace con un modal por partido: cancha + fecha + hora. Antes
 * de escribir en la base se valida en el cliente (respuesta instantanea) y la
 * RPC/RLS valida de nuevo en el servidor.
 */

import { useMemo, useState } from 'react';
import { useTorneo } from '../store/TorneoStore';
import type { Cancha, Partido, PartidoAgenda } from '../types';
import { construirGrilla, buscarSlotLibre, generarSlots, validarCronograma, resumenCronograma, ETIQUETA_FASE } from '../lib';
import { AsignarCanchaHorarioModal } from './AsignarCanchaHorarioModal';
import { Alerta, Badge, Button, Card, EstadoVacio, Spinner, Tabla, Td, Th } from './ui';

/** Alto de la grilla en px por hora de torneo. */
const PX_POR_HORA = 96;

export function CronogramaGeneral() {
  const { torneo, categoria, agenda, sinAgendar, parejas, canchas, acciones, guardando, cargando } = useTorneo();

  const [modalAbierto, setModalAbierto] = useState(false);
  const [partidoObjetivo, setPartidoObjetivo] = useState<Partido | null>(null);
  const [soloConflictos, setSoloConflictos] = useState(false);

  const opcionesValidacion = useMemo(
    () => ({
      descansoMin: torneo?.descanso_min_entre_partidos ?? 30,
      duracionMin: torneo?.duracion_partido_min ?? 75,
      torneo: torneo ?? null,
    }),
    [torneo],
  );

  const conflictos = useMemo(
    () => validarCronograma(agenda, opcionesValidacion, parejas),
    [agenda, opcionesValidacion, parejas],
  );

  const resumen = useMemo(
    () => resumenCronograma(agenda.length + sinAgendar.length, agenda.length, conflictos),
    [agenda, sinAgendar, conflictos],
  );
  const grilla = useMemo(
    () => construirGrilla(agenda, canchas, opcionesValidacion.duracionMin),
    [agenda, canchas, opcionesValidacion.duracionMin],
  );

  /** Partidos con al menos un conflicto, para poder resaltarlos. */
  const partidosEnConflicto = useMemo(() => {
    const ids = new Set<string>();
    for (const c of conflictos) {
      for (const id of c.partidoIds) ids.add(id);
    }
    return ids;
  }, [conflictos]);

  const visibles = useMemo(
    () => (soloConflictos ? agenda.filter((p) => partidosEnConflicto.has(p.id)) : agenda),
    [agenda, soloConflictos, partidosEnConflicto],
  );

  /** Franja horaria de la grilla: el torneo abre y cierra con margen. */
  const franja = useMemo(() => {
    const desde = aMinutos(torneo?.hora_inicio ?? '09:00');
    const hasta = aMinutos(torneo?.hora_fin ?? '22:00');
    return { desde, hasta: Math.max(hasta, desde + 60) };
  }, [torneo]);

  const abrirAsignar = (partido: Partido | null) => {
    setPartidoObjetivo(partido);
    setModalAbierto(true);
  };

  /** Asigna todos los partidos pendientes al primer slot libre que encuentre. */
  const autoCompletar = async () => {
    if (!torneo || sinAgendar.length === 0) return;

    const slots = generarSlots(torneo, canchas);
    const asignaciones: { partido_id: string; cancha_id: string | null; horario: string | null }[] = [];
    // Copia de la agenda que se va llenando, para respetar lo ya asignado.
    const agendaSimulada: PartidoAgenda[] = [...agenda];

    for (const partido of sinAgendar) {
      const parejaIds = [partido.pareja_1_id, partido.pareja_2_id].filter((x): x is string => Boolean(x));
      let elegido: Cancha | null = null;
      let inicio: Date | null = null;

      for (const slot of slots) {
        if (buscarSlotLibre(slot, parejaIds, agendaSimulada, opcionesValidacion)) {
          elegido = canchas.find((c) => c.id === slot.cancha_id) ?? null;
          inicio = slot.inicio;
          break;
        }
      }

      if (elegido && inicio) {
        const horario = inicio.toISOString();
        asignaciones.push({ partido_id: partido.id, cancha_id: elegido.id, horario });
        agendaSimulada.push({
          ...partido,
          cancha_id: elegido.id,
          horario,
          inicio,
          fin: new Date(inicio.getTime() + opcionesValidacion.duracionMin * 60_000),
          pareja_1: parejaIds[0] ? (parejas.find((p) => p.id === parejaIds[0]) ?? null) : null,
          pareja_2: parejaIds[1] ? (parejas.find((p) => p.id === parejaIds[1]) ?? null) : null,
          cancha: elegido,
        });
      }
    }

    if (asignaciones.length === 0) {
      acciones.setAviso('No quedan slots libres con los horarios y canchas actuales.');
      return;
    }
    await acciones.guardarAgenda(asignaciones);
    acciones.setAviso(
      `${asignaciones.length} partidos asignados. Quedaron ${sinAgendar.length - asignaciones.length} sin horario.`,
    );
  };

  if (!torneo || !categoria) {
    return (
      <EstadoVacio
        titulo="Seleccioná un torneo y una categoría"
        descripcion="El cronograma se arma sobre el torneo (horarios, canchas y descanso mínimo) y una categoría."
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Resumen */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tono="cancha">
            {resumen.conHorario} con horario · {resumen.sinHorario} pendientes
          </Badge>
          {resumen.errores > 0 && <Badge tono="peligro">{resumen.errores} conflictos</Badge>}
          {resumen.advertencias > 0 && <Badge tono="advertencia">{resumen.advertencias} avisos</Badge>}
          {cargando && <Spinner className="h-4 w-4 text-slate-400" />}
        </div>

        <div className="flex items-center gap-2">
          <Button variante="fantasma" onClick={() => setSoloConflictos((v) => !v)}>
            {soloConflictos ? 'Ver todos' : 'Solo conflictos'}
          </Button>
          <Button
            variante="secundario"
            onClick={autoCompletar}
            disabled={guardando || sinAgendar.length === 0}
            title={sinAgendar.length === 0 ? 'No hay partidos pendientes de asignar' : undefined}
          >
            Completar automáticamente
          </Button>
          <Button variante="primario" onClick={() => abrirAsignar(null)} disabled={sinAgendar.length === 0}>
            Asignar horario
          </Button>
        </div>
      </div>

      {/* Conflictos */}
      {conflictos.length > 0 && (
        <Alerta tono={resumen.errores > 0 ? 'error' : 'advertencia'}>
          <p className="font-medium">
            {resumen.errores > 0
              ? `Hay ${resumen.errores} conflictos que impiden dar por buena la agenda:`
              : 'Avisos de la agenda:'}
          </p>
          <ul className="mt-1.5 space-y-1 text-xs">
            {conflictos.slice(0, 6).map((c, i) => (
              <li key={`${c.tipo}-${i}`} className="flex items-start gap-1.5">
                <span aria-hidden>{c.severidad === 'error' ? '✕' : '!'}</span>
                <span>{c.mensaje}</span>
              </li>
            ))}
            {conflictos.length > 6 && <li>… y {conflictos.length - 6} más.</li>}
          </ul>
        </Alerta>
      )}

      {/* Grilla por cancha */}
      {agenda.length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay partidos con horario"
          descripcion={
            'Asigná cancha y horario manualmente, o usá "Completar automáticamente" para que el módulo ' +
            'busque los slots libres respetando el descanso mínimo entre partidos de una misma pareja.'
          }
          accion={
            <Button variante="primario" onClick={autoCompletar} disabled={sinAgendar.length === 0}>
              Completar automáticamente
            </Button>
          }
        />
      ) : (
        <Card className="overflow-x-auto p-4">
          <div className="flex min-w-max gap-3">
            {grilla.map((columna) => (
              <ColumnaCancha
                key={columna.cancha.id}
                columna={columna}
                franja={franja}
                partidosEnConflicto={partidosEnConflicto}
                onAbrir={abrirAsignar}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Listado plano: útil para imprimir o copiar */}
      <Card>
        <div className="border-b border-slate-100 px-4 py-2.5">
          <h3 className="text-sm font-semibold text-slate-800">
            Agenda por orden de hora ({visibles.length})
          </h3>
        </div>
        {visibles.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">No hay partidos para mostrar.</p>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Horario</Th>
                <Th>Cancha</Th>
                <Th>Fase</Th>
                <Th>Pareja 1</Th>
                <Th>Pareja 2</Th>
                <Th alinear="centro">Resultado</Th>
                <Th alinear="derecha">Estado</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...visibles]
                .sort((a, b) => (a.inicio?.getTime() ?? 0) - (b.inicio?.getTime() ?? 0))
                .map((p) => (
                  <tr
                    key={p.id}
                    className={partidosEnConflicto.has(p.id) ? 'bg-red-50/50' : undefined}
                  >
                    <Td className="whitespace-nowrap tabular-nums">
                      {p.inicio ? formatearHora(p.inicio) : '—'}
                      {p.fin && (
                        <span className="text-xs text-slate-400"> · {formatearHora(p.fin)}</span>
                      )}
                    </Td>
                    <Td>{p.cancha?.nombre ?? <span className="text-slate-400">sin asignar</span>}</Td>
                    <Td>
                      <Badge tono="neutro">{ETIQUETA_FASE[p.fase] ?? p.fase}</Badge>
                    </Td>
                    <Td>{p.pareja_1 ? `${p.pareja_1.j1_nombre} / ${p.pareja_1.j2_nombre}` : 'Por definir'}</Td>
                    <Td>{p.pareja_2 ? `${p.pareja_2.j1_nombre} / ${p.pareja_2.j2_nombre}` : 'Por definir'}</Td>
                    <Td alinear="centro" className="tabular-nums">
                      {p.set1_p1 !== null
                        ? `${p.set1_p1}-${p.set1_p2}` +
                          (p.set2_p1 !== null ? ` ${p.set2_p1}-${p.set2_p2}` : '') +
                          (p.set3_p1 !== null ? ` TB ${p.set3_p1}-${p.set3_p2}` : '')
                        : '—'}
                    </Td>
                    <Td alinear="derecha">
                      <Button tamano="sm" variante="fantasma" onClick={() => abrirAsignar(p)}>
                        Reasignar
                      </Button>
                    </Td>
                  </tr>
                ))}
            </tbody>
          </Tabla>
        )}
      </Card>

      <AsignarCanchaHorarioModal
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        partido={partidoObjetivo}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Columna de una cancha en la grilla                                           */
/* -------------------------------------------------------------------------- */

function ColumnaCancha({
  columna,
  franja,
  partidosEnConflicto,
  onAbrir,
}: {
  columna: ReturnType<typeof construirGrilla>[number];
  franja: { desde: number; hasta: number };
  partidosEnConflicto: Set<string>;
  onAbrir: (p: Partido) => void;
}) {
  const horas = useMemo(() => {
    const out: number[] = [];
    for (let m = Math.floor(franja.desde / 60); m <= Math.ceil(franja.hasta / 60); m++) out.push(m * 60);
    return out;
  }, [franja]);

  const altoTotal = ((franja.hasta - franja.desde) / 60) * PX_POR_HORA;

  return (
    <div className="w-52 shrink-0">
      {/* Cabecera de la cancha */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">{columna.cancha.nombre}</span>
        <span className="text-xs text-slate-400">{columna.total}</span>
      </div>

      {columna.celdas.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center text-xs text-slate-400"
          style={{ height: altoTotal }}
        >
          Sin partidos
        </div>
      ) : (
        <div className="relative rounded-lg bg-slate-50" style={{ height: altoTotal }}>
          {/* Rejilla horaria */}
          {horas.map((m) => (
            <div
              key={m}
              className="absolute left-0 right-0 border-t border-slate-200/70"
              style={{ top: ((m - franja.desde) / 60) * PX_POR_HORA }}
            >
              <span className="absolute -top-2 left-1 bg-slate-50 px-1 text-[10px] text-slate-400">
                {String(Math.floor(m / 60)).padStart(2, '0')}:00
              </span>
            </div>
          ))}

          {/* Partidos posicionados */}
          {columna.celdas.map((celda) => {
            const arriba = ((celda.offsetMin - franja.desde) / 60) * PX_POR_HORA;
            const enConflicto = partidosEnConflicto.has(celda.partido.id);
            const resuelto = celda.partido.ganador_id !== null;

            return (
              <button
                key={celda.partido.id}
                type="button"
                onClick={() => onAbrir(celda.partido)}
                className={[
                  'absolute left-1 right-1 overflow-hidden rounded-md border p-1.5 text-left shadow-sm transition hover:z-10 hover:shadow-md',
                  enConflicto
                    ? 'border-red-400 bg-red-50'
                    : resuelto
                      ? 'border-cancha-300 bg-cancha-50'
                      : 'border-slate-300 bg-white',
                ].join(' ')}
                style={{
                  top: Math.max(arriba, 0),
                  height: Math.max((celda.duracionMin / 60) * PX_POR_HORA - 4, 34),
                }}
              >
                <p className="truncate text-[10px] font-semibold tabular-nums text-slate-500">
                  {formatearHora(celda.inicio)} · {ETIQUETA_FASE[celda.partido.fase] ?? ''}
                </p>
                <p className="truncate text-[11px] font-medium text-slate-800">
                  {celda.partido.pareja_1 ? `${celda.partido.pareja_1.j1_nombre} / ${celda.partido.pareja_1.j2_nombre}` : 'Por definir'}
                </p>
                <p className="truncate text-[11px] font-medium text-slate-800">
                  {celda.partido.pareja_2 ? `${celda.partido.pareja_2.j1_nombre} / ${celda.partido.pareja_2.j2_nombre}` : 'Por definir'}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatearHora(fecha: Date): string {
  return fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default CronogramaGeneral;
