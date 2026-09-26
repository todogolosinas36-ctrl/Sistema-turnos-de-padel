/**
 * Convierte una fecha a "YYYY-MM-DD" usando la zona horaria LOCAL.
 *
 * OJO: no usar `new Date().toISOString().split('T')[0]` para esto.
 * `toISOString()` convierte a UTC, y en Argentina (UTC-3) después de las 21:00
 * devuelve el día siguiente. Como el cierre de caja es justamente a esa hora,
 * la aplicación mostraba el turno del día equivocado.
 */
export function aISO(fecha = new Date()) {
  const yyyy = fecha.getFullYear();
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Fecha de hoy en "YYYY-MM-DD" (hora local). */
export function hoyISO() {
  return aISO(new Date());
}

/** Suma (o resta) días a una fecha ISO y devuelve otra fecha ISO. */
export function sumarDias(fechaISO, dias) {
  // Se parsea a mediodía para que un cambio de horario de verano no
  // desplace el resultado al día anterior.
  const [year, month, day] = fechaISO.split('-').map(Number);
  const d = new Date(year, month - 1, day, 12, 0, 0);
  d.setDate(d.getDate() + dias);
  return aISO(d);
}

/** "14:00:00" (así como lo devuelve Postgres) → "14:00" */
export function normalizarHora(hora) {
  if (!hora) return '';
  return String(hora).substring(0, 5);
}

export function generarBloquesHorarios(horaInicio, horaFin, duracionMinutos) {
  const bloques = [];

  const parseHora = (str) => {
    const [h, m] = str.split(':').map(Number);
    return h * 60 + m;
  };

  const formatHora = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  let actual = parseHora(horaInicio);
  const fin = parseHora(horaFin);

  while (actual <= fin) {
    bloques.push(formatHora(actual));
    actual += parseInt(duracionMinutos, 10);
  }

  return bloques;
}
