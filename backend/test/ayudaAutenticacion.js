// Helper de pruebas (sin base de datos): genera tokens válidos reutilizando
// la misma función de firma que usa el backend real (usuario.service.js vía
// utils/token.js), para no duplicar la lógica de JWT en las pruebas. Los
// datos de usuario son ficticios; no representan cuentas reales.
import { firmarToken } from '../src/utils/token.js';

const tokenCliente = (idCliente = 1, idUsuario = 1001) =>
  firmarToken({ idUsuario, rol: 'cliente', idCliente });

const tokenVendedor = (idUsuario = 1002) =>
  firmarToken({ idUsuario, rol: 'vendedor', idCliente: null });

const tokenAdministrador = (idUsuario = 1003) =>
  firmarToken({ idUsuario, rol: 'administrador', idCliente: null });

const autorizacion = (token) => `Bearer ${token}`;

export { tokenCliente, tokenVendedor, tokenAdministrador, autorizacion };
