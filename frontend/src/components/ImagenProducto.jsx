import { useState } from 'react';
import obtenerIconoProducto from '../utils/iconoProducto.js';

// Corrección de esta etapa (ver docs/frontend-diseno.md, "Imágenes de
// producto"): si el producto tiene una URL de imagen real cargada desde el
// panel (backend/src/services/producto.service.js#prepararUrlImagen), se
// muestra esa imagen. Si no tiene ninguna, o si la URL cargada no llega a
// cargar (servidor externo caído, enlace roto — un estado que antes no se
// contemplaba), cae al mismo ícono por categoría que ya existía, en vez de
// dejar un espacio roto. Componente compartido por ProductCard y
// ProductoDetalle para no repetir esta lógica dos veces.
const ImagenProducto = ({ producto, claseContenedor, claseImagen }) => {
  const url = producto?.imagen?.url;
  const [fallo, setFallo] = useState(false);

  if (url && !fallo) {
    return (
      <div className={claseContenedor}>
        <img src={url} alt={producto.nombre} className={claseImagen} onError={() => setFallo(true)} />
      </div>
    );
  }

  return (
    <div className={claseContenedor} aria-hidden="true">
      {obtenerIconoProducto(producto)}
    </div>
  );
};

export default ImagenProducto;
