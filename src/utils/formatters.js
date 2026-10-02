export const capitalizarPalabras = (texto) => {
  if (!texto || typeof texto !== 'string') return '';
  return texto
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((palabra) => palabra.charAt(0).toUpperCase() + palabra.slice(1))
    .join(' ');
};

export const generarCodigoCorto = () => {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let codigo = '';
  for (let i = 0; i < 6; i++) {
    codigo += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return codigo;
};
