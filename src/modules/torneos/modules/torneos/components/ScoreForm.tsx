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

  const [wo, setWo] = useState(false);

  /**
   * ¿Hace falta mostrar el tie-break (Set 3)?
   * Se muestra si van 1-1 en sets.
   */
  const mostrarTieBreak = useMemo(() => {
    if (form.set3_p1 !== null || form.set3_p2 !== null) return true;
    const { set1_p1: a1, set1_p2: b1, set2_p1: a2, set2_p2: b2 } = form;
    if (a1 === null || b1 === null || a2 === null || b2 === null) return false;
    return (a1 > b1) !== (a2 > b2);
  }, [form]);

  const set = (clave: keyof ResultadoInput, valor: string) => {
    const num = valor === '' ? null : Math.max(0, Math.min(9, Number(valor)));
    setForm((previo) => {
      const siguiente = { ...previo, [clave]: num } as ResultadoInput;

      // Si se corrige el set 1 o 2 y el tie-break deja de aplicar, se limpia.
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

    if (!wo) {
      const encontrados = validarResultado(form);
      setErrores(encontrados);
      if (Object.keys(encontrados).length > 0) return;
    }

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
            <button type="button" onClick={limpiar} disabled={cargando} className="mr-auto text-sm text-red-600 hover:text-red-700 font-medium px-2 py-1">
              Limpiar
            </button>
          )}
          <button type="button" onClick={onCerrar} disabled={cargando} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" form="form-score" disabled={cargando || (Object.keys(errores).length > 0 && !wo)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            {cargando ? 'Guardando...' : 'Guardar Resultado'}
          </button>
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
          valorA={form.set1_p1}
          valorB={form.set1_p2}
          errores={errores}
          onChange={set}
          iniciales1={p1 ? inicialesPareja(p1) : '?'}
          iniciales2={p2 ? inicialesPareja(p2) : '?'}
        />

        <FilaSet
          numero={2}
          valorA={form.set2_p1}
          valorB={form.set2_p2}
          errores={errores}
          onChange={set}
          iniciales1={p1 ? inicialesPareja(p1) : '?'}
          iniciales2={p2 ? inicialesPareja(p2) : '?'}
        />

        {mostrarTieBreak && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
              Set 3 · Desempate
            </p>
            <FilaSet
              numero={3}
              valorA={form.set3_p1}
              valorB={form.set3_p2}
              errores={errores}
              onChange={set}
              iniciales1={p1 ? inicialesPareja(p1) : '?'}
              iniciales2={p2 ? inicialesPareja(p2) : '?'}
            />
          </div>
        )}

        <label className="flex items-center gap-2 cursor-pointer mt-4 py-2 border-t border-slate-100">
          <input 
            type="checkbox" 
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
            checked={wo}
            onChange={e => setWo(e.target.checked)}
          />
          <span className="text-sm font-medium text-slate-700">Marcar como abandono / walkover (WO)</span>
        </label>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Fila de un set: [ n | A | B ]                                                */
/* -------------------------------------------------------------------------- */

function FilaSet({
  numero,
  valorA,
  valorB,
  errores,
  onChange,
  iniciales1,
  iniciales2,
  obligatory = false,
}: {
  numero: 1 | 2 | 3;
  valorA: number | null;
  valorB: number | null;
  errores: ErroresCampo;
  onChange: (clave: keyof ResultadoInput, valor: string) => void;
  iniciales1: string;
  iniciales2: string;
  obligatory?: boolean;
}) {
  const claveA = `set${numero}_p1` as keyof ResultadoInput;
  const claveB = `set${numero}_p2` as keyof ResultadoInput;
  const errorA = errores[claveA];
  const errorB = errores[claveB];
  
  const [tb1, setTb1] = useState('');
  const [tb2, setTb2] = useState('');

  const showTiebreak = 
    (valorA === 6 && valorB === 6) ||
    (valorA === 7 && valorB === 6) ||
    (valorA === 6 && valorB === 7);

  const handleTbChange = (isA: boolean, val: string) => {
    if (isA) setTb1(val);
    else setTb2(val);

    if (valorA === 6 && valorB === 6) {
      const numA = Number(isA ? val : tb1);
      const numB = Number(isA ? tb2 : val);

      if (numA >= 7 && numA - numB >= 2) {
        onChange(claveA, '7');
        onChange(claveB, '6');
      } else if (numB >= 7 && numB - numA >= 2) {
        onChange(claveA, '6');
        onChange(claveB, '7');
      }
    }
  };

  let displayErrorA = errorA;
  let displayErrorB = errorB;
  if (valorA === 6 && valorB === 6 && (errorA === 'Un set no puede terminar empatado.' || errorB === 'Un set no puede terminar empatado.')) {
    displayErrorA = 'Completá el tie-break para desempatar el set.';
    displayErrorB = undefined;
  }

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
              displayErrorA
                ? 'border-red-300 bg-red-50 text-red-700 focus:ring-red-200'
                : 'border-slate-300 bg-white text-slate-800 focus:border-blue-500 focus:ring-blue-200',
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
            max={numero === 3 ? 99 : 9}
            inputMode="numeric"
            required={obligatory}
            value={valorB ?? ''}
            onChange={(e) => onChange(claveB, e.target.value)}
            className={[
              'h-12 w-full rounded-lg border text-center text-lg font-semibold tabular-nums outline-none transition focus:ring-2',
              displayErrorB || displayErrorA
                ? 'border-red-300 bg-red-50 text-red-700 focus:ring-red-200'
                : 'border-slate-300 bg-white text-slate-800 focus:border-blue-500 focus:ring-blue-200',
            ].join(' ')}
          />
          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] font-medium text-slate-400">
            {iniciales2}
          </span>
        </div>
      </div>
      
      {showTiebreak && (
        <div className="grid grid-cols-[2rem_1fr_1fr] items-center gap-2 mt-2">
          <div className="col-start-2 col-span-2 flex items-center justify-center gap-2">
            <span className="text-[10px] uppercase font-bold text-slate-500 whitespace-nowrap">Tie-Break:</span>
            <input 
              type="number" min="0" placeholder="0" value={tb1} onChange={e => handleTbChange(true, e.target.value)}
              className="w-12 h-8 rounded-md border border-slate-300 text-center text-sm font-semibold focus:ring-2 focus:ring-blue-500 outline-none" 
            />
            <span className="text-slate-400 font-bold">-</span>
            <input 
              type="number" min="0" placeholder="0" value={tb2} onChange={e => handleTbChange(false, e.target.value)}
              className="w-12 h-8 rounded-md border border-slate-300 text-center text-sm font-semibold focus:ring-2 focus:ring-blue-500 outline-none" 
            />
          </div>
        </div>
      )}

      {(displayErrorA || displayErrorB) && (
        <p className="mt-1 pl-10 text-xs text-red-600">{displayErrorA || displayErrorB}</p>
      )}
    </div>
  );
}
