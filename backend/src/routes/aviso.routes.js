import { Router } from 'express';
import { listar, marcarUnoLeido, marcarTodosLeidos } from '../controllers/aviso.controller.js';
import { requiereAutenticacion } from '../middlewares/autenticacion.middleware.js';

const router = Router();

// Cualquier rol autenticado tiene sus propios avisos (clientes: compras y
// solicitudes propias; personal: solicitudes nuevas) — nunca por :id ni por
// el cuerpo, siempre req.usuario.idUsuario de la sesión.
router.get('/', requiereAutenticacion, listar);
router.post('/:idAviso/leido', requiereAutenticacion, marcarUnoLeido);
router.post('/leidos', requiereAutenticacion, marcarTodosLeidos);

export default router;
