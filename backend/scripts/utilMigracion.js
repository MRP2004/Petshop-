// Utilidades compartidas por los scripts de migración manual.

// "enum('a','b')" → ['a', 'b']. Los valores de este proyecto nunca llevan
// comillas ni comas internas, así que no hace falta un parser completo.
const valoresEnum = (tipoColumna) => {
  const coincidencia = /^enum\((.*)\)$/i.exec(tipoColumna || '');
  if (!coincidencia) return null;
  return coincidencia[1].split(',').map((valor) => valor.trim().replace(/^'|'$/g, ''));
};

// Antes de un ALTER ... MODIFY que AMPLÍA un ENUM (Etapa 9, revisión de
// Codex): si la columna actual tiene algún valor que el ENUM final no
// incluye, MySQL convertiría esas filas en '' en silencio. En ese caso se
// aborta sin tocar nada, en vez de "ampliar" a ciegas.
const asegurarQueAmplia = (tabla, columna, tipoActual, tipoFinal) => {
  const actuales = valoresEnum(tipoActual);
  const finales = valoresEnum(tipoFinal);

  if (!actuales) {
    throw new Error(`${tabla}.${columna} no es un ENUM (tipo actual: ${tipoActual ?? 'columna inexistente'}). No se modifica nada.`);
  }

  const faltantes = actuales.filter((valor) => !finales.includes(valor));
  if (faltantes.length > 0) {
    throw new Error(
      `${tabla}.${columna} tiene valores que el ENUM final no incluye (${faltantes.join(', ')}). ` +
        'Aplicar el cambio podría vaciar esas filas: no se modifica nada.',
    );
  }
};

// Mensaje honesto ante un fallo (Etapa 9, hallazgo de Codex): cada ALTER
// TABLE de MySQL hace commit implícito, así que un paso anterior (o parte
// del paso que falló) puede haber quedado aplicado. Los scripts son
// idempotentes: se inspecciona el esquema, se corrige la causa y se vuelve a
// correr con --confirmar; los pasos ya hechos se saltean solos.
const informarFalloMigracion = (error, { script, consultasInspeccion }) => {
  console.error('\nLa migración FALLÓ. Puede haber quedado aplicada PARCIALMENTE:');
  console.error('los ALTER TABLE de MySQL hacen commit implícito y no se revierten.');
  console.error(`\nError: ${error.message}`);
  console.error('\nRevisá el estado real del esquema con estas consultas (solo lectura):');
  for (const consulta of consultasInspeccion) console.error(`  ${consulta}`);
  console.error('\nCorregí la causa del error y volvé a correr el script (es idempotente:');
  console.error('los pasos ya aplicados se detectan y se saltean):');
  console.error(`  node scripts/${script} --confirmar`);
  console.error('Si algo quedó en un estado inesperado, restaurá el respaldo previo');
  console.error('(ver docs/actualizacion-base-existente.md).');
};

export { valoresEnum, asegurarQueAmplia, informarFalloMigracion };
