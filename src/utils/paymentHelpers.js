/**
 * Helper para cálculo y formateo de métodos de pago (incluyendo Pago Mixto)
 */

export function formatearMetodoPagoMixto(montos = {}) {
  const partes = [];
  const efec = Math.max(0, Math.round(Number(montos.efectivo) || 0));
  const transf = Math.max(0, Math.round(Number(montos.transferencia) || 0));
  const deb = Math.max(0, Math.round(Number(montos.debito) || 0));
  const cred = Math.max(0, Math.round(Number(montos.credito) || 0));
  const tarj = Math.max(0, Math.round(Number(montos.tarjeta) || 0));

  if (efec > 0) partes.push(`Efec: ${efec}`);
  if (transf > 0) partes.push(`Transf: ${transf}`);
  if (deb > 0) partes.push(`Débito: ${deb}`);
  if (cred > 0) partes.push(`Crédito: ${cred}`);
  if (tarj > 0 && deb === 0 && cred === 0) partes.push(`Tarjeta: ${tarj}`);

  if (partes.length === 0) return 'mixto';
  return `Mixto - ${partes.join(', ')}`;
}

export function calcularTotalesMixtos(total, montos = {}) {
  const efec = Math.max(0, Number(montos.efectivo) || 0);
  const transf = Math.max(0, Number(montos.transferencia) || 0);
  const deb = Math.max(0, Number(montos.debito) || 0);
  const cred = Math.max(0, Number(montos.credito) || 0);
  const tarj = Math.max(0, Number(montos.tarjeta) || 0);
  const suma = Math.round(efec + transf + deb + cred + tarj);
  const totalRedondeado = Math.round(Number(total) || 0);
  const restante = totalRedondeado - suma;

  return {
    suma,
    restante,
    esExacto: restante === 0 && totalRedondeado > 0,
    esExcedido: restante < 0,
    esFaltante: restante > 0,
  };
}

/**
 * Determina el precio base de la cancha para un turno específico garantizando
 * la Fuente de la Verdad (Supabase) y evitando cálculos globales o parpadeos.
 *
 * @param {Object} turno - Objeto del turno desde Supabase o creación
 * @param {number|null} precioBaseGlobal - Precio base general consolidado
 * @param {Object} [tarifasDinamicas] - Opcional: configuración de tarifas pico/valle
 */
export function resolverPrecioCancha(turno, precioBaseGlobal, tarifasDinamicas = null) {
  if (!turno) {
    return Number.isFinite(Number(precioBaseGlobal)) && Number(precioBaseGlobal) > 0
      ? Math.round(Number(precioBaseGlobal))
      : null;
  }

  // 1. Prioridad Absoluta (Fuente de la Verdad en Supabase):
  // Si el turno ya tiene un precio asignado en la base de datos, NUNCA se sobreescribe ni recalcula.
  const precioGuardado =
    Number(turno.total_base_cancha) ||
    Number(turno.precio_total) ||
    Number(turno.precio);
  if (Number.isFinite(precioGuardado) && precioGuardado > 0) {
    return Math.round(precioGuardado);
  }

  // 2. Si no hay precio base consolidado aún en la app ni en el turno, retornar null (permite mostrar skeleton)
  if (!Number.isFinite(Number(precioBaseGlobal)) || Number(precioBaseGlobal) <= 0) {
    return null;
  }

  const base = Math.round(Number(precioBaseGlobal));

  // 3. Lógica dinámica: Se calcula ÚNICAMENTE si se define tarifa diferencial y
  // usando ESTRICTAMENTE la hora del turno seleccionado (turno.hora_inicio), NUNCA fechas globales
  if (tarifasDinamicas && turno.hora_inicio) {
    const horaStr = String(turno.hora_inicio).substring(0, 5); // ej "19:00"
    const horaNum = parseInt(horaStr.split(':')[0], 10);
    if (tarifasDinamicas.horaInicioPico && horaNum >= tarifasDinamicas.horaInicioPico) {
      if (tarifasDinamicas.precioPico) return Math.round(Number(tarifasDinamicas.precioPico));
    }
  }

  return base;
}

/**
 * Extrae y desglosa todos los consumos de cantina imputados a un turno,
 * tanto desde gastos compartidos (con tipo/origen 'cantina' o articuloId)
 * como desde consumos individuales de kiosco en detalle_cobro.
 *
 * @param {Object} turno - Objeto del turno
 * @returns {{ total: number, items: Array<{ id: any, articuloId: any, nombre: string, cantidad: number, precio: number, tipo: string, origen: string, jugador?: string }> }}
 */
