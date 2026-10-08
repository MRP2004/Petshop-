// Helpers de rol explícitos (ronda 2, Etapa 8 — marketplace): reemplazan
// las ramas "si no es cliente, entonces es personal" que existían en varias
// partes del código (venta.service.js, compra.service.js,
// solicitudCancelacion.service.js) desde antes de que existiera un cuarto
// rol. Con 3 roles esa negación implícita era inofensiva (lo único que no
// era 'cliente' era personal interno); con 'vendedor_independiente' deja de
// serlo — hallazgo real de la revisión de Codex del DISEÑO de esta etapa
// (ver docs/estado-proyecto.md): un `rol !== 'cliente'` trataría por error
// a un vendedor independiente como si fuera personal interno con acceso
// global. Estos helpers hacen explícita la intención en cada lugar, en vez
// de depender de una negación.
const esPersonalInterno = (rol) => rol === 'vendedor' || rol === 'administrador';

const esVendedorIndependiente = (rol) => rol === 'vendedor_independiente';

// "Comprador registrado": cualquier cuenta con un Cliente asociado y, por
// lo tanto, con idCliente propio — hoy 'cliente' y 'vendedor_independiente'
// (un vendedor independiente sigue siendo comprador: conserva su Cliente,
// sus favoritos, su historial — ver "Corrección de diseño" en
// docs/estado-proyecto.md, Etapa 8).
const esCompradorRegistrado = (rol) => rol === 'cliente' || esVendedorIndependiente(rol);

export { esPersonalInterno, esVendedorIndependiente, esCompradorRegistrado };
