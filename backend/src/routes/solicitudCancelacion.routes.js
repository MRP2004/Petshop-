import { Router } from 'express';
import { crear, aprobar, rechazar } from '../controllers/solicitudCancelacion.controller.js';
import { requiereAutenticacion, requiereRol } from '../middlewares/autenticacion.middleware.js';

const router = Router();

// Solicitar la cancelación de la propia compra (CU-04, corrección): el
// cliente ya no puede cancelar directamente (ver venta.routes.js#cancelar,
// ahora exclusiva de vendedor/administrador). idVenta viaja en el cuerpo,
// no en la URL: este es un recurso propio ("solicitudes de cancelación"),
// no anidado bajo /ventas.
router.post('/', requiereAutenticacion, requiereRol('cliente', 'vendedor_independiente'), crear);

// Resolver una solicitud: exclusivo del personal, tanto en la ruta como en
// el servicio (defensa en profundidad, mismo criterio que la cancelación
// directa).
router.patch('/:id/aprobar', requiereAutenticacion, requiereRol('vendedor', 'administrador'), aprobar);
router.patch('/:id/rechazar', requiereAutenticacion, requiereRol('vendedor', 'administrador'), rechazar);

export default router;
