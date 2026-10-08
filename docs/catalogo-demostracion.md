# Catálogo paginado de demostración

Este cambio agrega un endpoint público `GET /api/productos/catalogo` con resultados paginados (24 por página). La búsqueda y los filtros se ejecutan en MySQL mediante Sequelize. El endpoint anterior `GET /api/productos` conserva su respuesta de arreglo para los módulos existentes; no se usa en la portada ni en el catálogo paginado.

Parámetros opcionales: `pagina`, `buscar`, `idCategoria`, `idTipoMascota` (grupo), `idSubtipoMascota` (hijo válido de ese grupo), `marca`, `precioMin`, `precioMax`, `disponibles=si`, `orden=nombre|precio-asc|precio-desc|nuevos`, `etapaVida`, `tamano`, `condicion`, `formato`, `tipoAgua`, `tipoArena`. Se validan los valores; el servidor siempre limita a 24 filas. Respuesta: `{ productos, total, pagina, totalPaginas, porPagina }`. `GET /api/productos/marcas` devuelve las marcas disponibles sin contar tiendas suspendidas. El catálogo mantiene el filtro que oculta productos de tiendas suspendidas.

`jerarquiamascota` y `facetaproducto` son dos tablas nuevas. No modifican `producto` ni `tipomascota` existentes. La primera relaciona, por ejemplo, `Ave → Periquito`; un producto sigue apuntando al tipo más específico mediante `producto.idTipoMascota`. La segunda guarda las facetas opcionales para los filtros particulares. `GET /api/tipos-mascota/jerarquia` devuelve grupos y subtipos para la interfaz. Como todas las tablas se crean con `sync()` sin `alter`, no hace falta aplicar un `ALTER TABLE` a las bases existentes. Las bases de integración y E2E incorporan las nuevas tablas y las borran en orden correcto al reiniciar sus datos.

## Datos ficticios, en una base independiente

El sembrador `backend/scripts/sembrarCatalogoMasivo.js` requiere que la **base efectiva sea exactamente** `petshop_catalogo_demo` y que se pase `--confirmar`. No borra nada y usa nombres estables para no duplicar los 1000 artículos al ejecutarlo otra vez. Crea tres cuentas ficticias y medios de pago simulados para recorrer el panel y el checkout; no crea ventas ni pagos. Los precios y las marcas en los nombres son ficticios.

Un administrador de MySQL debe crear una base y un usuario exclusivos para esta demo. Ejemplo orientativo (elegir una clave propia, no guardarla en Git):

```sql
CREATE DATABASE petshop_catalogo_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'petshop_catalogo_app'@'localhost' IDENTIFIED BY 'CLAVE_LOCAL_ELEGIDA_POR_VOS';
GRANT ALL PRIVILEGES ON petshop_catalogo_demo.* TO 'petshop_catalogo_app'@'localhost';
```

Copiar `backend/.env.catalogo.example` a `backend/.env.catalogo` y `frontend/.env.catalogo.example` a `frontend/.env.catalogo`; completar la clave de MySQL y el JWT_SECRET local. No subir esos archivos locales. Iniciar con dos terminales, desde sus respectivas carpetas:

```text
backend:  npm run dev:catalogo       # puerto 3002; solo petshop_catalogo_demo
backend:  npm run sembrar:catalogo   # 1000 artículos, sin duplicados
frontend: npm run dev:catalogo       # puerto 5184
```

Abrir `http://localhost:5184`. La portada y el catálogo usan la nueva API paginada. Las 33 ilustraciones SVG locales se reutilizan por clase y categoría: `frontend/public/demo-productos`. La URL guardada es relativa al frontend, por lo que también funciona si se comparte el puerto de Vite. Son ilustraciones de demostración, no fotografías de productos comerciales.

Credenciales exclusivas de esta base: `cliente-catalogo@petshop.demo / Demo1234Client`, `vendedor-catalogo@petshop.demo / Demo1234Vende`, `admin-catalogo@petshop.demo / Demo1234Admin`. No se reutilizan fuera de una demo local. Las compras de prueba que hagas acá permanecen en `petshop_catalogo_demo`, aisladas de `petshop_db`.

## Verificación antes de integrar

Ejecutar `npm test` e integración en `petshop_test`, frontend `npm test`, `npm run lint`, `npm run build` y E2E con `petshop_e2e`. Probar el endpoint con 1000 registros y validar que nunca devuelve más de 24, que `total` coincide con MySQL, que el subtipo equivocado devuelve 400, que una tienda suspendida no aparece y que cambiar filtros vuelve a la primera página. El filtrado de promociones vigentes sigue siendo responsabilidad del endpoint de promociones; este catálogo no anuncia descuentos no calculados.

## Catálogo de desarrollo sin artículos ficticios

Las clases de mascotas se pueden cargar en `petshop_db` sin crear productos: desde `backend`, ejecutar `node scripts/sembrarClasesMascotas.js` (modo informativo) y luego `node scripts/sembrarClasesMascotas.js --confirmar`. El script agrega únicamente tipos, subtipos y relaciones faltantes; repetirlo no duplica datos. Requiere la conexión local `petshop_app@localhost` y el esquema actualizado.

Si se habían cargado los 1000 artículos ficticios en `petshop_db`, primero hacer un respaldo completo y ejecutar `node scripts/retirarCatalogoFicticio.js` para comprobar que hay exactamente 1000 series y ninguna venta o promoción vinculada. Solo entonces ejecutar `node scripts/retirarCatalogoFicticio.js --confirmar`. Borra imágenes, facetas, favoritos y los artículos ficticios en una sola transacción. Conserva `tipomascota`, `jerarquiamascota`, categorías, productos reales y sus ventas. Las categorías se conservan porque el sembrador reutilizaba también las existentes y no se puede inferir cuáles eran nuevas solo por el nombre. Si una comprobación falla, no modificar la base y revisar la salida.

El sembrador masivo del repositorio sigue limitado a `petshop_catalogo_demo`; ejecutarlo en esa base aislada no modifica `petshop_db`.
