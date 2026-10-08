import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AppError from '../errors/AppError.js';

// Dirección argentina estructurada (ronda 2, ver docs/frontend-diseno.md):
// las 24 provincias son prácticamente estáticas, así que se embeben acá
// como JSON versionado (bajado UNA vez de la API real de Georef —
// https://apis.datos.gob.ar/georef/api/provincias — no inventado), en vez
// de pedirlas cada vez.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROVINCIAS = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/georefProvincias.json'), 'utf-8'),
);
const PROVINCIAS_POR_ID = new Map(PROVINCIAS.map((provincia) => [provincia.id, provincia]));

// Se usa explícitamente el recurso /localidades (BAHRA, localidades
// "pobladas" reales — pensado para direcciones postales) y NO
// /localidades-censales (unidades administrativas censales): decisión
// escrita a propósito (revisión de Codex de esta etapa) para que
// frontend/backend/datos guardados usen siempre el mismo catálogo de ids.
const URL_BASE_GEOREF = 'https://apis.datos.gob.ar/georef/api';
const TIMEOUT_MS = 5000;
// 7 días: es un catálogo geográfico, prácticamente no cambia nunca. Cache
// en memoria (no en la base, ver revisión de Codex): se pierde si el
// backend se reinicia, y está bien — recalentar cuesta un solo pedido a
// Georef por provincia.
const TTL_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

// idProvincia -> { localidades: [{id, nombre}], expiraEn }
const cacheLocalidades = new Map();
// idProvincia -> Promise en vuelo (deduplica pedidos concurrentes a la
// misma provincia sin cache — ver el hallazgo real de Codex más abajo).
const pedidosEnVuelo = new Map();

const obtenerProvincias = () => PROVINCIAS;

const esProvinciaValida = (idProvincia) => PROVINCIAS_POR_ID.has(idProvincia);

// Valida la FORMA de lo que devuelve Georef antes de confiar en ella
// (hallazgo real de la revisión de Codex de esta etapa: una respuesta 200
// con `localidades` que no sea un arreglo, o con algún elemento sin
// `id`/`nombre` reales, podía guardarse tal cual y terminar persistiendo
// una `localidad: ''` en direccioncliente). Un `localidades` que no es
// arreglo se trata como fallo (dispara el mismo fallback a cache
// vieja/503 que un error de red); un elemento individual con forma
// inválida simplemente se descarta, no invalida el resto de la lista.
const normalizarLocalidades = (datos) => {
  if (!Array.isArray(datos?.localidades)) {
    throw new Error('Georef devolvió un formato inesperado (localidades no es un arreglo)');
  }

  return datos.localidades
    .filter(
      (localidad) =>
        typeof localidad?.id === 'string' &&
        localidad.id.trim() !== '' &&
        typeof localidad?.nombre === 'string' &&
        localidad.nombre.trim() !== '',
    )
    .map((localidad) => ({ id: localidad.id, nombre: localidad.nombre }));
};

const pedirLocalidadesAGeoref = async (idProvincia) => {
  const controlador = new AbortController();
  const idTimeout = setTimeout(() => controlador.abort(), TIMEOUT_MS);

  try {
    const respuesta = await fetch(
      `${URL_BASE_GEOREF}/localidades?provincia=${encodeURIComponent(idProvincia)}` +
        '&campos=id,nombre&max=5000&orden=nombre',
      { signal: controlador.signal },
    );

    if (!respuesta.ok) {
      throw new Error(`Georef respondió ${respuesta.status}`);
    }

    const datos = await respuesta.json();
    return normalizarLocalidades(datos);
  } finally {
    clearTimeout(idTimeout);
  }
};

// Devuelve la lista COMPLETA de localidades de una provincia (no un
// resultado filtrado por nombre): el filtro `nombre` de la API real de
// Georef no hace prefijo (probado contra la API real: "R"/"Ros" no
// encuentran "Rosario" en Santa Fe, recién con "Rosari" aparece) — así que
// el prefijo "empieza con" lo resuelve quien llama (ver
// direccionCliente.service.js y el frontend), sobre esta lista ya
// cacheada, no Georef.
const obtenerLocalidades = async (idProvincia) => {
  if (!esProvinciaValida(idProvincia)) {
    throw new AppError('La provincia indicada no existe', 400);
  }

  const cacheada = cacheLocalidades.get(idProvincia);

  if (cacheada && cacheada.expiraEn > Date.now()) {
    return cacheada.localidades;
  }

  // Deduplica pedidos concurrentes a la misma provincia sin cache vigente:
  // sin esto, dos pedidos que llegan casi juntos disparaban dos fetches
  // reales a Georef, y si uno tenía éxito (dejando cache fresca) mientras
  // el otro fallaba, el que falló igual respondía 503 aunque ya hubiera
  // cache recién cargada por el primero (hallazgo real de la revisión de
  // Codex de esta etapa). Ahora todos esperan la MISMA promesa.
  let pedido = pedidosEnVuelo.get(idProvincia);

  if (!pedido) {
    pedido = pedirLocalidadesAGeoref(idProvincia)
      .then((localidades) => {
        cacheLocalidades.set(idProvincia, { localidades, expiraEn: Date.now() + TTL_CACHE_MS });
        return localidades;
      })
      .finally(() => {
        pedidosEnVuelo.delete(idProvincia);
      });

    pedidosEnVuelo.set(idProvincia, pedido);
  }

  try {
    return await pedido;
  } catch (error) {
    // Se relee el Map (no la variable `cacheada` de antes del await): un
    // pedido concurrente pudo haber completado con éxito mientras este
    // esperaba, o puede quedar una entrada vieja (vencida) igual de válida
    // como respaldo — mejor una lista vieja que ninguna. El
    // registro/checkout no debe quedar impredecible por una caída externa.
    const cacheAlFallar = cacheLocalidades.get(idProvincia);

    if (cacheAlFallar) {
      return cacheAlFallar.localidades;
    }

    throw new AppError(
      'No se pudo cargar la lista de localidades. Intentá de nuevo en unos minutos.',
      503,
    );
  }
};

// Coherencia provincia-localidad POR ID (no solo por nombre, pedido
// explícito): busca en el catálogo real cacheado, no confía en lo que
// mande el cliente. Devuelve la localidad encontrada (con su nombre real)
// o null.
const buscarLocalidadEnProvincia = async (idLocalidad, idProvincia) => {
  const localidades = await obtenerLocalidades(idProvincia);
  return localidades.find((localidad) => localidad.id === idLocalidad) || null;
};

const obtenerNombreProvincia = (idProvincia) => PROVINCIAS_POR_ID.get(idProvincia)?.nombre || null;

export {
  obtenerProvincias,
  esProvinciaValida,
  obtenerNombreProvincia,
  obtenerLocalidades,
  buscarLocalidadEnProvincia,
};
