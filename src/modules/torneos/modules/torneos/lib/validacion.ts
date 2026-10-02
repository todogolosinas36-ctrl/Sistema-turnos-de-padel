/**
 * Validaciones de negocio compartidas por formularios y acciones.
 *
 * Todas devuelven un mapa `campo -> mensaje` y lanzan `ValidacionError` cuando
 * se usan en modo estricto (acciones de escritura). La UI usa el mapa para
 * pintar el error debajo de cada input sin tener que duplicar las reglas.
 */

import type { EstadoPago, ParejaInput, ResultadoInput } from '../types';
import { ValidacionError } from '../errors';
import { normalizarTexto } from './utils';

export type ErroresCampo = Record<string, string>;

/** Minutos de telefono: 7 a 15 digitos, con prefijo internacional opcional. */
const RE_TELEFONO = /^\+?[\d\s()-]{7,20}$/;

/* -------------------------------------------------------------------------- */
/* Parejas / inscripciones                                                     */
/* -------------------------------------------------------------------------- */

export function validarPareja(input: Partial<ParejaInput>): ErroresCampo {
  const errores: ErroresCampo = {};

  const j1 = (input.j1_nombre ?? '').trim();
  const j2 = (input.j2_nombre ?? '').trim();

  if (!j1) errores.j1_nombre = 'Ingresá el nombre del jugador 1.';
  else if (j1.length > 80) errores.j1_nombre = 'Máximo 80 caracteres.';
  if (!j2) errores.j2_nombre = 'Ingresá el nombre del jugador 2.';
  else if (j2.length > 80) errores.j2_nombre = 'Máximo 80 caracteres.';

  if (j1 && j2 && normalizarTexto(j1) === normalizarTexto(j2)) {
    errores.j2_nombre = 'Los dos jugadores tienen que ser personas distintas.';
  }

  if (!validarTelefono(input.j1_telefono)) {
    errores.j1_telefono = 'Teléfono inválido. Ej: 11 5555-1234.';
  }
  if (!validarTelefono(input.j2_telefono)) {
    errores.j2_telefono = 'Teléfono inválido. Ej: 11 5555-1234.';
  }

  const monto = Number(input.monto_abonado ?? 0);
  if (!Number.isFinite(monto) || monto < 0) {
    errores.monto_abonado = 'El monto debe ser un número mayor o igual a 0.';
  }

  const pago = input.estado_pago ?? 'pendiente';
  if (!ESTADOS_VALIDOS.has(pago)) {
    errores.estado_pago = 'Estado de pago inválido.';
  }
  if (pago === 'sena' && monto <= 0) {
    errores.monto_abonado = 'Si la pareja tiene seña, informá cuánto abonó.';
  }

  const restriccion = (input.restriccion_horaria ?? '').trim();
  if (restriccion.length > 200) {
    errores.restriccion_horaria = 'Máximo 200 caracteres.';
  }

  return errores;
}

const ESTADOS_VALIDOS: ReadonlySet<EstadoPago> = new Set<EstadoPago>([
  'pendiente',
  'pagado',
  'sena',
]);

export function validarTelefono(valor: string | null | undefined): boolean {
  if (!valor) return false;
  const limpio = valor.trim();
  if (limpio.length === 0) return false;
  if (!RE_TELEFONO.test(limpio)) return false;
  const digitos = limpio.replace(/\D/g, '');
  return digitos.length >= 7 && digitos.length <= 15;
}

/** Normaliza un telefono a un formato consistente para poder deduplicar. */
export function normalizarTelefono(valor: string): string {
  return valor.replace(/\D/g, '');
}

/** Lanza `ValidacionError` si el formulario tiene errores. */
export function exigirValido<T extends Partial<ParejaInput>>(
  input: T,
  etiqueta = 'la pareja',
): T {
  const errores = validarPareja(input);
  if (Object.keys(errores).length > 0) {
    throw new ValidacionError(
      'pareja_invalida',
      `Revisá los datos de ${etiqueta}: ${Object.values(errores)[0]}`,
      errores,
    );
  }
  return input;
}

/* -------------------------------------------------------------------------- */
/* Resultados                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * ¿El set ya está terminado?
 * Score terminal de padel: 6-0 a 6-4, 7-5 o 7-6 (a favor de quien ganó).
 * Cualquier otra cosa (5-3, 4-4, 3-3) es un set en curso.
 */
export function esSetTerminal(a: number, b: number): boolean {
  const mayor = Math.max(a, b);
  const menor = Math.min(a, b);
  if (mayor === 6 && menor <= 4) return true;
  if (mayor === 7 && menor === 5) return true;
  if (mayor === 7 && menor === 6) return true;
  return false;
}

/**
 * Valida un resultado de padel: al mejor de 3 sets, con tie-break opcional.
 *
 * Reglas (identicas a las del RPC `torneo.registrar_resultado`):
 *  - Cada set, si se carga, tiene ambos numeros, entre 0 y 9 y nunca empatados.
 *  - Cada set cargado debe estar TERMINADO (6-x, 7-5 o 7-6). Un 5-3 significa
 *    que el set seguia en curso y no puede cerrar el partido por si solo.
 *  - No se puede cargar el set 2 sin el 1, ni el 3 sin el 2.
 *  - El set 3 (tie-break) solo existe si cada pareja ya gano un set (van 1-1).
 *  - El resultado tiene que decidir un ganador.
 */
