/**
 * Generacion del cuadro eliminatorio (playoffs).
 *
 * REGLA DE ORO: el 1° y el 2° de la MISMA zona nunca pueden quedar en el mismo
 * lado de la llave. Si se cumple, solo podrian encontrarse en la final.
 *
 * Como se logra -- se emparejan las zonas *de a dos* (A-B, C-D, E-F...) y de
 * cada par de zonas salen DOS partidos cruzados:
 *
 *      1° A  vs  2° B          1° B  vs  2° A
 *      1° C  vs  2° D          1° D  vs  2° C
 *
 * Los dos partidos de cada par quedan en mitades opuestas del cuadro, asi que
 * las dos parejas de una zona arrancan en caminos que solo convergen en la
 * final.
 *
 * El primer partido de cada par se ubica en la primera mitad del bracket y el
 * segundo en la segunda mitad. Eso hace que el cruce sea simetrico respecto de
 * la fuerza relativa de las zonas y evita que los dos primeros de zonas
 * equivalentes se midas en cuartos.
 *
 * Con un numero impar de zonas se agrega una "zona virtual" sin parejas, que
 * produce dos BYEs repartidos uno por mitad. Cada BYE ocupa un slot real del
 * cuadro, asi que las zonas que tienenbye pasan directo a la ronda siguiente.
 *
 * Las rondas siguientes se crean con los slots vacios (`pareja_*_id: null`):
 * el bracket se dibuja completo desde el arranque y `avanzar_ganadores` (o el
 * propio cliente) los va llenando.
 */

import type { ClasificadoZona, Fase, PartidoGenerado } from '../types';
import { ValidacionError } from '../errors';
import { MAX_ZONAS } from './generarZonas';
import { potenciaDeDosCeil } from './utils';

/** Cruce de dos zonas adyacentes. */
interface Cruce {
  izquierda: ClasificadoZona | null; // aporta su 1°
  derecha: ClasificadoZona | null; // aporta su 1°
}

export interface ResultadoPlayoffs {
  partidos: PartidoGenerado[];
  /** Cuantas rondas tiene el cuadro, incluido el bracket completo. */
  totalRondas: number;
  /** Partidos de la primera ronda (los que Define la `fase`). */
  partidosPrimeraRonda: number;
}

/**
 * Genera el cuadro eliminatorio completo.
 *
 * Soporta clasificación ampliada: cada zona puede aportar más de 2 parejas
 * (1°, 2° y extras). El total de clasificados se redondea a la potencia de 2
 * más cercana hacia arriba para formar el bracket.
 *
 * REGLA DE ORO: parejas de la misma zona se separan para encontrarse lo más
 * tarde posible en el bracket.
 *
 * @param clasificadosPorZona  Clasificados de cada zona (1°, 2° y opcionales extras).
 * @returns Partidos sin `id` con slots vacíos para rondas futuras.
 */
