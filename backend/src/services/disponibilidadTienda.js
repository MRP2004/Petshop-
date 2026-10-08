import Tienda from '../models/tienda.model.js';
import AppError from '../errors/AppError.js';

// Ronda 2, Etapa 9 (hallazgo de Codex): una tienda suspendida ya no aparecía
// en el catálogo, pero sus productos se podían seguir cotizando, comprando
// (con el idProducto guardado en el carrito) y cargando en una venta manual.
//
// Orden de bloqueos global (revisión de diseño de Codex, Etapa 9): intento →
// medio de pago → productos (idProducto ascendente) → tiendas (idTienda
// ascendente). Esta función se llama SIEMPRE después de haber leído y
// bloqueado todos los productos. Las tiendas se leen con FOR SHARE: dos
// compras de la misma tienda no se serializan entre sí, pero una suspensión
// (cambiarEstadoTienda, FOR UPDATE) espera a que terminen, o las hace ver
// 'suspendida' si commiteó antes (una lectura con bloqueo es lectura actual,
// no el snapshot de la transacción).
//
// `productos`: instancias ya leídas, en el orden en que se procesaron.
// Devuelve un Map idTienda → Tienda (con idUsuario del dueño), deduplicado,
// que reutilizan los avisos a vendedores.
const verificarTiendasActivas = async (productos, { transaction } = {}) => {
  const idsTienda = [...new Set(productos.map((p) => p.idTienda).filter((id) => id != null))].sort(
    (a, b) => a - b,
  );

  const tiendasPorId = new Map();
  if (idsTienda.length === 0) return tiendasPorId;

  const opciones = transaction ? { transaction, lock: transaction.LOCK.SHARE } : {};
  const tiendas = await Tienda.findAll({
    where: { idTienda: idsTienda },
    order: [['idTienda', 'ASC']],
    ...opciones,
  });

  for (const tienda of tiendas) tiendasPorId.set(tienda.idTienda, tienda);

  // El error nombra el primer producto afectado según el orden de
  // procesamiento (determinístico: idProducto ascendente) y no dice por qué
  // dejó de estar disponible (no revela que la tienda está suspendida).
  const afectado = productos.find(
    (p) => p.idTienda != null && tiendasPorId.get(p.idTienda)?.estado !== 'activa',
  );

  if (afectado) {
    const error = new AppError(`El producto "${afectado.nombre}" ya no está disponible para la venta`, 409);
    error.codigo = 'PRODUCTO_NO_DISPONIBLE';
    throw error;
  }

  return tiendasPorId;
};

export { verificarTiendasActivas };
