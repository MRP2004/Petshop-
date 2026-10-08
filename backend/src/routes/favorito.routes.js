import { Router } from 'express';
import { listar, agregar, quitar } from '../controllers/favorito.controller.js';
import { requiereAutenticacion, requiereRol } from '../middlewares/autenticacion.middleware.js';

const router = Router();

// Siempre "los propios": cuentas compradoras ('cliente' y, desde la Etapa
// 8, 'vendedor_independiente' — sigue siendo comprador, ver
// usuario.model.js); el personal interno no tiene favoritos de compra.
// idCliente siempre de la sesión — nunca por :id ni por el cuerpo (mismo
// criterio que /api/clientes/direccion, reduce superficie de IDOR).
const soloPropioCliente = [requiereAutenticacion, requiereRol('cliente', 'vendedor_independiente')];

router.get('/', ...soloPropioCliente, listar);
router.post('/', ...soloPropioCliente, agregar);
router.delete('/:idProducto', ...soloPropioCliente, quitar);

export default router;
