// Procedimiento de migración versionado e idempotente para la ronda de
// correcciones de CU-04 (ver docs/backend-base-de-datos.md, "Migración de
// esquema — CU-04, ronda 2"). A diferencia de la ronda anterior (que solo
// agregaba tablas NUEVAS, algo que sequelize.sync() ya resuelve solo), esta
// ronda ALTERA tablas que ya existen (`mediopago`, `comprobante`) — sync()
// nunca hace eso, así que hace falta este script.
//
// Tres cambios, cada uno comprobado ANTES de aplicarse (para poder correrse
// más de una vez sin romper nada si ya se aplicó, parcial o totalmente):
//   1. Índice único sobre mediopago.nombre (lo necesita el lock de
//      compra.service.js#resolverMedioPagoSimulado).
//   2. ENUM de comprobante.estadoCorreo, con sus valores nuevos (CU-04, §3),
//      migrando los 'enviado' existentes a 'simulado' (ver más abajo, "por
//      qué 'simulado' y no otra cosa").
//   3. Tres columnas nuevas en comprobante (instantánea histórica del
//      comprador, CU-04, §4).
//
// Exporta la función para que tanto el script que corre Mauro contra su
// base real como el script de verificación (contra una base descartable)
// ejecuten EXACTAMENTE la misma lógica.
const columnaExiste = async (sequelize, tabla, columna) => {
  const [filas] = await sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tabla AND COLUMN_NAME = :columna`,
    { replacements: { tabla, columna } },
  );
  return filas.length > 0;
};

const obtenerTipoColumna = async (sequelize, tabla, columna) => {
  const [filas] = await sequelize.query(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tabla AND COLUMN_NAME = :columna`,
    { replacements: { tabla, columna } },
  );
  return filas[0]?.COLUMN_TYPE || null;
};

