import 'dotenv/config';
import { Sequelize } from 'sequelize';

// En produccion exigimos el certificado SSL de Aiven.
const esProduccion = process.env.NODE_ENV === 'production';

if (esProduccion && !process.env.DB_SSL_CA) {
  throw new Error(
    'Falta configurar DB_SSL_CA para establecer la conexion segura con Aiven.'
  );
}

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    dialect: 'mysql',
    logging: false,
    timezone: '+00:00',

    ...(process.env.DB_SSL_CA && {
      dialectOptions: {
        ssl: {
          ca: process.env.DB_SSL_CA,
          rejectUnauthorized: true,
        },
      },
    }),
  }
);

export default sequelize;