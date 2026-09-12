Base de datos

El esquema no se versiona como scripts SQL en este directorio: se genera
desde los modelos de Sequelize (`backend/src/models/`) al arrancar el
backend (`sequelize.sync()`, sin `force` ni `alter`).

Ver [docs/backend-base-de-datos.md](../docs/backend-base-de-datos.md) para
el mecanismo completo de creación y evolución del esquema, cómo preparar
una base de pruebas aislada, y el esquema efectivo verificado (incluye
hallazgos sobre claves foráneas).

La tabla `promocionproducto`, antes huérfana (sin código), ahora tiene
modelo/servicio/rutas (`PromocionProducto`, ver
[docs/backend-api.md](../docs/backend-api.md) y
[docs/estado-proyecto.md](../docs/estado-proyecto.md)) — se reutilizó tal
cual estaba, sin cambiarle la forma. Esta etapa también agregó una tabla
nueva, `usuario` (autenticación, ver
[docs/backend-autenticacion.md](../docs/backend-autenticacion.md)), creada
por el mismo mecanismo de `sync()` no destructivo.

`backend/scripts/sembrarDatosDemo.js` carga datos ficticios de desarrollo
(catálogo + usuarios de prueba) sobre una base ya creada; no reemplaza el
mecanismo de creación de esquema descripto arriba.