export function obtenerConsumoCantinaTurno(turno) {
  if (!turno) return { total: 0, items: [] };

  let total = 0;
  const items = [];

  // 1. Gastos compartidos de cantina
  if (Array.isArray(turno.gastos_compartidos)) {
    for (const g of turno.gastos_compartidos) {
      const esCantina =
        g.tipo === 'cantina' ||
        g.origen === 'cantina' ||
        Boolean(g.articuloId) ||
        Boolean(g.articulo_id);

      if (esCantina) {
        const cantidad = Number(g.cantidad) || 1;
        const monto =
          Number(g.monto) ||
          (Number(g.precioUnitario || g.precio || 0) * cantidad) ||
          0;

        total += monto;
        items.push({
          id: g.id || g.articuloId || `gc-${Math.random()}`,
          articuloId: g.articuloId || g.articulo_id,
          nombre: g.concepto || g.nombre || 'Artículo de Cantina',
          cantidad,
          precio: monto,
          tipo: 'cantina',
          origen: 'gasto_compartido',
        });
      }
    }
  }

  // 2. Consumos individuales de kiosco en detalle_cobro
  if (Array.isArray(turno.detalle_cobro)) {
    for (const jug of turno.detalle_cobro) {
      if (Array.isArray(jug.items)) {
        for (const it of jug.items) {
          const cantidad = Number(it.cantidad) || 1;
          const precioUnit = Number(it.precio) || 0;
          const subtotal = Number(it.subtotal) || (precioUnit * cantidad);

          total += subtotal;
          items.push({
            id: it.id || it.articuloId || `it-${Math.random()}`,
            articuloId: it.articuloId || it.id,
            nombre: it.nombre || 'Artículo de Kiosco',
            cantidad,
            precio: subtotal,
            jugador: jug.nombre,
            tipo: 'cantina',
            origen: 'kiosco_jugador',
          });
        }
      }
    }
  }

  return { total: Math.round(total), items };
}

/**
 * Calcula el monto neto correspondiente exclusivamente al alquiler de la cancha,
 * separándolo de cualquier consumo de cantina o extras asociados al turno.
 *
 * @param {Object} turno - Objeto del turno
 * @param {number|null} precioBaseGlobal - Precio base general
 * @returns {number} Monto neto de alquiler de la cancha
 */
export function resolverMontoCanchaNeto(turno, precioBaseGlobal) {
  if (!turno) return 0;

  const baseGuardada = Number(turno.total_base_cancha);
  if (Number.isFinite(baseGuardada) && baseGuardada > 0) {
    return Math.round(baseGuardada);
  }

  const { total: cantinaTotal } = obtenerConsumoCantinaTurno(turno);
  const precioTotal = Number(turno.precio) || 0;

  if (precioTotal > 0) {
    const neto = precioTotal - cantinaTotal;
    return neto > 0 ? Math.round(neto) : (Number(precioBaseGlobal) || 0);
  }

  return Number.isFinite(Number(precioBaseGlobal)) && Number(precioBaseGlobal) > 0
    ? Math.round(Number(precioBaseGlobal))
    : 0;
}

/**
 * Desglosa un monto monetario en las 4 categorías oficiales:
 * Efectivo, Transferencia, Débito y Crédito.
 *
 * @param {number} monto - Total a desglosar
 * @param {string} metodo - Identificador o detalle del método de pago
 * @returns {{ efectivo: number, transferencia: number, debito: number, credito: number }}
 */
export function desglosarMetodosPago(monto, metodo) {
  const total = Math.max(0, Math.round(Number(monto) || 0));
  if (total === 0) {
    return { efectivo: 0, transferencia: 0, debito: 0, credito: 0 };
  }

  const mStr = String(metodo || '').trim();

  // Si es un Pago Mixto formateado con valores explícitos:
  // e.g. "Mixto - Efec: 10000, Transf: 5000, Débito: 3000, Crédito: 2000"
  if (mStr.toLowerCase().startsWith('mixto')) {
    let efec = 0;
    let transf = 0;
    let deb = 0;
    let cred = 0;

    const matchEfec = mStr.match(/efec(?:tivo)?[:\s]+(\d+)/i);
    const matchTransf = mStr.match(/transf(?:erencia)?[:\s]+(\d+)/i);
    const matchDeb = mStr.match(/d[eé]b(?:ito)?[:\s]+(\d+)/i);
    const matchCred = mStr.match(/cr[eé]d(?:ito)?[:\s]+(\d+)/i);
    const matchTarj = mStr.match(/tarjeta[:\s]+(\d+)/i);

    if (matchEfec) efec = parseInt(matchEfec[1], 10) || 0;
    if (matchTransf) transf = parseInt(matchTransf[1], 10) || 0;
    if (matchDeb) deb = parseInt(matchDeb[1], 10) || 0;
    if (matchCred) cred = parseInt(matchCred[1], 10) || 0;
    if (matchTarj && deb === 0 && cred === 0) {
      deb = parseInt(matchTarj[1], 10) || 0;
    }

    const sumaParcial = efec + transf + deb + cred;
    if (sumaParcial > 0) {
      const remanente = total - sumaParcial;
      if (remanente > 0) efec += remanente;
      return { efectivo: efec, transferencia: transf, debito: deb, credito: cred };
    }
  }

  const mNorm = mStr.toLowerCase();

  if (mNorm.includes('transf') || mNorm.includes('mp') || mNorm.includes('mercado')) {
    return { efectivo: 0, transferencia: total, debito: 0, credito: 0 };
  }
  if (mNorm.includes('cred') || mNorm.includes('créd')) {
    return { efectivo: 0, transferencia: 0, debito: 0, credito: total };
  }
  if (mNorm.includes('deb') || mNorm.includes('déb') || mNorm.includes('tarjeta')) {
    return { efectivo: 0, transferencia: 0, debito: total, credito: 0 };
  }

  // Por defecto (efectivo, en mano, o no especificado)
  return { efectivo: total, transferencia: 0, debito: 0, credito: 0 };
}

