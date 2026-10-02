/**
 * Errores de dominio del modulo.
 *
 * Los algoritmos y los validadores lanzan siempre `TorneoError` (o su subclase)
 * con un mensaje en espanol listo para mostrar en la UI. El repository capa
 * los envuelve en `ResultadoOperacion` para que los componentes decidan si
 * mostrar un toast o un error de bloque.
 */

export class TorneoError extends Error {
  /** Codigo estable, util para i18n y para tests. */
  readonly codigo: string;
  /** Detalle opcional para debugging (no se muestra al usuario). */
  readonly detalle?: unknown;

  constructor(codigo: string, mensaje: string, detalle?: unknown) {
    super(mensaje);
    this.name = 'TorneoError';
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

/** Fallo de validacion de entrada (formularios, reglas de juego). */
export class ValidacionError extends TorneoError {
  /** Campo -> mensaje, para pintar el error debajo del input. */
  readonly campos: Record<string, string>;

  constructor(codigo: string, mensaje: string, campos: Record<string, string> = {}) {
    super(codigo, mensaje);
    this.name = 'ValidacionError';
    this.campos = campos;
  }
}

/** El estado actual no permite la operacion (torneo finalizado, sin permisos...). */
export class OperacionNoPermitidaError extends TorneoError {
  constructor(codigo: string, mensaje: string) {
    super(codigo, mensaje);
    this.name = 'OperacionNoPermitidaError';
  }
}

/** Error de conflicto de agenda detectada por el validador de cronograma. */
export class ConflictoCronogramaError extends TorneoError {
  readonly conflictos: string[];
  constructor(mensaje: string, conflictos: string[] = []) {
    super('conflicto_cronograma', mensaje, conflictos);
    this.name = 'ConflictoCronogramaError';
    this.conflictos = conflictos;
  }
}

/** Normaliza cualquier error a un mensaje mostrable. */
export function mensajeDeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Ocurrio un error inesperado.';
}
