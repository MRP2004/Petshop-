import { solicitar } from './httpClient.js';

// Dirección argentina estructurada (ronda 2): provincias son un catálogo
// estático (24, cacheadas por el propio backend); localidades se piden por
// provincia y se cachean en memoria del lado del backend — acá no hace
// falta ningún debounce ni cache propia, cada provincia se pide una sola
// vez por sesión de formulario (ver DireccionForm.jsx).
const obtenerProvincias = () => solicitar('/georef/provincias');

const obtenerLocalidades = (idProvincia) =>
  solicitar(`/georef/localidades?idProvincia=${encodeURIComponent(idProvincia)}`);

export default { obtenerProvincias, obtenerLocalidades };
