import 'dotenv/config';
import app from './app.js';
import sequelize from './config/database.js';
import './models/index.js';

const PORT = process.env.PORT || 3000;
const ENTORNO = process.env.ENTORNO || 'desarrollo';

// Corrección (revisión independiente): para los entornos aislados, el
// nombre de base esperado es fijo y conocido (mismos valores por defecto
// que scripts/sembrarDatosE2E.js y test-integracion/ayudaIntegracion.js).
// "desarrollo" queda afuera a propósito: esa es la base habitual
// (petshop_db) y no tiene un nombre fijo que validar acá.
const BASES_PERMITIDAS_POR_ENTORNO = {
  e2e: process.env.E2E_DB_NAME_PERMITIDA || 'petshop_e2e',
  test: process.env.INTEGRACION_DB_NAME_PERMITIDA || 'petshop_test',
  catalogo: 'petshop_catalogo_demo',
};

const startServer = async () => {
  try {
    await sequelize.authenticate();

    // Antes, esto se consultaba DESPUÉS de sync() — solo informativo, pero
    // sync() ya podía haber alterado el esquema de lo que fuera que DB_NAME
    // resolviera, sin ninguna verificación previa. Ahora se consulta ANTES,
    // y para ENTORNO=e2e/test se aborta acá mismo si la base EFECTIVA no es
    // la esperada, sin llegar a sincronizar nada.
    const [[info]] = await sequelize.query(
      'SELECT DATABASE() AS baseEfectiva, CURRENT_USER() AS usuarioEfectivo',
    );

    const nombrePermitido = BASES_PERMITIDAS_POR_ENTORNO[ENTORNO];
    if (nombrePermitido && info.baseEfectiva !== nombrePermitido) {
      throw new Error(
        `ENTORNO="${ENTORNO}" pero la conexión real está usando la base ` +
          `"${info.baseEfectiva}", distinta de "${nombrePermitido}". Abortando ` +
          'antes de sincronizar el esquema (sync()) — revisá DB_NAME en el ' +
          '.env cargado.',
      );
    }

    console.log(`Entorno: ${ENTORNO}`);
    console.log(`Base de datos efectiva: ${info.baseEfectiva}`);
    console.log(`Usuario de conexión efectivo: ${info.usuarioEfectivo}`);

    await sequelize.sync();
    console.log('Modelos sincronizados con la base de datos');

    const servidor = app.listen(PORT, () => {
      console.log(`API Petshop (${ENTORNO}) ejecutándose en http://localhost:${PORT}`);
    });

    // Corrección de una revisión posterior: si el puerto ya está en uso,
    // Express/Node no lanzan una excepción que el try/catch de arriba
    // pudiera atrapar (el error llega de forma asincrónica, como evento
    // 'error' del servidor HTTP) — sin este manejo explícito, el proceso
    // seguía "vivo" sin haber arrancado nada, sin avisar. Ahora aborta con
    // un mensaje claro en vez de quedar en un estado ambiguo o de terminar
    // usando otra instancia en silencio (que es justamente lo que no debe
    // pasar entre desarrollo/E2E/integración: cada una tiene su puerto
    // fijo, ver .env.e2e.example).
    servidor.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(
          `El puerto ${PORT} ya está en uso. Abortando: esta instancia (${ENTORNO}) ` +
            'no arranca en otro puerto en silencio. Liberá el puerto o revisá si ya ' +
            'hay una instancia corriendo antes de reintentar.',
        );
        process.exit(1);
      }
      console.error('Error inesperado del servidor HTTP:', error.message);
      process.exit(1);
    });
  } catch (error) {
    console.error('No se pudo iniciar el servidor:', error.message);
    process.exit(1);
  }
};

startServer();
