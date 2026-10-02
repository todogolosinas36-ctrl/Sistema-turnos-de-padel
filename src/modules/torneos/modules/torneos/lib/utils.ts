/**
 * Utilidades puras compartidas por los algoritmos.
 * Sin dependencias externas: se ejecutan igual en el browser, en tests y en SSR.
 */

/* -------------------------------------------------------------------------- */
/* Aleatoriedad reproducible                                                   */
/* -------------------------------------------------------------------------- */

/**
 * PRNG mulberry32. Devuelve una funcion en [0, 1).
 * Permite pasar una semilla conocida para poder *reproducir* un sorteo
 * concreto (auditoria: "el sorteo de la 3ra fue el de la semilla 8675309").
 */
export function crearRng(semilla: number): () => number {
  let a = semilla >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Genera una semilla aleatoria de 32 bits (para persistirla junto al sorteo). */
export function semillaAleatoria(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/**
 * Fisher-Yates. No muta el array original.
 * @param rng funcion injectable; por defecto `Math.random`.
 */
export function barajar<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Estructuras                                                                 */
/* -------------------------------------------------------------------------- */

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new RangeError('chunk: el tamaño debe ser > 0');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Agrupa por clave, preservando el orden de insercion. */
export function agruparPor<T, K extends string>(
  items: readonly T[],
  clave: (item: T) => K,
): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of items) {
    const k = clave(item);
    (out[k] ||= []).push(item);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Nombres de zona                                                             */
/* -------------------------------------------------------------------------- */

/**
 * 0 -> "A", 25 -> "Z", 26 -> "AA", 27 -> "AB" ...
 * Estilo Excel, necesario para torneos grandes.
 */
export function letraIndice(indice: number): string {
  if (!Number.isInteger(indice) || indice < 0) {
    throw new RangeError('letraIndice: el indice debe ser un entero >= 0');
  }
  let n = indice;
  let letras = '';
  do {
    letras = String.fromCharCode(65 + (n % 26)) + letras;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letras;
}

/** 0 -> "Zona A". */
export function nombreZona(indice: number): string {
  return `Zona ${letraIndice(indice)}`;
}

/* -------------------------------------------------------------------------- */
/* Numeros                                                                     */
/* -------------------------------------------------------------------------- */

/** Menor potencia de 2 >= n (n >= 1). */
export function potenciaDeDosCeil(n: number): number {
  if (n < 1) throw new RangeError('potenciaDeDosCeil: n debe ser >= 1');
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Indica si n es una potencia de 2 exacta. */
export function esPotenciaDeDos(n: number): boolean {
  return n >= 1 && (n & (n - 1)) === 0;
}

/* -------------------------------------------------------------------------- */
/* Texto                                                                       */
/* -------------------------------------------------------------------------- */

/** Normaliza para comparar nombres: sin acentos, sin espacios extra, minúsculas. */
export function normalizarTexto(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** "Ana Gomez / Luis Perez" -> nombre corto para tablas y brackets. */
export function nombrePareja(p: { j1_nombre: string; j2_nombre: string }): string {
  return `${p.j1_nombre} / ${p.j2_nombre}`;
}

/** Iniciales para el avatar del bracket: "AG / LP" -> "AL". */
export function inicialesPareja(p: { j1_nombre: string; j2_nombre: string }): string {
  const inicial = (s: string) =>
    normalizarTexto(s)
      .split(' ')
      .filter(Boolean)
      .map((p2) => p2[0])
      .join('');
  return (inicial(p.j1_nombre) + inicial(p.j2_nombre)).slice(0, 2).toUpperCase();
}
