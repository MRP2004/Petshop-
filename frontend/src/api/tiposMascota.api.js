import crearServicioCrud from './crudGenerico.js';
import { solicitar } from './httpClient.js';

export default {
  ...crearServicioCrud('/tipos-mascota'),
  jerarquia: () => solicitar('/tipos-mascota/jerarquia'),
};