export function validarResultado(
  input: Partial<ResultadoInput>,
  opciones: { permitirLimpiar?: boolean } = {},
): ErroresCampo {
  const { permitirLimpiar = true } = opciones;
  const errores: ErroresCampo = {};

  const s1 = input.set1_p1 ?? null;
  const s1b = input.set1_p2 ?? null;
  const s2 = input.set2_p1 ?? null;
  const s2b = input.set2_p2 ?? null;
  const s3 = input.set3_p1 ?? null;
  const s3b = input.set3_p2 ?? null;

  const todoVacio = s1 === null && s2 === null && s3 === null;
  if (todoVacio) {
    if (!permitirLimpiar) errores.set1_p1 = 'Cargá al menos el set 1.';
    return errores;
  }

  const validarSet = (a: number | null, b: number | null, etiqueta: string) => {
    if (a === null && b === null) return;
    if (a === null || b === null) {
      errores[`set${etiqueta}_p1`] = 'Cargá los dos numeros del set.';
      return;
    }
    if (a < 0 || b < 0) {
      errores[`set${etiqueta}_p1`] = 'No puede ser negativo.';
      return;
    }
    if (a === b) {
      errores[`set${etiqueta}_p1`] = 'Un set no puede terminar empatado.';
      return;
    }
    if (a > 9 || b > 9) {
      errores[`set${etiqueta}_p1`] = 'Máximo 9 games por set.';
    }
  };

  validarSet(s1, s1b, '1');
  validarSet(s2, s2b, '2');
  validarSet(s3, s3b, '3');

  // Cada set cargado tiene que estar terminado. Un 5-3 seguia en curso.
  // Solo se chequea si el set no tiene ya otro error (p. ej. 6-6, que ya fue
  // reportado como empate: no tiene sentido tellingar que tambien esta en curso).
  if (s1 !== null && s1b !== null && !errores.set1_p1 && !esSetTerminal(s1, s1b)) {
    errores.set1_p1 = `El set 1 esta en curso (${s1}-${s1b}). Un set cierra en 6-x, 7-5 o 7-6.`;
  }
  if (s2 !== null && s2b !== null && !errores.set2_p1 && !esSetTerminal(s2, s2b)) {
    errores.set2_p1 = `El set 2 esta en curso (${s2}-${s2b}). Un set cierra en 6-x, 7-5 o 7-6.`;
  }

  // No se avanza de set sin el anterior.
  if (s2 !== null && s1 === null) {
    errores.set2_p1 = 'No se puede cargar el set 2 sin el set 1.';
  }
  if (s3 !== null && (s1 === null || s2 === null)) {
    errores.set3_p1 = 'No se puede cargar el tie-break sin los sets 1 y 2.';
  }

  // El tie-break solo aplica si cada pareja ya ganó un set (van 1-1).
  // Ojo: NO se comparan los numeros entre sets (6 y 4 son distintos pero el
  // match va 1-1). Lo que importa es que los(set) lo haya ganado cada lado.
  if (
    s3 !== null &&
    s1 !== null &&
    s1b !== null &&
    s2 !== null &&
    s2b !== null &&
    (s1 > s1b) === (s2 > s2b)
  ) {
    errores.set3_p1 = 'El tie-break solo se usa cuando el match va 1-1.';
  }


  // El resultado tiene que decidir un ganador.
  if (Object.keys(errores).length === 0) {
    const setsP1 =
      (s1 !== null && s1b !== null ? (s1 > s1b ? 1 : 0) : 0) +
      (s2 !== null && s2b !== null ? (s2 > s2b ? 1 : 0) : 0) +
      (s3 !== null && s3b !== null ? (s3 > s3b ? 1 : 0) : 0);
    const setsP2 =
      (s1 !== null && s1b !== null ? (s1 < s1b ? 1 : 0) : 0) +
      (s2 !== null && s2b !== null ? (s2 < s2b ? 1 : 0) : 0) +
      (s3 !== null && s3b !== null ? (s3 < s3b ? 1 : 0) : 0);

    if (setsP1 === setsP2) {
      errores.set1_p1 = 'El resultado está empatado a sets: definí un ganador.';
    }
  }

  return errores;
}

export function exigirResultadoValido(input: Partial<ResultadoInput>): ResultadoInput {
  const errores = validarResultado(input);
  if (Object.keys(errores).length > 0) {
    throw new ValidacionError(
      'resultado_invalido',
      `Resultado inválido: ${Object.values(errores)[0]}`,
      errores,
    );
  }
  return {
    set1_p1: input.set1_p1 ?? null,
    set1_p2: input.set1_p2 ?? null,
    set2_p1: input.set2_p1 ?? null,
    set2_p2: input.set2_p2 ?? null,
    set3_p1: input.set3_p1 ?? null,
    set3_p2: input.set3_p2 ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Etiquetas                                                                   */
/* -------------------------------------------------------------------------- */

export const ETIQUETA_ESTADO_PAGO: Record<EstadoPago, string> = {
  pendiente: 'Pendiente',
  pagado: 'Pagado',
  sena: 'Seña',
};

export const ETIQUETA_FASE: Record<string, string> = {
  zona: 'Zona',
  dieciseisavos: 'Dieciseisavos',
  octavos: 'Octavos',
  cuartos: 'Cuartos',
  semifinal: 'Semifinal',
  final: 'Final',
};