// Comprueba que YA EXISTA algún índice único sobre la columna (revisión
// independiente, Codex, dos correcciones):
//   1. No alcanza con mirar solo NOMBRE de índice: si por algún motivo ya
//      existiera un índice NO único con ese mismo nombre (o sobre otra
//      columna), esto lo daría por válido sin aplicar la restricción real
//      que compra.service.js#resolverMedioPagoSimulado necesita.
//   2. Tampoco alcanza con buscar por un nombre FIJO ("ux_mediopago_nombre"):
//      una instalación NUEVA crea la tabla vía sequelize.sync() a partir
//      del modelo actual (que ya tiene `unique: true` en `nombre`, ver
//      medioPago.model.js) — Sequelize le pone su propio nombre
//      autogenerado a ESE índice, no el que usa este script. Buscar solo
//      por nombre fijo no encontraba ese índice ya existente y este script
//      terminaba agregando un segundo índice único redundante (no rompe
//      nada, pero no es idempotente de verdad). Por eso se busca CUALQUIER
//      índice único sobre la columna, sin importar su nombre.
// NON_UNIQUE = 0 es la forma en que INFORMATION_SCHEMA.STATISTICS marca un
// índice único (1 = no único).
const indiceUnicoExiste = async (sequelize, tabla, columna) => {
  const [filas] = await sequelize.query(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tabla
       AND NON_UNIQUE = 0 AND COLUMN_NAME = :columna`,
    { replacements: { tabla, columna } },
  );
  return filas.length > 0;
};

// --- Paso 1: índice único sobre mediopago.nombre ---
const migrarIndiceUnicoMedioPago = async (sequelize, log) => {
  const NOMBRE_INDICE = 'ux_mediopago_nombre';

  if (await indiceUnicoExiste(sequelize, 'mediopago', 'nombre')) {
    log('  mediopago.nombre: el índice único ya existe, nada que hacer.');
    return;
  }

  const [duplicados] = await sequelize.query(
    `SELECT nombre, COUNT(*) AS cantidad FROM mediopago GROUP BY nombre HAVING COUNT(*) > 1`,
  );

  if (duplicados.length > 0) {
    const lista = duplicados.map((f) => `"${f.nombre}" (${f.cantidad})`).join(', ');
    throw new Error(
      `No se puede crear el índice único sobre mediopago.nombre: hay nombres duplicados (${lista}). ` +
        'Resolvé manualmente cuál fila de cada nombre repetido conservar antes de reintentar esta migración.',
    );
  }

  await sequelize.query(`ALTER TABLE mediopago ADD UNIQUE INDEX ${NOMBRE_INDICE} (nombre)`);
  log('  mediopago.nombre: índice único creado.');
};

// --- Paso 2: ENUM de comprobante.estadoCorreo ---
const ENUM_FINAL =
  "enum('pendiente','simulado','no_configurado','aceptado','fallido','no_aplica')";

const migrarEstadoCorreo = async (sequelize, log) => {
  const tipoActual = await obtenerTipoColumna(sequelize, 'comprobante', 'estadoCorreo');

  if (tipoActual === ENUM_FINAL) {
    log('  comprobante.estadoCorreo: ya tiene el ENUM final, nada que hacer.');
    return;
  }

  // Se AMPLÍA el ENUM primero (superconjunto de valores viejos + nuevos):
  // angostar un ENUM de MySQL mientras todavía hay filas usando un valor
  // que se está por quitar puede convertir esas filas silenciosamente a la
  // cadena vacía (un gotcha conocido de MODIFY COLUMN ... ENUM). Ampliar
  // primero es siempre seguro: ningún valor existente deja de ser válido.
  await sequelize.query(
    `ALTER TABLE comprobante MODIFY estadoCorreo
     ENUM('pendiente','enviado','simulado','no_configurado','aceptado','fallido','no_aplica')
     NOT NULL DEFAULT 'pendiente'`,
  );

  // Por qué 'simulado' y no 'aceptado': en este proyecto nunca hubo
  // credenciales SMTP reales configuradas hasta ahora (ver
  // docs/cu04-checkout-pago.md) — todo 'enviado' previo es, con certeza,
  // un mensaje armado por el transporte de prueba (jsonTransport), nunca un
  // envío real aceptado por un servidor SMTP. Se documenta la premisa acá
  // porque no hay forma de derivarla de los datos mismos.
  const [resultado] = await sequelize.query(
    `UPDATE comprobante SET estadoCorreo = 'simulado' WHERE estadoCorreo = 'enviado'`,
  );
  log(`  comprobante.estadoCorreo: ${resultado.affectedRows ?? 0} fila(s) 'enviado' → 'simulado'.`);

  // Ahora sí, se angosta al ENUM final: ya no queda ninguna fila en
  // 'enviado', así que no hay riesgo de corromper datos.
  await sequelize.query(
    `ALTER TABLE comprobante MODIFY estadoCorreo ${ENUM_FINAL} NOT NULL DEFAULT 'pendiente'`,
  );
  log('  comprobante.estadoCorreo: ENUM actualizado al conjunto final de valores.');
};

// --- Paso 3: columnas nuevas de instantánea del comprador ---
const COLUMNAS_INSTANTANEA = [
  { nombre: 'nombreCompradorHistorico', definicion: 'VARCHAR(50) NULL' },
  { nombre: 'apellidoCompradorHistorico', definicion: 'VARCHAR(50) NULL' },
  { nombre: 'correoCompradorHistorico', definicion: 'VARCHAR(100) NULL' },
];

const migrarInstantaneaComprador = async (sequelize, log) => {
  for (const { nombre, definicion } of COLUMNAS_INSTANTANEA) {
    if (await columnaExiste(sequelize, 'comprobante', nombre)) {
      log(`  comprobante.${nombre}: ya existe, nada que hacer.`);
      continue;
    }
    await sequelize.query(`ALTER TABLE comprobante ADD COLUMN ${nombre} ${definicion}`);
    log(`  comprobante.${nombre}: columna agregada (NULL en filas existentes, a propósito — ` +
      'ver comprobante.model.js: no se reconstruye un dato histórico que nunca se guardó).');
  }
};

const aplicarMigracionCU04Ronda2 = async (sequelize, log = console.log) => {
  log('Paso 1/3: índice único sobre mediopago.nombre');
  await migrarIndiceUnicoMedioPago(sequelize, log);

  log('Paso 2/3: ENUM de comprobante.estadoCorreo');
  await migrarEstadoCorreo(sequelize, log);

  log('Paso 3/3: instantánea histórica del comprador en comprobante');
  await migrarInstantaneaComprador(sequelize, log);
};

export { aplicarMigracionCU04Ronda2, ENUM_FINAL };
