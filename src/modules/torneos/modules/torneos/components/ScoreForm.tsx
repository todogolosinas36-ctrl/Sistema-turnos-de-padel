/**
 * ScoreForm — carga rapida del resultado de un partido.
 *
 * Pensado para el supuesto de uso real (elUBE de arbitraje): se abre pegado al
 * partido, se escriben los numeros y se guarda. El set 3 (tie-break) solo
 * aparece cuando el match va 1-1, y se oculta solo cuando ya no aplica.
 */

import { useEffect, useMemo, useState } from 'react';
import type { Partido, Pareja, ResultadoInput } from '../types';
import { Button, Modal } from './ui';
import { esSetTerminal, inicialesPareja, validarResultado, type ErroresCampo } from '../lib';

const VACIO: ResultadoInput = {
  set1_p1: null,
  set1_p2: null,
  set2_p1: null,
  set2_p2: null,
  set3_p1: null,
  set3_p2: null,
};

export interface ScoreFormProps {
  abierto: boolean;
  onCerrar: () => void;
  partido: Partido | null;
  /** Parejas indexadas por id, para mostrar nombres en los score. */
  parejas: Map<string, Pareja>;
  onGuardar: (partidoId: string, resultado: ResultadoInput) => Promise<{ ok: boolean; error?: { mensaje: string } }>;
  cargando?: boolean;
}

