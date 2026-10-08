// Registro único de TODOS los modelos (con sus asociaciones). Lo importan
// server.js y los scripts que necesitan el esquema completo
// (scripts/crearTablasNuevas.js, scripts/verificarEsquemaActual.js), para que
// un modelo nuevo no quede afuera de alguno de ellos por olvido.
import './tipoMascota.model.js';
import './jerarquiaMascota.model.js';
import './categoria.model.js';
import './proveedor.model.js';
import './producto.model.js';
import './facetaProducto.model.js';
import './cliente.model.js';
import './medioPago.model.js';
import './venta.model.js';
import './detalleVenta.model.js';
import './usuario.model.js';
import './promocionProducto.model.js';
import './direccionEntrega.model.js';
import './imagenProducto.model.js';
import './intentoCompra.model.js';
import './pago.model.js';
import './comprobante.model.js';
import './detalleVentaPromocion.model.js';
import './solicitudCancelacion.model.js';
import './direccionCliente.model.js';
import './favorito.model.js';
import './aviso.model.js';
import './tienda.model.js';
import './solicitudVendedor.model.js';
