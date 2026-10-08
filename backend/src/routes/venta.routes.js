import { Router } from 'express';
import {
  listar,
  buscarPorId,
  registrar,
  cotizar,
  cancelar,
  marcarComoEnviada,
  marcarComoEntregada,
} from '../controllers/venta.controller.js';
import { descargarPdf, reenviarCorreo } from '../controllers/comprobante.controller.js';
import { requiereAutenticacion, requiereRol } from '../middlewares/autenticacion.middleware.js';
import limitarIntentos from '../middlewares/limiteIntentos.middleware.js';

const router = Router();

// Reenviar el correo del comprobante es una acción del dueño de la venta
// (o del personal), no del checkout en sí: un límite propio, por
// usuario+venta, evita que se use para mandar correos en bucle sin afectar
// los límites de login/registro (que son instancias separadas, ver
// middlewares/limiteIntentos.middleware.js).
const limiteReenvioCorreo = limitarIntentos({
  maximo: 5,
  ventanaMs: 60 * 60 * 1000,
  obtenerClave: (req) => `${req.usuario?.idUsuario}:${req.params.id}`,
});

// Todas las rutas de venta requieren sesión: un cliente ve/gestiona las
// suyas, el personal ve/gestiona cualquiera (la distinción exacta ocurre en
// venta.service.js, comparando contra req.usuario). No hay compra ni
// consulta de ventas sin haber iniciado sesión.
router.get('/', requiereAutenticacion, listar);
router.get('/:id', requiereAutenticacion, buscarPorId);
router.post(
  '/cotizacion',
  requiereAutenticacion,
  requiereRol('vendedor', 'administrador'),
  cotizar,
);
// Corrección (revisión de Codex sobre el diff de CU-04): antes un cliente
// autenticado podía llamar esta ruta directamente para registrarse su
// propia compra, salteando por completo el checkout con pago simulado
// (POST /api/compras) — sin cotización server-side, sin idempotencia, sin
// comprobante. Ahora es exclusiva del personal, igual que "marcar como
// enviada" más abajo: es la carga MANUAL de una venta para un cliente
// elegido, no el autoservicio de un cliente. registrarVenta conserva de
// todas formas su lógica interna para `usuario.rol === 'cliente'` (defensa
// en profundidad, ver venta.service.js), aunque ya no sea alcanzable desde
// esta ruta.
router.post('/', requiereAutenticacion, requiereRol('vendedor', 'administrador'), registrar);
// Cancelación DIRECTA: exclusiva del personal (CU-04, corrección — revisión
// de Mauro sobre la venta #20: "el cliente ya no puede ejecutar una
// cancelación directa"). Un cliente que quiere cancelar su propia compra
// usa POST /api/solicitudes-cancelacion en su lugar (ver
// solicitudCancelacion.routes.js) — el personal aprueba o rechaza esa
// solicitud, reutilizando esta misma cancelación transaccional.
router.patch(
  '/:id/cancelar',
  requiereAutenticacion,
  requiereRol('vendedor', 'administrador'),
  cancelar,
);
// Marcar como enviada es una operación operativa interna, no algo que un
// cliente hace sobre su propia compra.
router.patch(
  '/:id/enviar',
  requiereAutenticacion,
  requiereRol('vendedor', 'administrador'),
  marcarComoEnviada,
);
// Confirma la entrega/retiro efectivo (Etapa 7, nueva): misma restricción
// de rol que el resto de las transiciones operativas de esta fila.
router.patch(
  '/:id/entregar',
  requiereAutenticacion,
  requiereRol('vendedor', 'administrador'),
  marcarComoEntregada,
);

// Comprobante (CU-04): PDF y reenvío de correo, protegidos por la misma
// regla de "propia o personal" que ver una venta (ver
// comprobante.controller.js — la aplica obtenerVentaPorId, no esta ruta).
router.get('/:id/comprobante/pdf', requiereAutenticacion, descargarPdf);
router.post(
  '/:id/comprobante/reenviar-correo',
  requiereAutenticacion,
  limiteReenvioCorreo,
  reenviarCorreo,
);

export default router;
