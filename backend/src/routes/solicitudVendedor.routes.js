import { Router } from 'express';
import { crear, listar, aprobar, rechazar } from '../controllers/solicitudVendedor.controller.js';
import { requiereAutenticacion, requiereRol } from '../middlewares/autenticacion.middleware.js';

const router = Router();

// "Quiero ser vendedor": solo una cuenta 'cliente' (nunca personal interno
// ni un vendedor independiente que ya tiene tienda — la validación real de
// "ya tiene una pendiente/ya tiene tienda" ocurre en el servicio).
router.post('/', requiereAutenticacion, requiereRol('cliente'), crear);
// Listar y resolver: exclusivo administrador (ver tienda.service.js — es
// una decisión de negocio de mayor alcance que resolver una cancelación,
// que sí puede cualquier personal interno).
router.get('/', requiereAutenticacion, requiereRol('administrador'), listar);
router.patch('/:id/aprobar', requiereAutenticacion, requiereRol('administrador'), aprobar);
router.patch('/:id/rechazar', requiereAutenticacion, requiereRol('administrador'), rechazar);

export default router;
