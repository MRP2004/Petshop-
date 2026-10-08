import crearServicioCrud from './crudGenerico.js';
import { solicitar } from './httpClient.js';

const servicioCrud = crearServicioCrud('/promociones');
const listarGestion = () => solicitar('/promociones/gestion');

export default {
  ...servicioCrud,
  administracion: { ...servicioCrud, listar: listarGestion },
};