export function generarPlayoffs(
  clasificadosPorZona: readonly ClasificadoZona[],
  opciones: { permitirByes?: boolean } = {},
): ResultadoPlayoffs {
  const { permitirByes = true } = opciones;

  if (!Array.isArray(clasificadosPorZona) || clasificadosPorZona.length === 0) {
    throw new ValidacionError(
      'sin_clasificados',
      'No hay zonas clasificadas. Se necesitan al menos 2 zonas con 1° y 2° definidos.',
    );
  }

  if (clasificadosPorZona.length < 2) {
    throw new ValidacionError(
      'pocas_zonas',
      `Con ${clasificadosPorZona.length} zona solo se puede hacer un playoff de 2 parejas, no un cuadro. ` +
        'Se necesitan al menos 2 zonas clasificadas.',
    );
  }

  if (clasificadosPorZona.length > MAX_ZONAS) {
    throw new ValidacionError(
      'demasiadas_zonas',
      `Se recibieron ${clasificadosPorZona.length} zonas y el maximo soportado es ${MAX_ZONAS}.`,
    );
  }

  // Orden estable por nombre de zona.
  const zonas = [...clasificadosPorZona].sort((a, b) => a.zona.localeCompare(b.zona, 'es'));

  for (const z of zonas) {
    if (!z.primero?.id || !z.segundo?.id) {
      throw new ValidacionError(
        'clasificado_incompleto',
        `La ${z.zona} no tiene definido el 1° o el 2°. Carga todos los resultados de la fase de zonas antes de generar el cuadro.`,
      );
    }
  }

  // ── Contar total de clasificados ──────────────────────────────────────
  const tieneExtras = zonas.some(z => z.extras && z.extras.length > 0);
  const totalClasificados = zonas.reduce(
    (sum, z) => sum + 2 + (z.extras?.length ?? 0),
    0,
  );

  // ── Ruta A: Clasificación estándar (solo 1° y 2°) — algoritmo original
  if (!tieneExtras) {
    return generarPlayoffsEstandar(zonas, permitirByes);
  }

  // ── Ruta B: Clasificación ampliada (con extras) ──────────────────────
  return generarPlayoffsAmpliados(zonas, totalClasificados, permitirByes);
}

/**
 * Algoritmo original: emparejar zonas de a dos, cruzar 1° vs 2°.
 */
function generarPlayoffsEstandar(
  zonas: ClasificadoZona[],
  permitirByes: boolean,
): ResultadoPlayoffs {
  const cruces: Cruce[] = [];
  for (let i = 0; i + 1 < zonas.length; i += 2) {
    cruces.push({ izquierda: zonas[i], derecha: zonas[i + 1] });
  }

  const sobraUnaZona = zonas.length % 2 === 1;
  if (sobraUnaZona) {
    if (!permitirByes) {
      throw new ValidacionError(
        'byes_no_permitidos',
        `Con ${zonas.length} zonas hace falta un bye para armar el cuadro, ` +
          'pero el torneo esta configurado sin byes (allow_byes = false).',
      );
    }
    cruces.push({ izquierda: zonas[zonas.length - 1], derecha: null });
  }

  const mitadIzquierda = cruces.map((c) => ({
    a: c.izquierda?.primero.id ?? null,
    b: c.derecha?.segundo.id ?? null,
  }));
  const mitadDerecha = cruces.map((c) => ({
    a: c.derecha?.primero.id ?? null,
    b: c.izquierda?.segundo.id ?? null,
  }));

  const partidosPorMitad = potenciaDeDosCeil(Math.max(cruces.length, 1));
  const relleno: { a: null; b: null }[] = Array.from({ length: partidosPorMitad - cruces.length }, () => ({
    a: null,
    b: null,
  }));

  const primeraRonda = [...mitadIzquierda, ...relleno, ...mitadDerecha, ...relleno];
  const totalRondas = totalRondasDeCuadro(primeraRonda.length);

  const partidos: PartidoGenerado[] = [];

  primeraRonda.forEach((cruce, i) => {
    partidos.push({
      zona_nombre: null,
      ronda: 1,
      orden: i + 1,
      orden_fixture: i + 1,
      fase: faseDePartidos(primeraRonda.length),
      pareja_1_id: cruce.a,
      pareja_2_id: cruce.b,
    });
  });

  for (let ronda = 2; ronda <= totalRondas; ronda++) {
    const cantidadEnRonda = primeraRonda.length / 2 ** (ronda - 1);
    const fase = faseDePartidos(cantidadEnRonda);
    for (let i = 1; i <= cantidadEnRonda; i++) {
      partidos.push({
        zona_nombre: null,
        ronda,
        orden: i,
        orden_fixture: i,
        fase,
        pareja_1_id: null,
        pareja_2_id: null,
      });
    }
  }

  return { partidos, totalRondas, partidosPrimeraRonda: primeraRonda.length };
}

