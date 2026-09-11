// No hay fotos de producto reales (no se fabricó ninguna: ver
// docs/frontend-diseno.md, "pendiente de alcance"). Mientras tanto, en vez
// de un mismo ícono genérico para cualquier producto, se elige uno acorde a
// su categoría (a partir de datos que la API ya devuelve, no inventados),
// para que el catálogo se distinga visualmente por tipo de producto, más
// parecido a cómo Chewy diferencia sus secciones.
const ICONOS_POR_PALABRA_CLAVE = [
  [/aliment/i, '🍖'],
  [/juguet/i, '🎾'],
  [/higien|shampoo|cuidado/i, '🧴'],
];

const ICONO_POR_DEFECTO = '🐾';

const obtenerIconoProducto = (producto) => {
  const nombreCategoria = producto?.categoria?.nombre || '';

  const coincidencia = ICONOS_POR_PALABRA_CLAVE.find(([patron]) => patron.test(nombreCategoria));

  return coincidencia ? coincidencia[1] : ICONO_POR_DEFECTO;
};

export default obtenerIconoProducto;
