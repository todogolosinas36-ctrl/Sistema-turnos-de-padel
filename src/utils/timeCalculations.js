export function calcularHoraFin(horaInicio, duracionMinutos) {
  if (!horaInicio) return '';
  const [h, m] = horaInicio.split(':').map(Number);
  const totalMinutos = h * 60 + m + parseInt(duracionMinutos, 10);
  const horasFinales = Math.floor(totalMinutos / 60) % 24;
  const minutosFinales = totalMinutos % 60;
  return `${horasFinales.toString().padStart(2, '0')}:${minutosFinales.toString().padStart(2, '0')}`;
}
