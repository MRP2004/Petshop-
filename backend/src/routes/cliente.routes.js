import { Router } from 'express';
import {
  listar,
  buscarPorId,
  crear,
  actualizar,
  eliminar,
} from '../controllers/cliente.controller.js';
import { obtener as obtenerDireccion, guardar as guardarDireccion } from '../controllers/direccionCliente.controller.js';
import {
  requiereAutenticacion,
  requiereRol,
  permitirPropioClienteOStaff,
} from '../middlewares/autenticacion.middleware.js';

const router = Router();

const soloPersonal = [requiereAutenticacion, requiereRol('vendedor', 'administrador')];
// Un cliente puede ver/editar su propio registro; el personal, cualquiera.
const propioOPersonal = [requiereAutenticacion, permitirPropioClienteOStaff];
// La dirección guardada es siempre "la propia" (nunca por :id ni por el
// cuerpo — reduce superficie de IDOR, ver revisión de Codex de esta
// etapa): tiene sentido para cualquier cuenta compradora ('cliente' y,
// desde la Etapa 8, 'vendedor_independiente' — sigue siendo comprador); el
// personal interno no tiene dirección de compra propia.
const soloPropioCliente = [requiereAutenticacion, requiereRol('cliente', 'vendedor_independiente')];

// Antes de '/:id' a propósito (mismo motivo que /stock-bajo en
// producto.routes.js): si no, Express interpretaría "direccion" como un
// :id y nunca llegaría a esta ruta.
router.get('/direccion', ...soloPropioCliente, obtenerDireccion);
router.put('/direccion', ...soloPropioCliente, guardarDireccion);

// El listado completo de clientes es información de gestión, no de
// autoservicio: solo personal. El alta pública de un cliente ocurre vía
// POST /api/usuarios/registro (crea Cliente + Usuario juntos), no acá.
router.get('/', ...soloPersonal, listar);
router.get('/:id', ...propioOPersonal, buscarPorId);
router.post('/', ...soloPersonal, crear);
router.put('/:id', ...propioOPersonal, actualizar);
router.delete('/:id', ...soloPersonal, eliminar);

export default router;
