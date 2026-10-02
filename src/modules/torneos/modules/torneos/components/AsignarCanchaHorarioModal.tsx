/**
 * Modal de asignacion de cancha y horario.
 *
 * Valida antes de guardar (respuesta instantanea, sin round-trip):
 *  - La cancha no esta ocupada en ese rango.
 *  - Ninguna de las parejas juega a la vez ni viola el descanso minimo.
 *  - El slot cae dentro del horario y los dias jugables del torneo.
 *
 * Los slots invalidos se muestran tachados con el motivo, para que el arbitro
 * vea por que no puede elegir esa hora.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTorneo } from '../store/TorneoStore';
import type { Partido, PartidoAgenda } from '../types';
import { buscarSlotLibre, generarSlots, validarCronograma, sumarMinutos } from '../lib';
import { Alerta, Button, Modal, Select } from './ui';

export interface AsignarCanchaHorarioModalProps {
  abierto: boolean;
  onCerrar: () => void;
  partido: Partido | null;
}

export function AsignarCanchaHorarioModal({ abierto, onCerrar, partido }: AsignarCanchaHorarioModalProps) {
  const { torneo, agenda, parejas, canchas, acciones, guardando } = useTorneo();

  const [canchaId, setCanchaId] = useState<string>('');
  const [fecha, setFecha] = useState<string>('');
  const [hora, setHora] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const parejaIds = useMemo(
    () => [partido?.pareja_1_id, partido?.pareja_2_id].filter((x): x is string => Boolean(x)),
    [partido],
  );

  /** Partidos con horario, excluyendo el que se está editando. */
  const otros = useMemo(() => agenda.filter((p) => p.id !== partido?.id), [agenda, partido]);

  /* ---------------------------------------------------------------- */
  /* Slots disponibles para la cancha elegida                           */
  /* ---------------------------------------------------------------- */

  const slots = useMemo(() => {
    if (!torneo || !canchaId) return [];
    const canchasFiltradas = canchas.filter((c) => c.id === canchaId);
    const todos = generarSlots(torneo, canchasFiltradas, fecha ? [fecha] : undefined);
    return todos.map((slot) => {
      const libre = buscarSlotLibre(slot, parejaIds, otros, {
        descansoMin: torneo.descanso_min_entre_partidos,
        duracionMin: torneo.duracion_partido_min,
      });
      return { ...slot, libre: Boolean(libre) };
    });
  }, [torneo, canchaId, fecha, parejaIds, otros]);

  const slotsLibres = slots.filter((s) => s.libre);

  /** Días jugables del torneo, para el selector de fecha. */
  const dias = useMemo(() => {
    if (!torneo) return [];
    const out: { value: string; label: string }[] = [];
    const actual = new Date(`${torneo.fecha_inicio}T00:00:00`);
    const fin = new Date(`${torneo.fecha_fin}T00:00:00`);

    for (let i = 0; i < 400 && actual <= fin; i++) {
      const iso = actual.toISOString().slice(0, 10);
      const dow = actual.getDay() === 0 ? 7 : actual.getDay();
      if (torneo.dias_juego.includes(dow)) {
        out.push({
          value: iso,
          label: actual.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
        });
      }
      actual.setDate(actual.getDate() + 1);
    }
    return out;
  }, [torneo]);

  /* ---------------------------------------------------------------- */
  /* Inicializacion                                                    */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!abierto) return;

    if (partido?.cancha_id) {
      setCanchaId(partido.cancha_id);
      const d = partido.horario ? new Date(partido.horario) : null;
      setFecha(d ? d.toISOString().slice(0, 10) : '');
      setHora(d ? d.toTimeString().slice(0, 5) : '');
    } else {
      setCanchaId(canchas[0]?.id ?? '');
      setFecha(dias[0]?.value ?? '');
      setHora('');
    }
    setError(null);
  }, [abierto, partido, canchas, dias]);

  /* ---------------------------------------------------------------- */
  /* Guardado                                                          */
  /* ---------------------------------------------------------------- */

  const guardar = async () => {
    if (!partido) return;
    if (!canchaId) {
      setError('Elegí una cancha.');
      return;
    }
    if (!fecha || !hora) {
      setError('Elegí fecha y hora.');
      return;
    }

    // `datetime-local` no trae zona: se interpreta en hora local del navegador,
    // que es la que ve el usuario. Se manda ISO con offset a la base.
    const inicio = new Date(`${fecha}T${hora}:00`);

    // Chequeo final con el validador completo (incluye horario del torneo).
    const duracion = torneo?.duracion_partido_min ?? 75;
    const p1 = parejas.find((p) => p.id === partido.pareja_1_id) ?? null;
    const p2 = parejas.find((p) => p.id === partido.pareja_2_id) ?? null;

    const propuesta: PartidoAgenda[] = [
      ...otros,
      {
        ...partido,
        cancha_id: canchaId,
        horario: inicio.toISOString(),
        inicio,
        fin: sumarMinutos(inicio, duracion),
        pareja_1: p1,
        pareja_2: p2,
        cancha: canchas.find((c) => c.id === canchaId) ?? null,
      },
    ];

    const conflictos = validarCronograma(propuesta, {
      descansoMin: torneo?.descanso_min_entre_partidos ?? 30,
      duracionMin: torneo?.duracion_partido_min ?? 75,
      torneo: torneo ?? null,
    }).filter((c) => c.severidad === 'error' && c.partidoIds.includes(partido.id));

    if (conflictos.length > 0) {
      setError(conflictos[0].mensaje);
      return;
    }

    const r = await acciones.guardarAgenda([
      { partido_id: partido.id, cancha_id: canchaId, horario: inicio.toISOString() },
    ]);

    if (r.ok) {
      onCerrar();
    } else {
      setError(r.error.mensaje);
    }
  };

  const quitar = async () => {
    if (!partido) return;
    const r = await acciones.guardarAgenda([
      { partido_id: partido.id, cancha_id: null, horario: null },
    ]);
    if (r.ok) onCerrar();
    else setError(r.error.mensaje);
  };

  const nombreParejas = useMemo(() => {
    if (!partido) return '';
    const p1 = parejas.find((p) => p.id === partido.pareja_1_id);
    const p2 = parejas.find((p) => p.id === partido.pareja_2_id);
    const fmt = (p?: { j1_nombre: string; j2_nombre: string }) => (p ? `${p.j1_nombre} / ${p.j2_nombre}` : 'Por definir');
    return `${fmt(p1)} vs ${fmt(p2)}`;
  }, [partido, parejas]);

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="lg"
      titulo="Asignar cancha y horario"
      descripcion={partido ? nombreParejas : undefined}
      pie={
        <>
          {partido?.horario && (
            <Button variante="fantasma" onClick={quitar} disabled={guardando} className="mr-auto">
              Quitar asignación
            </Button>
          )}
          <Button variante="fantasma" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button variante="primario" onClick={guardar} cargando={guardando}>
            Guardar asignación
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alerta tono="error">{error}</Alerta>}

        {/* Avisos de las parejas */}
        {parejasConRestriccion(partido, parejas).length > 0 && (
          <Alerta tono="advertencia">
            <p className="font-medium">Restricciones horarias declaradas:</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {parejasConRestriccion(partido, parejas).map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs">Esta restricción es informative: el módulo no puede aplicarla sola.</p>
          </Alerta>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            label="Cancha"
            value={canchaId}
            onChange={(e) => setCanchaId(e.target.value)}
            opciones={canchas.map((c) => ({ value: c.id, label: c.nombre }))}
            placeholder="Elegí una cancha"
          />
          <Select
            label="Fecha"
            value={fecha}
            onChange={(e) => {
              setFecha(e.target.value);
              setHora('');
            }}
            opciones={dias.map((d) => ({ value: d.value, label: d.label }))}
            placeholder="Elegí un día"
          />
          <div className="w-full">
            <label className="mb-1 block text-xs font-medium text-slate-700">Hora</label>
            {slotsLibres.length === 0 ? (
              <p className="flex h-10 items-center rounded-lg bg-slate-50 px-3 text-xs text-slate-400">
                Sin horarios libres
              </p>
            ) : (
              <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto rounded-lg border border-slate-300 p-1.5">
                {slotsLibres.map((s) => {
                  const etiqueta = s.inicio.toTimeString().slice(0, 5);
                  return (
                    <button
                      key={s.inicio.toISOString()}
                      type="button"
                      onClick={() => setHora(etiqueta)}
                      className={[
                        'rounded-md px-2 py-1 text-xs font-medium tabular-nums transition',
                        hora === etiqueta
                          ? 'bg-cancha-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-cancha-100 hover:text-cancha-800',
                      ].join(' ')}
                    >
                      {etiqueta}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Slots ocupados */}
        {slots.length > 0 && slots.some((s) => !s.libre) && (
          <details className="rounded-lg bg-slate-50 p-3">
            <summary className="cursor-pointer text-xs font-medium text-slate-600">
              Ver horarios no disponibles ({slots.filter((s) => !s.libre).length})
            </summary>
            <ul className="mt-2 flex flex-wrap gap-1">
              {slots
                .filter((s) => !s.libre)
                .map((s) => (
                  <li
                    key={s.inicio.toISOString()}
                    className="rounded-md bg-slate-200 px-2 py-1 text-xs tabular-nums text-slate-500 line-through"
                  >
                    {s.inicio.toTimeString().slice(0, 5)}
                  </li>
                ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">
              No están disponibles porque la cancha está ocupada o alguna de las parejas no cumple el descanso
              mínimo ({torneo?.descanso_min_entre_partidos ?? 30} min).
            </p>
          </details>
        )}
      </div>
    </Modal>
  );
}

/** Restricciones horarias escritas a mano por los jugadores. */
function parejasConRestriccion(
  partido: Partido | null,
  parejas: { id: string; j1_nombre: string; j2_nombre: string; restriccion_horaria: string | null }[],
): string[] {
  if (!partido) return [];
  const ids = [partido.pareja_1_id, partido.pareja_2_id].filter((x): x is string => Boolean(x));
  return parejas
    .filter((p) => ids.includes(p.id) && p.restriccion_horaria)
    .map((p) => `${p.j1_nombre} / ${p.j2_nombre}: ${p.restriccion_horaria}`);
}