/**
 * Clasificación ampliada: flatten + seeding por serpenteo.
 *
 * Ejemplo con 11 parejas (zonas de 4, 4, 3 → clasifican 3+3+2 = 8):
 *   Semilla 1: 1° Zona A    vs   Semilla 8: 3° Zona B
 *   Semilla 4: 2° Zona B    vs   Semilla 5: 2° Zona C
 *   Semilla 3: 1° Zona C    vs   Semilla 6: 3° Zona A
 *   Semilla 2: 1° Zona B    vs   Semilla 7: 2° Zona A
 *
 * Los semillados se distribuyen con la regla de bracket estándar para que
 * los mejores clasificados no se crucen hasta las rondas finales.
 */
function generarPlayoffsAmpliados(
  zonas: ClasificadoZona[],
  totalClasificados: number,
  permitirByes: boolean,
): ResultadoPlayoffs {
  // 1. Aplanar clasificados en orden de "fuerza" (serpenteo por posición)
  //    Posición 1: todos los 1° de cada zona (en orden de zona)
  //    Posición 2: todos los 2° de cada zona (en orden inverso — serpenteo)
  //    Posición 3: todos los 3° de cada zona que tengan (en orden de zona)
  //    etc.
  interface Seed {
    parejaId: string;
    zona: string;
    posEnZona: number;
  }

  const seeds: Seed[] = [];

  // Primero: todos los 1°
  for (const z of zonas) {
    seeds.push({ parejaId: z.primero.id, zona: z.zona, posEnZona: 1 });
  }

  // Segundo: todos los 2° (serpenteo inverso)
  for (let i = zonas.length - 1; i >= 0; i--) {
    seeds.push({ parejaId: zonas[i].segundo.id, zona: zonas[i].zona, posEnZona: 2 });
  }

  // Extras: posición 3, 4, etc. alternando dirección
  const maxExtras = Math.max(...zonas.map(z => z.extras?.length ?? 0));
  for (let pos = 0; pos < maxExtras; pos++) {
    const direccion = pos % 2 === 0 ? zonas : [...zonas].reverse();
    for (const z of direccion) {
      if (z.extras && z.extras[pos]) {
        seeds.push({ parejaId: z.extras[pos].id, zona: z.zona, posEnZona: 3 + pos });
      }
    }
  }

  // 2. Bracket size = siguiente potencia de 2
  const bracketSize = potenciaDeDosCeil(totalClasificados);
  const partidosPrimeraRonda = bracketSize / 2;

  if (!permitirByes && totalClasificados < bracketSize) {
    throw new ValidacionError(
      'byes_no_permitidos',
      `Con ${totalClasificados} clasificados hacen falta ${bracketSize - totalClasificados} bye(s), ` +
        'pero el torneo está configurado sin byes.',
    );
  }

  // 3. Distribuir seeds en el bracket con separación estándar de torneo
  //    Posiciones del bracket para que seed 1 y 2 se encuentren en la final,
  //    seed 1-4 en semifinal, etc.
  const bracketPositions = generarPosicionesBracket(bracketSize);

  const slots: (string | null)[] = new Array(bracketSize).fill(null);
  for (let i = 0; i < seeds.length && i < bracketSize; i++) {
    slots[bracketPositions[i]] = seeds[i].parejaId;
  }

  // 4. Armar partidos de primera ronda
  const partidos: PartidoGenerado[] = [];
  for (let i = 0; i < partidosPrimeraRonda; i++) {
    partidos.push({
      zona_nombre: null,
      ronda: 1,
      orden: i + 1,
      orden_fixture: i + 1,
      fase: faseDePartidos(partidosPrimeraRonda),
      pareja_1_id: slots[i * 2] ?? null,
      pareja_2_id: slots[i * 2 + 1] ?? null,
    });
  }

  // 5. Rondas siguientes vacías
  const totalRondas = totalRondasDeCuadro(partidosPrimeraRonda);
  for (let ronda = 2; ronda <= totalRondas; ronda++) {
    const cantidadEnRonda = partidosPrimeraRonda / 2 ** (ronda - 1);
    const fase = faseDePartidos(cantidadEnRonda);
    for (let i = 1; i <= cantidadEnRonda; i++) {
      partidos.push({
        zona_nombre: null,
        ronda,
        orden: i,
        orden_fixture: i,
        fase,
        pareja_1_id: null,
        pareja_2_id: null,
      });
    }
  }

  return { partidos, totalRondas, partidosPrimeraRonda: partidosPrimeraRonda };
}

