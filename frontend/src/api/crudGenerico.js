import { solicitar } from './httpClient.js';

// Las cinco operaciones de un CRUD simple (categoría, tipo de mascota, medio
// de pago, proveedor, cliente) son idénticas salvo la ruta: se genera acá una
// sola vez en vez de repetir el mismo listar/obtener/crear/actualizar/eliminar
// en cada módulo de src/api/.
const crearServicioCrud = (rutaBase) => ({
  listar: (query = '') => solicitar(`${rutaBase}${query}`),
  obtener: (id) => solicitar(`${rutaBase}/${id}`),
  crear: (datos) => solicitar(rutaBase, { metodo: 'POST', cuerpo: datos }),
  actualizar: (id, datos) => solicitar(`${rutaBase}/${id}`, { metodo: 'PUT', cuerpo: datos }),
  eliminar: (id) => solicitar(`${rutaBase}/${id}`, { metodo: 'DELETE' }),
});

export default crearServicioCrud;
