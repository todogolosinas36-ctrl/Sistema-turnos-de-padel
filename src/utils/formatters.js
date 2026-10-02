export const capitalizarPalabras = (texto) => {
  if (!texto || typeof texto !== 'string') return '';
  return texto
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((palabra) => palabra.charAt(0).toUpperCase() + palabra.slice(1))
    .join(' ');
};
