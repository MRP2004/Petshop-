import 'dotenv/config';
import app from './app.js';
import sequelize from './config/database.js';
import './models/index.js';

const PORT = process.env.PORT || 3000;
const ENTORNO = process.env.ENTORNO || 'desarrollo';

// En entornos aislados, valida que la conexión use la base esperada antes
// de sincronizar los modelos. Desarrollo puede usar una base configurable.
const BASES_PERMITIDAS_POR_ENTORNO = {
  e2e: process.env.E2E_DB_NAME_PERMITIDA || 'petshop_e2e',
  test: process.env.INTEGRACION_DB_NAME_PERMITIDA || 'petshop_test',
  catalogo: 'petshop_catalogo_demo',
};

const startServer = async () => {
  try {
    await sequelize.authenticate();

    // Se valida la base efectiva antes de sincronizar los modelos para
    // evitar modificar por error una base distinta en entornos aislados.
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

    const servidor = app.listen(PORT, '0.0.0.0', () => {
      console.log(`API Petshop (${ENTORNO}) ejecutándose en http://localhost:${PORT}`);
    });

    // El error de puerto ocupado llega como evento asincrónico del servidor,
    // por eso se maneja explícitamente.
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
