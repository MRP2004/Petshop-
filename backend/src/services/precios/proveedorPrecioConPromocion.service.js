import { presentarProductosConPrecioVigente } from './precioVigenteProducto.service.js';

const obtenerPrecioVigente = async (producto, contexto = {}) => {
  const [productoPresentado] = await presentarProductosConPrecioVigente(
    [producto],
    contexto,
  );
  return productoPresentado.precioVigente;
};

export default obtenerPrecioVigente;
