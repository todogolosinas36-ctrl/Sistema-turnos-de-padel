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
