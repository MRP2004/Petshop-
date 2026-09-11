import { useCallback } from 'react';
import GestionEntidad from '../../components/GestionEntidad.jsx';
import { EstadoCarga, EstadoError } from '../../components/EstadosSolicitud.jsx';
import useCargaDatos from '../../hooks/useCargaDatos.js';
import promocionesApi from '../../api/promociones.api.js';
import productosApi from '../../api/productos.api.js';
import categoriasApi from '../../api/categorias.api.js';
import './PanelPromociones.css';

const columnas = [
  { clave: 'producto', etiqueta: 'Producto', formatear: (fila) => fila.producto?.nombre || '—' },
  { clave: 'descuento', etiqueta: 'Descuento', formatear: (fila) => fila.descuento },
  { clave: 'fechaInicio', etiqueta: 'Desde' },
  { clave: 'fechaFin', etiqueta: 'Hasta' },
];

const pedirRelaciones = () =>
  Promise.all([productosApi.listar(), categoriasApi.listar()]).then(([productos, categorias]) => ({
    productos: productos.map((p) => ({ valor: p.idProducto, etiqueta: p.nombre })),
    categorias: categorias.map((c) => ({ valor: c.idCategoria, etiqueta: c.nombre })),
  }));

// Nota importante (ver docs/estado-proyecto.md): esta pantalla solo da de
// alta/edita/borra promociones. El significado exacto de "descuento" y cómo
// interactuaría con el precio de una venta todavía no lo confirmó Mauro, así
// que ninguna promoción se aplica automáticamente en el checkout: acá solo
// se administran como catálogo informativo.
const PanelPromociones = () => {
  const { datos: opciones, error, recargar } = useCargaDatos(useCallback(() => pedirRelaciones(), []));

  if (error) return <EstadoError mensaje={error} onReintentar={recargar} />;
  if (!opciones) return <EstadoCarga mensaje="Cargando productos y categorías…" />;

  const campos = [
    { nombre: 'idProducto', etiqueta: 'Producto', tipo: 'seleccion', numerico: true, requerido: true, opciones: opciones.productos },
    { nombre: 'idCategoria', etiqueta: 'Categoría (opcional)', tipo: 'seleccion', numerico: true, opciones: opciones.categorias },
    { nombre: 'fechaInicio', etiqueta: 'Vigencia desde', tipo: 'fecha', requerido: true },
    { nombre: 'fechaFin', etiqueta: 'Vigencia hasta', tipo: 'fecha', requerido: true },
    { nombre: 'descuento', etiqueta: 'Descuento', tipo: 'decimal', requerido: true },
  ];

  return (
    <div>
      <p className="panel-promociones__aviso">
        Las reglas de aplicación de promociones (si el descuento es porcentual, cómo se combina con
        el descuento manual de una venta, qué pasa si se superponen dos vigentes) todavía no están
        confirmadas: esta pantalla solo administra el catálogo de promociones, no las aplica en el
        checkout.
      </p>
      <GestionEntidad
        titulo="Promociones"
        servicio={promocionesApi}
        campos={campos}
        columnas={columnas}
        idCampo="idPromocionProducto"
      />
    </div>
  );
};

export default PanelPromociones;