/**
 * Genera las posiciones del bracket para N participantes.
 * Devuelve un arreglo donde el índice es la semilla (0-based) y el valor
 * es la posición en el bracket (0-based).
 *
 * Ejemplo para N=8: [0, 7, 4, 3, 2, 5, 6, 1]
 * Seed 1 va a posición 0, Seed 2 a posición 7, Seed 3 a posición 4, etc.
 */
function generarPosicionesBracket(n: number): number[] {
  if (n === 1) return [0];
  if (n === 2) return [0, 1];

  const posiciones: number[] = [0, 1];

  for (let size = 2; size < n; size *= 2) {
    const nuevas: number[] = [];
    for (const pos of posiciones) {
      nuevas.push(pos);
      nuevas.push(size * 2 - 1 - pos);
    }
    posiciones.length = 0;
    posiciones.push(...nuevas);
  }

  return posiciones;
}

/**
 * Cuantas rondas tiene el bracket, dado el numero de partidos de la primera
 * ronda. Si la primera ronda tiene M partidos, el cuadro tiene 2*M cupos.
 */
function totalRondasDeCuadro(partidosPrimeraRonda: number): number {
  // primera ronda con M partidos -> log2(2M) rondas = 1 + log2(M)
  let rondas = 1;
  let m = partidosPrimeraRonda;
  while (m > 1) {
    m /= 2;
    rondas += 1;
  }
  return rondas;
}

/**
 * Fase de una ronda concreta. El numero de partidos de la ronda es el que
 * define el nombre: 16 -> dieciseisavos, 8 -> octavos, 4 -> cuartos, 2 ->
 * semifinal, 1 -> final.
 */
export function faseDePartidos(partidosEnRonda: number): Fase {
  switch (partidosEnRonda) {
    case 1:
      return 'final';
    case 2:
      return 'semifinal';
    case 4:
      return 'cuartos';
    case 8:
      return 'octavos';
    case 16:
      return 'dieciseisavos';
    default:
      throw new ValidacionError(
        'bracket_invalido',
        `No existe una fase para una ronda de ${partidosEnRonda} partidos. ` +
          'La cantidad de zonas debe ser par o debe permitir BYEs.',
      );
  }
}

/** Verificacion estructural del cruce: nunca 1°X contra 2°X. */
export function validarCruce(
  partidosPrimeraRonda: readonly PartidoGenerado[],
  zonasPorPareja: ReadonlyMap<string, string>,
): string[] {
  const errores: string[] = [];

  for (const partido of partidosPrimeraRonda) {
    const zonaA = partido.pareja_1_id ? zonasPorPareja.get(partido.pareja_1_id) : undefined;
    const zonaB = partido.pareja_2_id ? zonasPorPareja.get(partido.pareja_2_id) : undefined;
    if (zonaA && zonaB && zonaA === zonaB) {
      errores.push(
        `${partido.fase} #${partido.orden}: se cruzan el 1° y el 2° de la ${zonaA} en el mismo lado del cuadro.`,
      );
    }
  }

  return errores;
}

/**
 * Nº de cupos totales del cuadro (partidosPrimeraRonda * 2). Handy para el
 * texto "32 parejas clasificadas -> bracket de 16".
 */
export function totalCupos(partidosPrimeraRonda: number): number {
  return potenciaDeDosCeil(partidosPrimeraRonda) * 2;
}
