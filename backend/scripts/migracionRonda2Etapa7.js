// Procedimiento de migración versionado e idempotente para la Etapa 7 de
// la ronda 2 ("estados de pedido: retiro vs. envío" — ver
// docs/estado-proyecto.md). Diseño de esquema revisado con Codex ANTES de
// escribir este archivo (ver EVIDENCIA-codex-etapa7-diseno-revision.txt en
// el ZIP de entrega de esta etapa).
//
// Único cambio: AMPLIAR (nunca angostar) el ENUM `venta.estado` de 3 a 5
// valores. Es 100% aditivo — a diferencia de
// `migracionCU04Ronda2.js#migrarEstadoCorreo` (que sí necesitó un UPDATE
// para resolver una ambigüedad de datos), acá no hace falta reescribir
// ninguna fila: toda venta que hoy tiene `estado='enviada'` (bajo la
// semántica vieja, sin importar si en los hechos era retiro o envío) sigue
// literalmente en `'enviada'` para siempre. Solo las transiciones NUEVAS,
// a partir de que se aplique esta migración, usan la semántica corregida
// (ver venta.service.js#marcarVentaComoEnviada/marcarVentaComoEntregada).
import { asegurarQueAmplia } from './utilMigracion.js';

const ENUM_FINAL =
  "enum('registrada','cancelada','enviada','lista_para_retirar','entregada')";

const obtenerTipoColumna = async (sequelize, tabla, columna) => {
  const [filas] = await sequelize.query(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tabla AND COLUMN_NAME = :columna`,
    { replacements: { tabla, columna } },
  );
  return filas[0]?.COLUMN_TYPE || null;
};

const migrarEstadoVenta = async (sequelize, log) => {
  const tipoActual = await obtenerTipoColumna(sequelize, 'venta', 'estado');

  if (tipoActual === ENUM_FINAL) {
    log('  venta.estado: ya tiene el ENUM final, nada que hacer.');
    return;
  }

  asegurarQueAmplia('venta', 'estado', tipoActual, ENUM_FINAL);

  // Preserva NOT NULL y el DEFAULT 'registrada' ya existentes (revisión de
  // Codex): un ALTER que los omitiera dejaría la columna nullable o sin
  // default, un cambio de esquema real que nadie pidió.
  await sequelize.query(`ALTER TABLE venta MODIFY estado ${ENUM_FINAL} NOT NULL DEFAULT 'registrada'`);
  log('  venta.estado: ENUM ampliado a 5 valores (sin tocar ninguna fila existente).');
};

const aplicarMigracionRonda2Etapa7 = async (sequelize, log = console.log) => {
  log('Paso único: ampliar el ENUM de venta.estado');
  await migrarEstadoVenta(sequelize, log);
};

export { aplicarMigracionRonda2Etapa7, ENUM_FINAL };
