import { describe, expect, it } from 'vitest';
import type { Cancha, Pareja, Partido, PartidoAgenda, ZonaConParejas } from '../types';
import { generarZonas, resolverTamanosZona, analizarSorteo, puedeGenerarPlayoffs } from './generarZonas';
import { generarFixtureZonas, generarRoundRobin, cantidadPartidosZona } from './generarFixtureZonas';
import { calcularTablaPosiciones, extraerClasificados, ganadorDesdeSets } from './calcularTablaPosiciones';
import { generarPlayoffs, faseDePartidos } from './generarPlayoffs';
import { construirBracket } from './bracket';
import { barajar, crearRng, letraIndice, potenciaDeDosCeil } from './utils';
import { validarResultado, validarPareja } from './validacion';
import { validarCronograma, resumenCronograma } from './cronograma';

/* -------------------------------------------------------------------------- */
/* Factories                                                                   */
/* -------------------------------------------------------------------------- */

let seq = 0;
const reset = () => {
  seq = 0;
};

const pareja = (over: Partial<Pareja> = {}): Pareja => {
  seq += 1;
  return {
    id: `p${seq}`,
    categoria_id: 'cat-1',
    j1_nombre: `Jugador ${seq}A`,
    j1_telefono: '11 5555-0000',
    j2_nombre: `Jugador ${seq}B`,
    j2_telefono: '11 5555-0001',
    estado_pago: 'pagado',
    monto_abonado: 100,
    restriccion_horaria: null,
    origen: 'web',
    notas: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
};

const partido = (over: Partial<Partido> = {}): Partido => {
  seq += 1;
  return {
    id: `m${seq}`,
    categoria_id: 'cat-1',
    zona_id: 'zona-A',
    zona_nombre: 'Zona A',
    ronda: 1,
    orden_fixture: seq,
    fase: 'zona',
    pareja_1_id: 'p1',
    pareja_2_id: 'p2',
    set1_p1: null,
    set1_p2: null,
    set2_p1: null,
    set2_p2: null,
    set3_p1: null,
    set3_p2: null,
    ganador_id: null,
    cancha_id: null,
    horario: null,
    resultado_nota: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
};

const zona = (nombre: string, parejas: Pareja[]): ZonaConParejas => ({
  id: `zona-${nombre}`,
  categoria_id: 'cat-1',
  nombre,
  orden: 1,
  created_at: '2026-01-01T00:00:00Z',
  parejas,
});

/* -------------------------------------------------------------------------- */

describe('utils', () => {
  it('letraIndice sigue el estilo Excel', () => {
    expect(letraIndice(0)).toBe('A');
    expect(letraIndice(25)).toBe('Z');
    expect(letraIndice(26)).toBe('AA');
    expect(letraIndice(27)).toBe('AB');
    expect(letraIndice(51)).toBe('AZ');
    expect(letraIndice(52)).toBe('BA');
  });

  it('potenciaDeDosCeil', () => {
    expect(potenciaDeDosCeil(1)).toBe(1);
    expect(potenciaDeDosCeil(3)).toBe(4);
    expect(potenciaDeDosCeil(16)).toBe(16);
    expect(potenciaDeDosCeil(17)).toBe(32);
  });

  it('crearRng es determinista con la misma semilla y acotado en [0, 1)', () => {
    const a = crearRng(42);
    const b = crearRng(42);
    const serieA = [a(), a(), a(), a(), a()];
    const serieB = [b(), b(), b(), b(), b()];
    expect(serieA).toEqual(serieB);
    expect(crearRng(42)).not.toEqual(crearRng(43));
    for (const n of serieA) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it('barajar no muta el original y conserva todos los elementos', () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8];
    const copia = [...original];
    const barajado = barajar(original, crearRng(3));

    expect(original).toEqual(copia);
    expect([...barajado].sort()).toEqual(original);
    expect(barajado).not.toEqual(original);
  });
});

/* -------------------------------------------------------------------------- */

describe('generarZonas', () => {
  it('reparte en zonas de 3 cuando el total es multiplo de 3', () => {
    expect(resolverTamanosZona(3)).toEqual([3]);
    expect(resolverTamanosZona(6)).toEqual([3, 3]);
    expect(resolverTamanosZona(9)).toEqual([3, 3, 3]);
    expect(resolverTamanosZona(12)).toEqual([3, 3, 3, 3]);
  });

  it('agrega zonas de 4 cuando el total NO es multiplo exacto de 3', () => {
    expect(resolverTamanosZona(4)).toEqual([4]);
    expect(resolverTamanosZona(7)).toEqual([4, 3]);
    expect(resolverTamanosZona(8)).toEqual([4, 4]);
    expect(resolverTamanosZona(10)).toEqual([4, 3, 3]);
    expect(resolverTamanosZona(11)).toEqual([4, 4, 3]);
    expect(resolverTamanosZona(13)).toEqual([4, 3, 3, 3]);
    expect(resolverTamanosZona(14)).toEqual([4, 4, 3, 3]);
  });

  it('no deja parejas sueltas: la suma de tamanos siempre da el total', () => {
    for (let n = 2; n <= 40; n++) {
      const t = resolverTamanosZona(n);
      expect(t.reduce((a, b) => a + b, 0)).toBe(n);
      for (const tam of t) expect(tam).toBeGreaterThanOrEqual(2);
    }
  });

  it('resuelve los casos borde de 2 y 5 parejas', () => {
    expect(resolverTamanosZona(5)).toEqual([3, 2]);
    expect(resolverTamanosZona(2)).toEqual([2]);
  });

  it('rechaza menos de 2 parejas', () => {
    expect(() => resolverTamanosZona(1)).toThrowError(/al menos 2 parejas/i);
    expect(() => resolverTamanosZona(0)).toThrow();
  });

  it('solo incluye parejas con pago habilitado (pagado / sena)', () => {
    reset();
    const parejas = [
      pareja({ estado_pago: 'pagado' }),
      pareja({ estado_pago: 'sena' }),
      pareja({ estado_pago: 'pendiente' }),
      pareja({ estado_pago: 'pendiente' }),
    ];
    const { zonas, excluidas } = generarZonas(parejas, { rng: crearRng(1) });

    const sorteadas = zonas.flatMap((z) => z.parejas);
    expect(sorteadas).toHaveLength(2);
    expect(excluidas).toHaveLength(2);
    expect(excluidas.every((e) => e.motivo === 'pago_pendiente')).toBe(true);
    expect(sorteadas.every((p) => p.estado_pago !== 'pendiente')).toBe(true);
  });

  it('no pierde ni duplica parejas y nombra las zonas A, B, C...', () => {
    reset();
    const parejas = Array.from({ length: 10 }, () => pareja());
    const { zonas } = generarZonas(parejas, { rng: crearRng(99) });

    // 10 parejas -> [4, 3, 3] -> 3 zonas.
    expect(zonas.map((z) => z.nombre)).toEqual(['Zona A', 'Zona B', 'Zona C']);
    expect(zonas.map((z) => z.orden)).toEqual([1, 2, 3]);
    expect(zonas.map((z) => z.parejas.length)).toEqual([4, 3, 3]);

    const ids = zonas.flatMap((z) => z.parejas.map((p) => p.id));
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
  });

  it('es reproducible con la misma semilla y distinto con otra', () => {
    reset();
    const base = Array.from({ length: 12 }, () => pareja());
    const orden = (seed: number) =>
      generarZonas(base, { rng: crearRng(seed) }).zonas.flatMap((z) => z.parejas.map((p) => p.id));

    expect(orden(1234)).toEqual(orden(1234));
    expect(orden(1234)).not.toEqual(orden(4321));
  });

  it('analizarSorteo explica por que no se puede sortear', () => {
    reset();
    expect(analizarSorteo([]).habilitado).toBe(false);
    expect(analizarSorteo([pareja({ estado_pago: 'pendiente' })]).habilitado).toBe(false);
    expect(analizarSorteo([pareja({ estado_pago: 'pendiente' })]).motivo).toMatch(/pago/i);

    const ok = analizarSorteo([pareja(), pareja()]);
    expect(ok.habilitado).toBe(true);
    expect(ok.zonasEstimadas).toBe(1);

    expect(puedeGenerarPlayoffs(1)).toBe(false);
    expect(puedeGenerarPlayoffs(4)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */

describe('generarFixtureZonas / round robin', () => {
  it('una zona de 3 genera 3 partidos todos contra todos', () => {
    const p = [pareja({ id: 'A' }), pareja({ id: 'B' }), pareja({ id: 'C' })];
    const partidos = generarFixtureZonas([zona('Zona A', p)]);

    expect(partidos).toHaveLength(3);
    const duelos = partidos.map((m) => [m.pareja_1_id, m.pareja_2_id].sort().join('-'));
    expect(duelos.sort()).toEqual(['A-B', 'A-C', 'B-C']);
    expect(partidos.every((m) => m.fase === 'zona')).toBe(true);
    expect(partidos.every((m) => m.zona_nombre === 'Zona A')).toBe(true);
  });

  it('una zona de 4 genera 6 partidos en 3 rondas de 2, sin repetir rival', () => {
    const p = ['A', 'B', 'C', 'D'].map((id) => pareja({ id }));
    const partidos = generarFixtureZonas([zona('Zona A', p)]);

    expect(partidos).toHaveLength(6);
    expect(new Set(partidos.map((m) => m.ronda)).size).toBe(3);

    for (const ronda of [1, 2, 3]) {
      const enRonda = partidos.filter((m) => m.ronda === ronda);
      expect(enRonda).toHaveLength(2);
      // Nadie juega dos veces en la misma ronda.
      const participantes = enRonda.flatMap((m) => [m.pareja_1_id, m.pareja_2_id]);
      expect(new Set(participantes).size).toBe(4);
    }
  });

  it('ninguna pareja se enfrenta a si misma y el total es C(n,2)', () => {
    for (let n = 2; n <= 9; n++) {
      const p = Array.from({ length: n }, (_, i) => pareja({ id: `P${i}` }));
      const partidos = generarFixtureZonas([zona('Zona A', p)]);
      expect(partidos).toHaveLength(cantidadPartidosZona(n));
      for (const m of partidos) expect(m.pareja_1_id).not.toBe(m.pareja_2_id);
      const duelos = new Set(partidos.map((m) => [m.pareja_1_id, m.pareja_2_id].sort().join('-')));
      expect(duelos.size).toBe(partidos.length);
    }
  });

  it('genera fixture para varias zonas con orden global incremental', () => {
    const zonas = [
      zona('Zona A', ['A1', 'A2', 'A3'].map((id) => pareja({ id }))),
      zona('Zona B', ['B1', 'B2', 'B3'].map((id) => pareja({ id }))),
    ];
    const partidos = generarFixtureZonas(zonas);
    expect(partidos).toHaveLength(6);
    expect(partidos.map((p) => p.orden)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(partidos.filter((p) => p.zona_nombre === 'Zona A')).toHaveLength(3);
  });

  it('una zona de 1 pareja no genera partidos y no rompe', () => {
    expect(generarFixtureZonas([zona('Zona A', [pareja()])])).toHaveLength(0);
  });

  it('generarRoundRobin respeta los byes con n impar', () => {
    expect(generarRoundRobin(2)).toHaveLength(1);
    expect(generarRoundRobin(3)).toHaveLength(3);
    expect(generarRoundRobin(5)).toHaveLength(10);
  });
});

/* -------------------------------------------------------------------------- */

describe('calcularTablaPosiciones', () => {
  const cat6 = () => ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id) => pareja({ id }));

  it('calcula PJ, PG, PP, sets y games', () => {
    const partidos = [
      // p1 le gana a p2 6-0 6-0
      partido({ pareja_1_id: 'p1', pareja_2_id: 'p2', set1_p1: 6, set1_p2: 0, set2_p1: 6, set2_p2: 0 }),
      // p1 le gana a p3 con tie-break 6-7, 7-5, 7-6
      partido({
        pareja_1_id: 'p1',
        pareja_2_id: 'p3',
        set1_p1: 6,
        set1_p2: 7,
        set2_p1: 7,
        set2_p2: 5,
        set3_p1: 7,
        set3_p2: 6,
      }),
      // p3 le gana a p2 6-1 6-2 (p3 es pareja_2)
      partido({ pareja_1_id: 'p2', pareja_2_id: 'p3', set1_p1: 1, set1_p2: 6, set2_p1: 2, set2_p2: 6 }),
    ];

    const tabla = calcularTablaPosiciones(partidos, cat6());
    const p1 = tabla.find((f) => f.pareja.id === 'p1')!;
    const p2 = tabla.find((f) => f.pareja.id === 'p2')!;
    const p3 = tabla.find((f) => f.pareja.id === 'p3')!;

    expect(p1.pj).toBe(2);
    expect(p1.pg).toBe(2);
    expect(p1.pp).toBe(0);
    expect(p1.sa).toBe(4); // 2 sets vs p2 + 2 sets vs p3
    expect(p1.sc).toBe(1); // 0 + 1 (perdio el primer set del tie-break)
    expect(p1.difSets).toBe(3);
    expect(p1.ga).toBe(32); // (6+6) + (6+7+7)
    expect(p1.gb).toBe(18); // (0+0) + (7+5+6)
    expect(p1.difGames).toBe(14);

    // p2 perdio contra p1 y contra p3.
    expect(p2.pj).toBe(2);
    expect(p2.pg).toBe(0);
    expect(p2.pp).toBe(2);
    expect(p2.sa).toBe(0);
    expect(p2.sc).toBe(4);

    // p3 le gano a p2 y perdio el tie-break contra p1.
    expect(p3.pj).toBe(2);
    expect(p3.pg).toBe(1);
    expect(p3.pp).toBe(1);
    expect(p3.sa).toBe(3);
    expect(p3.sc).toBe(2);
    expect(p3.difGames).toBe(7); // (18-20) + (12-3)

    // Orden final: p1 (2 PG), luego p3 (1 PG). p2 (0 PG, diferencia -4) cae
    // detras de las parejas que no jugaron: difSets tambien es criterio de orden.
    expect(tabla[0].pareja.id).toBe('p1');
    expect(tabla[1].pareja.id).toBe('p3');
    expect(tabla[0].posicion).toBe(1);
    expect(tabla[0].clasificado).toBe(true);
    expect(tabla[1].clasificado).toBe(true);

    const p2Fila = tabla.find((f) => f.pareja.id === 'p2')!;
    expect(p2Fila.clasificado).toBe(false);
    expect(p2Fila.difSets).toBe(-4);
  });

  it('ordena por PG, luego diferencia de sets', () => {
    const cat3 = ['p1', 'p2', 'p3'].map((id) => pareja({ id }));
    const partidos = [
      // A(=p1) vs B(=p2): A gana 2-1 con tie-break -> dif sets +1 / -1
      partido({
        pareja_1_id: 'p1',
        pareja_2_id: 'p2',
        set1_p1: 7,
        set1_p2: 6,
        set2_p1: 6,
        set2_p2: 7,
        set3_p1: 7,
        set3_p2: 6,
      }),
      // B(=p2) vs C(=p3): B gana 6-0 6-0 -> dif sets +2 / -2
      partido({ pareja_1_id: 'p2', pareja_2_id: 'p3', set1_p1: 6, set1_p2: 0, set2_p1: 6, set2_p2: 0 }),
      // C(=p3) vs A(=p1): C gana 6-0 6-0 -> dif sets +2 / -2
      partido({ pareja_1_id: 'p3', pareja_2_id: 'p1', set1_p1: 6, set1_p2: 0, set2_p1: 6, set2_p2: 0 }),
    ];

    const tabla = calcularTablaPosiciones(partidos, cat3);

    // Los tres quedan 1 PG / 1 PP, asi que decide la diferencia de sets:
    // p2: +2 (vs p3) - 1 (vs p1) = +1
    // p3: +2 (vs p1) - 2 (vs p2) =  0
    // p1: +1 (vs p2) - 2 (vs p3) = -1
    expect(tabla.map((f) => f.pareja.id)).toEqual(['p2', 'p3', 'p1']);
    expect(tabla.map((f) => f.difSets)).toEqual([1, 0, -1]);
    expect(tabla.every((f) => f.pg === 1 && f.pp === 1)).toBe(true);
  });

  it('desempata con games cuando la diferencia de sets es igual', () => {
    // Circulo perfecto con 6-0 6-0 en todos los cruces: empate total en
    // PG, PP, dif sets, sets a favor y games a favor. Gana el desempate final
    // por nombre (determinista).
    const cat3 = ['p1', 'p2', 'p3'].map((id) => pareja({ id }));
    const partidos = [
      partido({ pareja_1_id: 'p1', pareja_2_id: 'p2', set1_p1: 6, set1_p2: 0, set2_p1: 6, set2_p2: 0 }),
      partido({ pareja_1_id: 'p2', pareja_2_id: 'p3', set1_p1: 6, set1_p2: 0, set2_p1: 6, set2_p2: 0 }),
      partido({ pareja_1_id: 'p3', pareja_2_id: 'p1', set1_p1: 6, set1_p2: 0, set2_p1: 6, set2_p2: 0 }),
    ];

    const tabla = calcularTablaPosiciones(partidos, cat3);
    expect(tabla.every((f) => f.pg === 1 && f.pp === 1 && f.difSets === 0 && f.difGames === 0)).toBe(true);
    expect(tabla.map((f) => f.pareja.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('ignora partidos sin score y cuenta los pendientes', () => {
    const partidos = [
      partido({ pareja_1_id: 'p1', pareja_2_id: 'p2', set1_p1: 6, set1_p2: 0, set2_p1: 6, set2_p2: 0 }),
      partido({ pareja_1_id: 'p1', pareja_2_id: 'p3' }), // sin score
    ];

    const tabla = calcularTablaPosiciones(partidos, cat6());
    const p1 = tabla.find((f) => f.pareja.id === 'p1')!;
    expect(p1.pj).toBe(2);
    expect(p1.pg).toBe(1);
    expect(p1.pendientes).toBe(1);
    // Un partido sin score no debe sumar games ni diferencias.
    expect(p1.difGames).toBe(12);

    // Las parejas que no jugaron siguen apareciendo con PJ 0.
    expect(tabla).toHaveLength(6);
    expect(tabla.find((f) => f.pareja.id === 'p6')!.pj).toBe(0);
  });

  it('deriva el ganador desde los sets, ignorando un ganador_id sucio', () => {
    const m = partido({
      pareja_1_id: 'p1',
      pareja_2_id: 'p2',
      set1_p1: 3,
      set1_p2: 6,
      set2_p1: 4,
      set2_p2: 6,
      ganador_id: 'p1', // dato inconsistente en la base
    });
    expect(ganadorDesdeSets(m)).toBe('p2');

    const tabla = calcularTablaPosiciones([m], cat6());
    expect(tabla.find((f) => f.pareja.id === 'p2')!.pg).toBe(1);
    expect(tabla.find((f) => f.pareja.id === 'p1')!.pp).toBe(1);
  });

  it('ignora partidos de otras fases', () => {
    const partidos = [
      partido({
        pareja_1_id: 'p1',
        pareja_2_id: 'p2',
        fase: 'cuartos',
        set1_p1: 6,
        set1_p2: 0,
        set2_p1: 6,
        set2_p2: 0,
      }),
    ];
    expect(calcularTablaPosiciones(partidos, cat6()).every((f) => f.pj === 0)).toBe(true);
  });

  it('extraerClasificados devuelve 1° y 2° por zona en orden alfabetico', () => {
    reset();
    const parejas = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id) => pareja({ id }));
    const partidoZona = (zona_id: string, zona_nombre: string, p1: string, p2: string) =>
      partido({ zona_id, zona_nombre, pareja_1_id: p1, pareja_2_id: p2, set1_p1: 6, set1_p2: 0, set2_p1: 6, set2_p2: 0 });

    const partidos = [
      partidoZona('z1', 'Zona A', 'p1', 'p2'),
      partidoZona('z1', 'Zona A', 'p1', 'p3'),
      partidoZona('z1', 'Zona A', 'p2', 'p3'),
      partidoZona('z2', 'Zona B', 'p4', 'p5'),
      partidoZona('z2', 'Zona B', 'p4', 'p6'),
      partidoZona('z2', 'Zona B', 'p5', 'p6'),
    ];

    const clasificados = extraerClasificados(calcularTablaPosiciones(partidos, parejas));

    expect(clasificados).toHaveLength(2);
    // Zona A: p1 2-0, p2 1-1, p3 0-2 -> 1° p1, 2° p2.
    expect(clasificados[0].zona).toBe('Zona A');
    expect(clasificados[0].primero.id).toBe('p1');
    expect(clasificados[0].segundo.id).toBe('p2');
    expect(clasificados[1].zona).toBe('Zona B');
    expect(clasificados[1].primero.id).toBe('p4');
    expect(clasificados[1].segundo.id).toBe('p5');
  });
});

/* -------------------------------------------------------------------------- */

describe('generarPlayoffs', () => {
  const clasificadosDe = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      zona: `Zona ${String.fromCharCode(65 + i)}`,
      primero: pareja({ id: `Z${i}-1` }),
      segundo: pareja({ id: `Z${i}-2` }),
    }));

  it('4 zonas: 1°A vs 2°B, 1°C vs 2°D, 1°B vs 2°A, 1°D vs 2°C (caso del spec)', () => {
    const { partidos, totalRondas, partidosPrimeraRonda } = generarPlayoffs(clasificadosDe(4));

    expect(partidosPrimeraRonda).toBe(4);
    expect(totalRondas).toBe(3);

    expect(partidos.filter((p) => p.ronda === 1).map((p) => [p.pareja_1_id, p.pareja_2_id])).toEqual([
      ['Z0-1', 'Z1-2'], // 1°A vs 2°B
      ['Z2-1', 'Z3-2'], // 1°C vs 2°D
      ['Z1-1', 'Z0-2'], // 1°B vs 2°A
      ['Z3-1', 'Z2-2'], // 1°D vs 2°C
    ]);
    expect(partidos.filter((p) => p.ronda === 1)[0].fase).toBe('cuartos');
  });

  it('NUNCA cruza el 1° y el 2° de la misma zona en la primera ronda', () => {
    for (let n = 2; n <= 16; n++) {
      const clasificados = clasificadosDe(n);
      const { partidos } = generarPlayoffs(clasificados);
      const zonaDe = new Map<string, string>();
      for (const c of clasificados) {
        zonaDe.set(c.primero.id, c.zona);
        zonaDe.set(c.segundo.id, c.zona);
      }

      for (const p of partidos.filter((x) => x.ronda === 1)) {
        if (!p.pareja_1_id || !p.pareja_2_id) continue; // bye
        expect(zonaDe.get(p.pareja_1_id)).not.toBe(zonaDe.get(p.pareja_2_id));
      }
    }
  });

  it('2 zonas -> semifinal y final', () => {
    const { partidos, totalRondas } = generarPlayoffs(clasificadosDe(2));
    expect(partidos).toHaveLength(3);
    expect(totalRondas).toBe(2);
    expect(partidos.filter((p) => p.fase === 'semifinal')).toHaveLength(2);
    expect(partidos.filter((p) => p.fase === 'final')).toHaveLength(1);
    // La final arranca sin parejas: se llenan al cerrar las semis.
    expect(partidos.filter((p) => p.fase === 'final')[0].pareja_1_id).toBeNull();
  });

  it('3 zonas -> un bye por mitad del cuadro', () => {
    const primera = generarPlayoffs(clasificadosDe(3)).partidos.filter((p) => p.ronda === 1);
    expect(primera).toHaveLength(4);

    const byes = primera.filter((p) => p.pareja_1_id === null || p.pareja_2_id === null);
    expect(byes).toHaveLength(2);
    // indices 0-1 = primera mitad, 2-3 = segunda mitad: un bye en cada una.
    expect(byes.map((b) => b.orden - 1 < 2)).toEqual([true, false]);
  });

  it('5 y 6 zonas rellenan con BYEs hasta una potencia de 2', () => {
    for (const n of [5, 6]) {
      const { partidos, partidosPrimeraRonda, totalRondas } = generarPlayoffs(clasificadosDe(n));
      // 2 * ceil(n/2) no es potencia de 2 -> se rellena a 8.
      expect(partidosPrimeraRonda).toBe(8);
      expect(totalRondas).toBe(4);
      expect(partidos.filter((p) => p.fase === 'octavos')).toHaveLength(8);
      expect(partidos.filter((p) => p.fase === 'final')).toHaveLength(1);
      // Las 2n parejas clasificadas siguen apareciendo exactamente una vez.
      const usados = partidos
        .filter((p) => p.ronda === 1)
        .flatMap((p) => [p.pareja_1_id, p.pareja_2_id])
        .filter((x): x is string => Boolean(x));
      expect(usados).toHaveLength(n * 2);
      expect(new Set(usados).size).toBe(n * 2);
    }
  });

  it('8 zonas -> octavos, cuartos, semifinal, final', () => {
    const { partidos, totalRondas } = generarPlayoffs(clasificadosDe(8));
    expect(totalRondas).toBe(4);
    expect(partidos.filter((p) => p.fase === 'octavos')).toHaveLength(8);
    expect(partidos.filter((p) => p.fase === 'cuartos')).toHaveLength(4);
    expect(partidos.filter((p) => p.fase === 'semifinal')).toHaveLength(2);
    expect(partidos.filter((p) => p.fase === 'final')).toHaveLength(1);
    expect(partidos).toHaveLength(15);
  });

  it('16 zonas -> dieciseisavos (extension del spec)', () => {
    const { partidos } = generarPlayoffs(clasificadosDe(16));
    expect(partidos.filter((p) => p.fase === 'dieciseisavos')).toHaveLength(16);
    expect(partidos.filter((p) => p.fase === 'final')).toHaveLength(1);
  });

  it('el bracket esta completo y balanceado en todas las rondas', () => {
    for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 12, 16]) {
      const { partidos } = generarPlayoffs(clasificadosDe(n));
      const porRonda = new Map<number, number>();
      for (const p of partidos) porRonda.set(p.ronda, (porRonda.get(p.ronda) ?? 0) + 1);

      const rondas = [...porRonda.keys()].sort((a, b) => a - b);
      expect(rondas).toEqual(Array.from({ length: rondas.length }, (_, i) => i + 1));

      for (let i = 1; i < rondas.length; i++) {
        expect(porRonda.get(rondas[i])).toBe(porRonda.get(rondas[i - 1])! / 2);
      }
      // Cada ronda, menos la primera, arranca con los slots vacios.
      for (const p of partidos.filter((x) => x.ronda > 1)) {
        expect(p.pareja_1_id).toBeNull();
        expect(p.pareja_2_id).toBeNull();
      }
      // El ultimo es siempre la final.
      expect(partidos.filter((p) => p.fase === 'final')).toHaveLength(1);
    }
  });

  it('rechaza entradas invalidas', () => {
    expect(() => generarPlayoffs([])).toThrowError(/al menos 2 zonas/i);
    expect(() => generarPlayoffs(clasificadosDe(1))).toThrowError(/al menos 2 zonas/i);
    expect(() => generarPlayoffs(clasificadosDe(17))).toThrowError(/maximo soportado/i);

    const incompletos = clasificadosDe(2);
    incompletos[1].segundo = undefined as never;
    expect(() => generarPlayoffs(incompletos)).toThrowError(/no tiene definido el/i);
  });

  it('faseDePartidos mapea el numero de partidos a la fase', () => {
    expect(faseDePartidos(16)).toBe('dieciseisavos');
    expect(faseDePartidos(8)).toBe('octavos');
    expect(faseDePartidos(4)).toBe('cuartos');
    expect(faseDePartidos(2)).toBe('semifinal');
    expect(faseDePartidos(1)).toBe('final');
    expect(() => faseDePartidos(3)).toThrow();
  });
});

/* -------------------------------------------------------------------------- */

describe('construirBracket', () => {
  it('arma las columnas del bracket y detecta al campeon', () => {
    const clasificados = ['Zona A', 'Zona B', 'Zona C', 'Zona D'].map((zona, i) => ({
      zona,
      primero: pareja({ id: `Z${i}-1` }),
      segundo: pareja({ id: `Z${i}-2` }),
    }));
    const { partidos } = generarPlayoffs(clasificados);

    type Slot = (typeof partidos)[number];
    const jugar = (p: Slot, ganadorId: string): Partido =>
      ({
        ...p,
        id: `m-${p.ronda}-${p.orden}`,
        pareja_1_id: p.pareja_1_id,
        pareja_2_id: p.pareja_2_id,
        ganador_id: ganadorId,
        // Los sets mandan sobre ganador_id: es la fuente de verdad.
        set1_p1: 6,
        set1_p2: 0,
        set2_p1: 6,
        set2_p2: 0,
      }) as unknown as Partido;

    const r1 = partidos.filter((p) => p.ronda === 1).map((p, i) => jugar(p, `ganador-cuarto-${i}`));
    const r2 = partidos
      .filter((p) => p.ronda === 2)
      .map((p, i) =>
        jugar(
          { ...p, pareja_1_id: `ganador-cuarto-${2 * i}`, pareja_2_id: `ganador-cuarto-${2 * i + 1}` },
          `CAMPEON`,
        ),
      );
    const r3 = partidos
      .filter((p) => p.ronda === 3)
      .map((p) =>
        jugar({ ...p, pareja_1_id: 'semifinalista-1', pareja_2_id: 'semifinalista-2' }, 'ignorado'),
      );

    const bracket = construirBracket([...r1, ...r2, ...r3]);

    expect(bracket.rondas.map((r) => r.fase)).toEqual(['cuartos', 'semifinal', 'final']);
    expect(bracket.rondas.map((r) => r.partidos.length)).toEqual([4, 2, 1]);
    expect(bracket.rondas[0].partidos[0].rondasRestantes).toBe(2);
    expect(bracket.rondas[0].partidos[0].hayGanador).toBe(true);
    // El campeon se deriva de los sets de la final, no del ganador_id.
    expect(bracket.campeon).toBe('semifinalista-1');
  });
});

/* -------------------------------------------------------------------------- */

describe('validacion', () => {
  it('valida el formulario de pareja', () => {
    expect(validarPareja({})).toMatchObject({
      j1_nombre: expect.any(String),
      j2_nombre: expect.any(String),
      j1_telefono: expect.any(String),
      j2_telefono: expect.any(String),
    });

    expect(
      validarPareja({
        j1_nombre: 'Ana Gomez',
        j1_telefono: '11 5555-1234',
        j2_nombre: 'ana  gomez',
        j2_telefono: '11 5555-9999',
      }).j2_nombre,
    ).toMatch(/distintas/i);

    expect(
      validarPareja({
        j1_nombre: 'Ana',
        j1_telefono: '123',
        j2_nombre: 'Luis',
        j2_telefono: '11 5555-9999',
      }).j1_telefono,
    ).toBeTruthy();

    expect(
      validarPareja({
        j1_nombre: 'Ana Gomez',
        j1_telefono: '11 5555-1234',
        j2_nombre: 'Luis Perez',
        j2_telefono: '11 5555-9999',
        estado_pago: 'pagado',
        monto_abonado: 100,
      }),
    ).toEqual({});

    // Seña sin monto abonado es inconsistente.
    expect(
      validarPareja({
        j1_nombre: 'Ana',
        j1_telefono: '1155551234',
        j2_nombre: 'Luis',
        j2_telefono: '1155559999',
        estado_pago: 'sena',
        monto_abonado: 0,
      }).monto_abonado,
    ).toMatch(/seña/i);
  });

  it('valida resultados de padel', () => {
    // Limpiar el resultado esta permitido.
    expect(validarResultado({})).toEqual({});

    // Un set no puede terminar empatado.
    expect(
      validarResultado({ set1_p1: 6, set1_p2: 6, set2_p1: 6, set2_p2: 1 }).set1_p1,
    ).toMatch(/empatado/i);

    // 6-0 en el set 1 es un retiro: resultado completo y valido.
    expect(validarResultado({ set1_p1: 6, set1_p2: 0 })).toEqual({});

    // Un set en curso (5-3) no cierra el partido.
    expect(validarResultado({ set1_p1: 5, set1_p2: 3 }).set1_p1).toMatch(/en curso/i);

    // 6-4 tambien es un set terminal: el partido se define ahi.
    expect(validarResultado({ set1_p1: 6, set1_p2: 4 })).toEqual({});

    // Un set 2 en curso tampoco se acepta, aunque el set 1 esté cerrado.
    expect(
      validarResultado({ set1_p1: 6, set1_p2: 0, set2_p1: 4, set2_p2: 3 }).set2_p1,
    ).toMatch(/en curso/i);

    // No se puede cargar el set 2 sin el 1.
    expect(validarResultado({ set2_p1: 6, set2_p2: 0 }).set2_p1).toMatch(/sin el set 1/i);

    // Tie-break invalido si el match no va 1-1 (0-2).
    expect(
      validarResultado({
        set1_p1: 6,
        set1_p2: 0,
        set2_p1: 6,
        set2_p2: 1,
        set3_p1: 7,
        set3_p2: 5,
      }).set3_p1,
    ).toMatch(/1-1/i);

    // Tie-break invalido si el mismo lado gano los dos primeros sets.
    expect(
      validarResultado({
        set1_p1: 6,
        set1_p2: 4,
        set2_p1: 6,
        set2_p2: 3,
        set3_p1: 7,
        set3_p2: 5,
      }).set3_p1,
    ).toMatch(/1-1/i);

    // Tie-break valido con 1-1: set 1 para p1, set 2 para p2.
    expect(
      validarResultado({
        set1_p1: 7,
        set1_p2: 6,
        set2_p1: 4,
        set2_p2: 6,
        set3_p1: 7,
        set3_p2: 6,
      }),
    ).toEqual({});

    // 1-1 sin tie-break cargado: inconcluso.
    expect(
      validarResultado({
        set1_p1: 7,
        set1_p2: 6,
        set2_p1: 4,
        set2_p2: 6,
      }).set1_p1,
    ).toMatch(/empatado a sets/i);
  });
});

/* -------------------------------------------------------------------------- */

describe('validarCronograma', () => {
  const cancha: Cancha = {
    id: 'c1',
    nombre: 'Cancha 1',
    tipo: 'padel',
    superficie: 'cesped',
    capacidad: 4,
    activa: true,
    created_at: '',
    updated_at: '',
  };
  void cancha;

  const torneo = { hora_inicio: '09:00', hora_fin: '22:00', dias_juego: [1, 2, 3, 4, 5, 6, 7] };

  const agenda = (over: Partial<PartidoAgenda>): PartidoAgenda => ({
    id: 'x',
    categoria_id: 'cat-1',
    zona_id: null,
    ronda: 1,
    orden_fixture: 1,
    fase: 'cuartos',
    pareja_1_id: 'p1',
    pareja_2_id: 'p2',
    set1_p1: null,
    set1_p2: null,
    set2_p1: null,
    set2_p2: null,
    set3_p1: null,
    set3_p2: null,
    ganador_id: null,
    cancha_id: 'c1',
    horario: null,
    resultado_nota: null,
    created_at: '',
    updated_at: '',
    pareja_1: null,
    pareja_2: null,
    cancha: null,
    inicio: null,
    fin: null,
    ...over,
  });

  const at = (hora: string) => new Date(`2026-03-10T${hora}:00`); // martes

  it('detecta doble reserva en la misma cancha', () => {
    const partidos = [
      agenda({ id: 'a', horario: at('10:00').toISOString() }), // 10:00 - 11:15
      agenda({ id: 'b', pareja_1_id: 'p3', pareja_2_id: 'p4', horario: at('10:30').toISOString() }),
    ];
    expect(validarCronograma(partidos, { torneo }, []).some((c) => c.tipo === 'cancha_superpuesta')).toBe(
      true,
    );
  });

  it('detecta que una pareja juegue dos partidos a la vez en canchas distintas', () => {
    const partidos = [
      agenda({ id: 'a', horario: at('10:00').toISOString() }),
      agenda({ id: 'b', cancha_id: 'c2', horario: at('10:30').toISOString() }),
    ];
    expect(validarCronograma(partidos, { torneo }, []).some((c) => c.tipo === 'pareja_doble')).toBe(
      true,
    );
  });

  it('detecta descanso insuficiente entre partidos de la misma pareja', () => {
    const partidos = [
      agenda({ id: 'a', horario: at('10:00').toISOString() }), // 10:00 - 11:15
      agenda({ id: 'b', horario: at('11:20').toISOString() }), // solo 5 min
    ];
    expect(
      validarCronograma(partidos, { torneo, descansoMin: 30 }, []).some(
        (c) => c.tipo === 'descanso_insuficiente',
      ),
    ).toBe(true);
  });

  it('acepta una agenda sin conflictos', () => {
    const partidos = [
      agenda({ id: 'a', horario: at('09:00').toISOString() }), // 09:00 - 10:15
      agenda({ id: 'b', pareja_1_id: 'p3', pareja_2_id: 'p4', horario: at('11:00').toISOString() }),
    ];
    expect(validarCronograma(partidos, { torneo, descansoMin: 30 }, []).filter((c) => c.severidad === 'error')).toHaveLength(0);
  });

  it('avisa sin bloquear si el slot cae fuera del horario del torneo', () => {
    const partidos = [agenda({ id: 'a', horario: at('21:30').toISOString() })];
    const fuera = validarCronograma(partidos, { torneo }, []).find((c) => c.tipo === 'fuera_de_horario');
    expect(fuera?.severidad).toBe('advertencia');
  });

  it('avisa si el dia no es jugable', () => {
    // Domingo: la semana base (1..7) lo excluye.
    const partidos = [agenda({ id: 'a', horario: new Date('2026-03-08T10:00:00').toISOString() })];
    const fuera = validarCronograma(partidos, { torneo: { ...torneo, dias_juego: [1, 2, 3, 4, 5] } }, []).find(
      (c) => c.tipo === 'dia_no_jugable',
    );
    expect(fuera?.severidad).toBe('advertencia');
  });

  it('nombra a las parejas en el mensaje', () => {
    const parejas = [pareja({ id: 'p1', j1_nombre: 'Ana', j2_nombre: 'Luis' })];
    const partidos = [
      agenda({ id: 'a', pareja_1_id: 'p1', pareja_2_id: 'p2', horario: at('10:00').toISOString() }),
      agenda({ id: 'b', pareja_1_id: 'p1', pareja_2_id: 'p2', horario: at('10:30').toISOString() }),
    ];
    expect(validarCronograma(partidos, { torneo }, parejas).some((c) => c.mensaje.includes('Ana / Luis'))).toBe(
      true,
    );
  });

  it('resumenCronograma cuenta los pendientes a partir del total, no de la lista filtrada', () => {
    // Regresión: antes se le pasaba la agenda ya filtrada por `horario`, así que
    // `sinHorario` daba siempre 0 y el badge mentía.
    const conflictos = validarCronograma([agenda({ id: 'a', horario: at('10:00').toISOString() })], { torneo }, []);

    const resumen = resumenCronograma(8, 1, conflictos);
    expect(resumen.conHorario).toBe(1);
    expect(resumen.sinHorario).toBe(7);
    expect(resumen.errores).toBe(0);
  });
});
