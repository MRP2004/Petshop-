import { useCallback } from 'react';
import GestionEntidad from '../../components/GestionEntidad.jsx';
import { EstadoCarga, EstadoError } from '../../components/EstadosSolicitud.jsx';
import useCargaDatos from '../../hooks/useCargaDatos.js';
import promocionesApi from '../../api/promociones.api.js';
import productosApi from '../../api/productos.api.js';
import './PanelPromociones.css';

const columnas = [
  { clave: 'producto', etiqueta: 'Producto', formatear: (fila) => fila.producto?.nombre || '—' },
  { clave: 'descuento', etiqueta: 'Descuento', formatear: (fila) => `${Number(fila.descuento).toFixed(2)}%` },
  { clave: 'fechaInicio', etiqueta: 'Desde' },
  { clave: 'fechaFin', etiqueta: 'Hasta' },
];

const pedirRelaciones = () =>
  productosApi.listar().then((productos) => ({
    productos: productos.map((p) => ({ valor: p.idProducto, etiqueta: p.nombre })),
  }));

const PanelPromociones = () => {
  const { datos: opciones, error, recargar } = useCargaDatos(useCallback(() => pedirRelaciones(), []));

  if (error) return <EstadoError mensaje={error} onReintentar={recargar} />;
  if (!opciones) return <EstadoCarga mensaje="Cargando productos…" />;

  const campos = [
    { nombre: 'idProducto', etiqueta: 'Producto', tipo: 'seleccion', numerico: true, requerido: true, opciones: opciones.productos },
    { nombre: 'fechaInicio', etiqueta: 'Vigencia desde', tipo: 'fecha', requerido: true },
    { nombre: 'fechaFin', etiqueta: 'Vigencia hasta', tipo: 'fecha', requerido: true },
    { nombre: 'descuento', etiqueta: 'Descuento (%)', tipo: 'decimal', min: 1, max: 100, requerido: true },
  ];

  return (
    <div>
      <p className="panel-promociones__aviso">
        El descuento porcentual se aplica al producto durante todo el período indicado. No se pueden
        crear dos promociones con fechas superpuestas para el mismo producto.
      </p>
      <GestionEntidad
        titulo="Promociones"
        servicio={promocionesApi.administracion}
        campos={campos}
        columnas={columnas}
        idCampo="idPromocionProducto"
      />
    </div>
  );
};

export default PanelPromociones;