export function ScoreForm({ abierto, onCerrar, partido, parejas, onGuardar, cargando = false }: ScoreFormProps) {
  const [form, setForm] = useState<ResultadoInput>(VACIO);
  const [errores, setErrores] = useState<ErroresCampo>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto || !partido) return;
    setForm({
      set1_p1: partido.set1_p1,
      set1_p2: partido.set1_p2,
      set2_p1: partido.set2_p1,
      set2_p2: partido.set2_p2,
      set3_p1: partido.set3_p1,
      set3_p2: partido.set3_p2,
    });
    setErrores({});
    setErrorGeneral(null);
  }, [abierto, partido]);

  const p1 = partido?.pareja_1_id ? parejas.get(partido.pareja_1_id) ?? null : null;
  const p2 = partido?.pareja_2_id ? parejas.get(partido.pareja_2_id) ?? null : null;

  /**
   * ¿Hace falta mostrar el tie-break?
   *  - Si el set 3 ya esta cargado, se muestra siempre (poder corregirlo).
   *  - Si no, aparece solo con el match 1-1 (cada lado gana un set).
   */
  const mostrarTieBreak = useMemo(() => {
    if (form.set3_p1 !== null || form.set3_p2 !== null) return true;
    const { set1_p1: a1, set1_p2: b1, set2_p1: a2, set2_p2: b2 } = form;
    if (a1 === null || b1 === null || a2 === null || b2 === null) return false;
    return (a1 > b1) !== (a2 > b2);
  }, [form]);

  /** El set 1 quedó cerrado (6-4, 7-5, 7-6 o 6-x): no hace falta el set 2. */
  const set1Cerrado =
    form.set1_p1 !== null &&
    form.set1_p2 !== null &&
    form.set2_p1 === null &&
    form.set2_p2 === null &&
    esSetTerminal(form.set1_p1, form.set1_p2);

  const set = (clave: keyof ResultadoInput, valor: string) => {
    const num = valor === '' ? null : Math.max(0, Math.min(9, Number(valor)));
    setForm((previo) => {
      const siguiente = { ...previo, [clave]: num } as ResultadoInput;

      // Si se corrige el set 1 y el tie-break deja de aplicar, se limpia.
      if (clave === 'set1_p1' || clave === 'set1_p2' || clave === 'set2_p1' || clave === 'set2_p2') {
        const { set1_p1: a1, set1_p2: b1, set2_p1: a2, set2_p2: b2 } = siguiente;
        const va1a1 = a1 !== null && b1 !== null && a2 !== null && b2 !== null && (a1 > b1) !== (a2 > b2);
        if (!va1a1) siguiente.set3_p1 = null;
        if (!va1a1) siguiente.set3_p2 = null;
      }
      return siguiente;
    });
    setErrores((previos) => {
      const claveError = `${String(clave).replace('_p1', '')}_p1` as keyof ErroresCampo;
      if (!previos[claveError]) return previos;
      const copia = { ...previos };
      delete copia[claveError];
      return copia;
    });
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partido) return;

    const encontrados = validarResultado(form);
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return;

    const r = await onGuardar(partido.id, form);
    if (r.ok) onCerrar();
    else setErrorGeneral(r.error?.mensaje ?? 'No se pudo guardar el resultado.');
  };

  const limpiar = async () => {
    if (!partido) return;
    const r = await onGuardar(partido.id, VACIO);
    if (r.ok) onCerrar();
    else setErrorGeneral(r.error?.mensaje ?? 'No se pudo limpiar el resultado.');
  };

  /** El partido ya tiene algún set cargado: se puede limpiar. */
  const yaCargado = partido?.set1_p1 != null;

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="sm"
      titulo="Cargar resultado"
      descripcion={partido?.zona_nombre ? `${partido.zona_nombre} · ronda ${partido.ronda}` : undefined}
      pie={
        <>
          {yaCargado && (
            <Button type="button" variante="fantasma" onClick={limpiar} disabled={cargando} className="mr-auto">
              Limpiar
            </Button>
          )}
          <Button type="button" variante="fantasma" onClick={onCerrar} disabled={cargando}>
            Cancelar
          </Button>
          <Button type="submit" form="form-score" variante="primario" cargando={cargando}>
            Guardar resultado
          </Button>
        </>
      }
    >
      <form id="form-score" onSubmit={enviar} className="space-y-4" noValidate>
        {errorGeneral && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">{errorGeneral}</div>
        )}

        {/* Cabecera con las dos parejas */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg bg-slate-50 p-3">
          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-medium text-slate-800">{p1?.j1_nombre ?? '—'}</p>
            <p className="truncate text-sm font-medium text-slate-800">{p1?.j2_nombre ?? '—'}</p>
          </div>
          <span className="text-xs font-semibold uppercase text-slate-400">contra</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800">{p2?.j1_nombre ?? '—'}</p>
            <p className="truncate text-sm font-medium text-slate-800">{p2?.j2_nombre ?? '—'}</p>
          </div>
        </div>

        <FilaSet
          numero={1}
          obligatory
          a1={form.set1_p1}
          b1={form.set1_p2}
          a2={form.set2_p1}
          b2={form.set2_p2}
          errores={errores}
          onChange={set}
          iniciales1={p1 ? inicialesPareja(p1) : '?'}
          iniciales2={p2 ? inicialesPareja(p2) : '?'}
        />

        {!set1Cerrado && (
          <FilaSet
            numero={2}
            a1={form.set1_p1}
            b1={form.set1_p2}
            a2={form.set2_p1}
            b2={form.set2_p2}
            errores={errores}
            onChange={set}
            iniciales1={p1 ? inicialesPareja(p1) : '?'}
            iniciales2={p2 ? inicialesPareja(p2) : '?'}
          />
        )}

        {set1Cerrado && (
          <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
            El set 1 cerró ({form.set1_p1}-{form.set1_p2}): se registra como retiro. Para jugar el set 2,{' '}
            <button
              type="button"
              className="underline"
              onClick={() => {
                setForm((v) => ({ ...v, set2_p1: 0, set2_p2: 0 }));
              }}
            >
              agregalo acá
            </button>
            .
          </p>
        )}

        {mostrarTieBreak && (
          <div className="rounded-lg border border-cancha-200 bg-cancha-50/50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cancha-700">
              Set 3 · Tie-break
            </p>
            <FilaSet
              numero={3}
              a1={form.set1_p1}
              b1={form.set1_p2}
              a2={form.set2_p1}
              b2={form.set2_p2}
              errores={errores}
              onChange={set}
              iniciales1={p1 ? inicialesPareja(p1) : '?'}
              iniciales2={p2 ? inicialesPareja(p2) : '?'}
            />
          </div>
        )}

        <p className="text-xs text-slate-500">
          El ganador se calcula solo a partir de los sets. No se puede guardar un resultado empatado.
        </p>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Fila de un set: [ n | A | B ]                                                */
/* -------------------------------------------------------------------------- */

function FilaSet({
  numero,
  a1,
  b1,
  a2,
  b2,
  errores,
  onChange,
  iniciales1,
  iniciales2,
  obligatory = false,
}: {
  numero: 1 | 2 | 3;
  a1: number | null;
  b1: number | null;
  a2: number | null;
  b2: number | null;
  errores: ErroresCampo;
  onChange: (clave: keyof ResultadoInput, valor: string) => void;
  iniciales1: string;
  iniciales2: string;
  obligatory?: boolean;
}) {
  const valorA = numero === 1 ? a1 : numero === 2 ? a2 : null;
  const valorB = numero === 1 ? b1 : numero === 2 ? b2 : null;
  const claveA = `set${numero}_p1` as keyof ResultadoInput;
  const claveB = `set${numero}_p2` as keyof ResultadoInput;
  const errorA = errores[claveA];
  const errorB = errores[claveB];

  return (
    <div>
      <div className="grid grid-cols-[2rem_1fr_1fr] items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
          {numero}
        </span>

        <div className="relative">
          <input
            aria-label={`Games de ${iniciales1} en el set ${numero}`}
            type="number"
            min={0}
            max={9}
            inputMode="numeric"
            required={obligatory}
            value={valorA ?? ''}
            onChange={(e) => onChange(claveA, e.target.value)}
            className={[
              'h-12 w-full rounded-lg border text-center text-lg font-semibold tabular-nums outline-none transition focus:ring-2',
              errorA
                ? 'border-red-300 bg-red-50 text-red-700 focus:ring-red-200'
                : 'border-slate-300 bg-white text-slate-800 focus:border-cancha-500 focus:ring-cancha-200',
            ].join(' ')}
          />
          <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-[10px] font-medium text-slate-400">
            {iniciales1}
          </span>
        </div>

        <div className="relative">
          <input
            aria-label={`Games de ${iniciales2} en el set ${numero}`}
            type="number"
            min={0}
            max={9}
            inputMode="numeric"
            required={obligatory}
            value={valorB ?? ''}
            onChange={(e) => onChange(claveB, e.target.value)}
            className={[
              'h-12 w-full rounded-lg border text-center text-lg font-semibold tabular-nums outline-none transition focus:ring-2',
              errorB
                ? 'border-red-300 bg-red-50 text-red-700 focus:ring-red-200'
                : 'border-slate-300 bg-white text-slate-800 focus:border-cancha-500 focus:ring-cancha-200',
            ].join(' ')}
          />
          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] font-medium text-slate-400">
            {iniciales2}
          </span>
        </div>
      </div>

      {(errorA || errorB) && (
        <p className="mt-1 pl-10 text-xs text-red-600">{errorA || errorB}</p>
      )}
    </div>
  );
}
