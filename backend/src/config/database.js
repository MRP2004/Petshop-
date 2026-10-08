import 'dotenv/config';
import { Sequelize } from 'sequelize';

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    dialect: 'mysql',
    logging: false,
    // UTC explícito (CU-04, corrección de una ronda anterior que quedó mal
    // diagnosticada — revisión independiente): acá se había puesto
    // `timezone: '-03:00'`, sobre la premisa de que el driver mysql2, sin
    // este valor, interpreta las columnas DATETIME según la zona horaria
    // LOCAL del proceso, distinta de la que asume Sequelize. Eso es
    // incorrecto: Sequelize SÍ transmite este `timezone` a mysql2 (lo usa
    // para las dos direcciones, escribir Y leer), así que ya era una única
    // convención coherente en un único lugar — el valor por defecto
    // '+00:00', el mismo que tenía este archivo antes de esa ronda.
    // Cambiarlo a '-03:00' sin convertir los datos ya guardados corría el
    // riesgo real de correr, para las MISMAS filas, con una convención
    // distinta a la que se usó para escribirlas — un desplazamiento de 3
    // horas al releer. Se revierte a UTC explícito (sin cambio de
    // comportamiento respecto al valor por defecto de siempre, ahora
    // simplemente explícito para que quede documentado acá) y se conserva
    // la conversión a hora de Argentina SOLO en la capa de presentación
    // (ver utils/formato.js, `timeZone: 'America/Argentina/Buenos_Aires'`
    // en cada `Intl.DateTimeFormat`, igual en frontend y en el PDF) — la
    // causa real de la diferencia reportada entre pantalla y PDF estaba
    // ahí (faltaba `hour12`/`timeZone` explícitos en esos formateadores,
    // no en esta conexión), y esa parte de la corrección se conserva.
    timezone: '+00:00',
  },
);

export default sequelize;