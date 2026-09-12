// Límite básico de intentos contra fuerza bruta y registro automatizado
// masivo (login y registro). Implementación en memoria (Map), sin agregar
// una dependencia nueva: alcanza para esta etapa, pero tiene limitaciones
// conocidas y documentadas (ver docs/backend-autenticacion.md) — no
// sobrevive un reinicio del proceso y no se comparte entre varias
// instancias del backend si se escalara horizontalmente.

// Clave por defecto: IP+email. Sola, esta clave tiene un punto ciego real
// (encontrado en una revisión): alguien que prueba muchos emails distintos
// desde la misma IP (fuerza bruta de credenciales contra cuentas ajenas, o
// alta masiva de cuentas) nunca acumula más de un intento por clave, así
// que jamás llega al máximo. `limitarIntentos` acepta una función
// `obtenerClave` para poder aplicar, además, un límite por IP sola (ver
// usuario.routes.js: se encadenan ambos, uno más laxo por IP y uno más
// estricto por IP+email).
const claveIpMasEmail = (req) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  return `${req.ip}:${email}`;
};

const claveSoloIp = (req) => req.ip;

// Corrección de una revisión posterior: la primera versión de este archivo
// usaba un único Map a nivel de módulo compartido por TODAS las instancias
// de limitarIntentos (login por IP, login por IP+email, registro por IP,
// registro por IP+email), namespacing las claves con un prefijo por ruta
// para que no se pisaran entre sí. Namespacear las claves no alcanzaba: la
// limpieza periódica (`limpiarVencidos`) de una instancia recorre el Map
// entero y filtra CADA entrada con SU PROPIA `ventanaMs`, sin importar de
// qué instancia era esa entrada — si login (ventana de 15 min) y registro
// (ventana de 60 min) compartían Map, una limpieza disparada por tráfico de
// login podía borrar intentos de registro todavía vigentes (más nuevos que
// 15 min, pero más viejos que 60), simplemente por usar el umbral
// equivocado. Ahora cada instancia recibe su propio Map, creado en su
// propio closure: no hay ningún estado compartido entre limitadores, así
// que la limpieza de uno nunca puede tocar las entradas de otro,
// sin importar cómo se llame la clave.
const limitarIntentos = ({ maximo, ventanaMs, obtenerClave = claveIpMasEmail }) => {
  const intentosPorClave = new Map();
  let contador = 0;

  const limpiarVencidos = () => {
    const ahora = Date.now();
    for (const [clave, marcas] of intentosPorClave) {
      const vigentes = marcas.filter((marca) => ahora - marca < ventanaMs);
      if (vigentes.length === 0) {
        intentosPorClave.delete(clave);
      } else {
        intentosPorClave.set(clave, vigentes);
      }
    }
  };

  return (req, res, next) => {
    contador += 1;
    if (contador % 200 === 0) {
      limpiarVencidos();
    }

    const clave = obtenerClave(req);
    const ahora = Date.now();

    const marcas = (intentosPorClave.get(clave) || []).filter(
      (marca) => ahora - marca < ventanaMs,
    );

    if (marcas.length >= maximo) {
      return res.status(429).json({
        error: 'Demasiados intentos. Esperá unos minutos antes de volver a intentar.',
      });
    }

    marcas.push(ahora);
    intentosPorClave.set(clave, marcas);

    return next();
  };
};

export default limitarIntentos;
export { claveSoloIp };
