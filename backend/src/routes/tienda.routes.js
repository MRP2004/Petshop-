import { Router } from 'express';
import { obtenerPropia, listar, cambiarEstado, misProductos, misVentas, miVentaPorId } from '../controllers/tienda.controller.js';
import { requiereAutenticacion, requiereRol } from '../middlewares/autenticacion.middleware.js';

const router = Router();

// "Mi tienda" / "mis productos" / "mis ventas": siempre la del vendedor de
// la sesión (usuario.idTienda del JWT), nunca por :id ni por el cuerpo —
// mismo criterio de "propio, nunca por parámetro" que favoritos/dirección.
router.get('/propia', requiereAutenticacion, requiereRol('vendedor_independiente'), obtenerPropia);
router.get('/propia/productos', requiereAutenticacion, requiereRol('vendedor_independiente'), misProductos);
router.get('/propia/ventas', requiereAutenticacion, requiereRol('vendedor_independiente'), misVentas);
router.get('/propia/ventas/:id', requiereAutenticacion, requiereRol('vendedor_independiente'), miVentaPorId);

// Administración de tiendas (suspender/reactivar): exclusivo administrador
// — hace que `tienda.estado` sea un campo real, no decorativo (ver
// tienda.service.js/producto.service.js).
router.get('/', requiereAutenticacion, requiereRol('administrador'), listar);
router.patch('/:id/estado', requiereAutenticacion, requiereRol('administrador'), cambiarEstado);

export default router;
