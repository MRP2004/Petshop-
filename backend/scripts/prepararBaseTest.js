// Crea (si todavía no existe) una base de datos EXCLUSIVA de pruebas, y un
// usuario EXCLUSIVO para esa base (no reutiliza petshop_app, que en
// desarrollo puede tener acceso a datos reales). Sirve tanto para la base de
// pruebas de integración (petshop_test) como para una base aislada de
// pruebas E2E (petshop_e2e, ver docs/frontend-pruebas.md, "Aislamiento para
// E2E"): es el mismo mecanismo, solo cambian los valores de las variables de
// entorno. Nunca imprime contraseñas: solo nombres (que no son secretos) y,
// ante un error, el código de error de MySQL.
//
// Requiere ejecutarse con credenciales que tengan privilegio de
// administración (CREATE DATABASE, CREATE USER, GRANT). Las credenciales de
// la aplicación (petshop_app) normalmente NO alcanzan: si falta un usuario
// administrador, este script lo informa con precisión (ver docs/backend-base-de-datos.md
// para las instrucciones manuales, incluida una variante para PowerShell).
//
// Uso para integración (variables de entorno, nunca hardcodeadas):
//   DB_HOST=localhost DB_PORT=3306 \
//   DB_ADMIN_USER=root DB_ADMIN_PASSWORD=... \
//   DB_TEST_NAME=petshop_test \
//   DB_TEST_USER=petshop_test_app DB_TEST_PASSWORD=... \
//   node scripts/prepararBaseTest.js
//
// Uso para E2E (misma base de código, otra base/usuario):
//   DB_HOST=localhost DB_PORT=3306 \
//   DB_ADMIN_USER=root DB_ADMIN_PASSWORD=... \
//   DB_TEST_NAME=petshop_e2e \
//   DB_TEST_USER=petshop_e2e_app DB_TEST_PASSWORD=... \
//   node scripts/prepararBaseTest.js

import 'dotenv/config';
import mysql from 'mysql2/promise';

// dotenv solo aporta DB_HOST/DB_PORT si ya están en .env; no sobrescribe
// nada ya definido. Las credenciales de administración y las del usuario
// de pruebas se piden siempre explícitas, nunca se toman del .env de
// desarrollo (ese .env no tiene ni debe tener credenciales de admin).
const nombreBase = process.env.DB_TEST_NAME;
const usuarioTest = process.env.DB_TEST_USER;
const passwordTest = process.env.DB_TEST_PASSWORD;

// Identificador válido para interpolar en SQL: letras, números y guion
// bajo, sin empezar con número. Se exige explícitamente que contenga "test"
// o "e2e" además de ser un identificador válido, como resguardo adicional
// para no operar por error sobre la base habitual (ninguna de las dos
// palabras debería aparecer nunca en el nombre de una base de producción).
const esIdentificadorDePruebaValido = (nombre) =>
  typeof nombre === 'string' &&
  /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(nombre) &&
  /test|e2e/i.test(nombre);

if (!esIdentificadorDePruebaValido(nombreBase)) {
  console.error(
    'DB_TEST_NAME debe ser un identificador válido que contenga "test" o ' +
      `"e2e" (por ejemplo, petshop_test o petshop_e2e). Valor recibido: ${nombreBase || '(vacío)'}. ` +
      'Abortando sin tocar nada.',
  );
  process.exit(1);
}

if (!usuarioTest || !/^[A-Za-z_][A-Za-z0-9_]{0,31}$/.test(usuarioTest)) {
  console.error(
    'DB_TEST_USER debe ser un nombre de usuario válido (letras, números, ' +
      `guion bajo). Valor recibido: ${usuarioTest || '(vacío)'}. Abortando.`,
  );
  process.exit(1);
}

if (!passwordTest) {
  console.error(
    'DB_TEST_PASSWORD no puede estar vacío: definí una contraseña propia ' +
      'para el usuario de pruebas (no se genera ni se sugiere una acá).',
  );
  process.exit(1);
}

const preparar = async () => {
  const conexion = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_ADMIN_USER,
    password: process.env.DB_ADMIN_PASSWORD,
  });

  try {
    // Los identificadores ya se validaron arriba con una expresión regular
    // estricta antes de llegar acá: no se interpola nada sin validar.
    await conexion.query(
      `CREATE DATABASE IF NOT EXISTS \`${nombreBase}\` ` +
        'CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci',
    );

    // La contraseña SÍ se parametriza (placeholder ?), nunca se concatena.
    await conexion.query(
      `CREATE USER IF NOT EXISTS \`${usuarioTest}\`@'localhost' IDENTIFIED BY ?`,
      [passwordTest],
    );

    await conexion.query(
      `GRANT ALL PRIVILEGES ON \`${nombreBase}\`.* TO \`${usuarioTest}\`@'localhost'`,
    );

    // Necesario para que las pruebas de concurrencia puedan confirmar
    // contención real de bloqueos (ver esperarContencionSobre en
    // test-integracion/ayudaIntegracion.js), sin requerir privilegios de
    // administración más amplios.
    await conexion.query(
      `GRANT SELECT ON performance_schema.* TO \`${usuarioTest}\`@'localhost'`,
    );

    await conexion.query('FLUSH PRIVILEGES');

    console.log(
      `Base "${nombreBase}" y usuario "${usuarioTest}"@localhost listos.`,
    );
  } finally {
    await conexion.end();
  }
};

preparar().catch((error) => {
  console.error(
    'No se pudo preparar la base/usuario de pruebas. Código:',
    error.code || error.message,
  );
  console.error(
    'Esto requiere credenciales de administración (DB_ADMIN_USER/' +
      'DB_ADMIN_PASSWORD) con privilegio CREATE DATABASE/CREATE USER/GRANT. ' +
      'Ver docs/backend-base-de-datos.md para instrucciones manuales.',
  );
  process.exit(1);
});