/**
 * Procesa y totaliza un conjunto de turnos pagados y ventas de cantina,
 * consolidando los montos de Canchas vs Cantina y el desglose estricto
 * por Efectivo, Transferencia, Débito y Crédito.
 */
export function calcularConsolidadoFinanciero(turnos = [], ventas = [], precioBaseGlobal = null) {
  let totalCanchas = 0;
  let totalCantinaTurnos = 0;
  let totalCantinaMostrador = 0;

  const desgloseMetodos = {
    efectivo: { total: 0, canchas: 0, cantina: 0, cantidad: 0 },
    transferencia: { total: 0, canchas: 0, cantina: 0, cantidad: 0 },
    debito: { total: 0, canchas: 0, cantina: 0, cantidad: 0 },
    credito: { total: 0, canchas: 0, cantina: 0, cantidad: 0 },
  };

  const acumularMetodo = (monto, metodoStr, origen = 'canchas') => {
    if (!monto || monto <= 0) return;
    const split = desglosarMetodosPago(monto, metodoStr);

    for (const [metodo, val] of Object.entries(split)) {
      if (val > 0) {
        desgloseMetodos[metodo].total += val;
        desgloseMetodos[metodo][origen] += val;
        desgloseMetodos[metodo].cantidad += 1;
      }
    }
  };

  // 1. Procesar Turnos Pagados
  const desgloseTurnos = (turnos || []).map((turno) => {
    const { total: cantinaTotal, items: cantinaItems } = obtenerConsumoCantinaTurno(turno);
    const montoCanchaNeto = resolverMontoCanchaNeto(turno, precioBaseGlobal);
    const montoTotalTurno = montoCanchaNeto + cantinaTotal;

    totalCanchas += montoCanchaNeto;
    totalCantinaTurnos += cantinaTotal;

    // Desglose por jugador si existe detalle_cobro
    if (Array.isArray(turno.detalle_cobro) && turno.detalle_cobro.length > 0) {
      const numJugadores = turno.detalle_cobro.length;
      const cuotaCanchaPorJugador = Math.round(montoCanchaNeto / numJugadores);

      for (const jug of turno.detalle_cobro) {
        const metodoJug = jug.metodo_pago || jug.metodoPago || 'efectivo';
        const kioscoJug = (jug.items || []).reduce(
          (sum, it) => sum + (Number(it.precio) || 0) * (it.cantidad || 1),
          0
        );

        acumularMetodo(cuotaCanchaPorJugador, metodoJug, 'canchas');
        if (kioscoJug > 0) {
          acumularMetodo(kioscoJug, metodoJug, 'cantina');
        }
      }

      // Remanente de cantina en gastos compartidos no atribuido a items de jugador
      const cantinaEnItems = turno.detalle_cobro.reduce(
        (sum, j) =>
          sum +
          (j.items || []).reduce(
            (s, it) => s + (Number(it.precio) || 0) * (it.cantidad || 1),
            0
          ),
        0
      );
      const remanenteCantina = cantinaTotal - cantinaEnItems;
      if (remanenteCantina > 0) {
        acumularMetodo(remanenteCantina, turno.metodo_pago || 'efectivo', 'cantina');
      }
    } else {
      // Turno cobrado globalmente sin split individual
      const metodoGlobal = turno.metodo_pago || 'efectivo';
      acumularMetodo(montoCanchaNeto, metodoGlobal, 'canchas');
      if (cantinaTotal > 0) {
        acumularMetodo(cantinaTotal, metodoGlobal, 'cantina');
      }
    }

    return {
      turno,
      montoCanchaNeto,
      cantinaTotal,
      cantinaItems,
      montoTotalTurno,
    };
  });

  // 2. Procesar Ventas de Mostrador en Cantina
  for (const v of ventas || []) {
    const valTotal = Number(v.total) || 0;
    totalCantinaMostrador += valTotal;
    acumularMetodo(valTotal, v.metodo_pago || 'efectivo', 'cantina');
  }

  const totalCantina = totalCantinaMostrador + totalCantinaTurnos;
  const totalGeneral = totalCanchas + totalCantina;

  return {
    totalGeneral,
    totalCanchas,
    totalCantina,
    totalCantinaMostrador,
    totalCantinaTurnos,
    totalEfectivo: desgloseMetodos.efectivo.total,
    totalTransferencia: desgloseMetodos.transferencia.total,
    totalDebito: desgloseMetodos.debito.total,
    totalCredito: desgloseMetodos.credito.total,
    desgloseMetodos,
    desgloseTurnos,
    cantidadTurnos: (turnos || []).length,
    cantidadVentasCantina: (ventas || []).length,
  };
}

