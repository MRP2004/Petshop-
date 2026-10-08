import { Router } from 'express';
import {
  listar,
  listarCatalogo,
  listarMarcas,
  sugerencias,
  listarStockBajo,
  buscarPorId,
  crear,
  actualizar,
  eliminar,
  ajustarStock,
} from '../controllers/producto.controller.js';
import { requiereAutenticacion, requiereRol } from '../middlewares/autenticacion.middleware.js';

const router = Router();

const soloPersonal = [requiereAutenticacion, requiereRol('vendedor', 'administrador')];
// Ronda 2, Etapa 8 (marketplace): las escrituras también admiten a un
// vendedor independiente — la autorización REAL (que solo pueda tocar los
// productos de SU PROPIA tienda, nunca los de PetShop ni los de otra
// tienda) ocurre en el servicio, no acá (ver
// producto.service.js#verificarPropietarioProducto). Dejarlo pasar la
// ruta sin esa verificación posterior sería autorización real "solo en el
// cliente" — lo que este mismo archivo ya advierte que no alcanza.
const soloPersonalOTiendaPropia = [
  requiereAutenticacion,
  requiereRol('vendedor', 'administrador', 'vendedor_independiente'),
];

// Catálogo de lectura: público, como en cualquier tienda (Chewy incluido) se
// puede navegar sin haber iniciado sesión.
router.get('/', listar);
router.get('/catalogo', listarCatalogo);
router.get('/marcas', listarMarcas);
// Antes de '/:id' a propósito (mismo motivo que /stock-bajo): si no, Express
// interpretaría "sugerencias"/"stock-bajo" como un :id y nunca llegaría acá.
// Buscador predictivo del encabezado (ronda 2): también público, igual que
// el listado general — son las mismas reglas de visibilidad de catálogo.
router.get('/sugerencias', sugerencias);
// Stock bajo también lo puede ver un vendedor independiente (filtrado a su
// propia tienda por el servicio, ver producto.service.js).
router.get('/stock-bajo', ...soloPersonalOTiendaPropia, listarStockBajo);
router.get('/:id', buscarPorId);

router.post('/', ...soloPersonalOTiendaPropia, crear);
router.put('/:id', ...soloPersonalOTiendaPropia, actualizar);
router.delete('/:id', ...soloPersonalOTiendaPropia, eliminar);
// Único endpoint habilitado para modificar el stock de un producto existente
// (el PUT general lo rechaza explícitamente). Ver docs/backend-api.md.
router.patch('/:id/stock', ...soloPersonalOTiendaPropia, ajustarStock);

export default router;
