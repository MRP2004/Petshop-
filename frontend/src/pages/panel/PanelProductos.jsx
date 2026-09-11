import { useCallback, useState } from 'react';
import GestionEntidad from '../../components/GestionEntidad.jsx';
import { EstadoCarga, EstadoError } from '../../components/EstadosSolicitud.jsx';
import useCargaDatos from '../../hooks/useCargaDatos.js';
import productosApi from '../../api/productos.api.js';
import categoriasApi from '../../api/categorias.api.js';
import tiposMascotaApi from '../../api/tiposMascota.api.js';
import proveedoresApi from '../../api/proveedores.api.js';

const pedirRelaciones = () =>
  Promise.all([categoriasApi.listar(), tiposMascotaApi.listar(), proveedoresApi.listar()]).then(
    ([categorias, tiposMascota, proveedores]) => ({
      categorias: categorias.map((c) => ({ valor: c.idCategoria, etiqueta: c.nombre })),
      tiposMascota: tiposMascota.map((t) => ({ valor: t.idTipoMascota, etiqueta: t.nombre })),
      proveedores: proveedores.map((p) => ({ valor: p.idProveedor, etiqueta: p.descripcion })),
    }),
  );

const columnas = [
  { clave: 'nombre', etiqueta: 'Nombre' },
  { clave: 'precio', etiqueta: 'Precio', formatear: (fila) => `$${fila.precio}` },
  { clave: 'stockActual', etiqueta: 'Stock' },
  { clave: 'categoria', etiqueta: 'Categoría', formatear: (fila) => fila.categoria?.nombre || '—' },
  { clave: 'imagen', etiqueta: 'Imagen', formatear: (fila) => (fila.imagen?.url ? 'Sí' : '—') },
];

// stockActual se crea acá (alta) pero NUNCA se edita por este formulario: el
// backend rechaza explícitamente stockActual en el PUT general (ver
// docs/backend-api.md). Los ajustes de stock ya existente se hacen con el
// botón "Ajustar stock" de cada fila, que llama a PATCH /:id/stock.
const AjustarStockAccion = ({ producto, onCambio }) => {
  const [enCurso, setEnCurso] = useState(false);

  const ajustar = async () => {
    const texto = window.prompt(
      `Movimiento de stock para "${producto.nombre}" (stock actual: ${producto.stockActual}).\nUn número positivo suma, uno negativo resta:`,
    );
    if (texto === null || texto.trim() === '') return;

    const cantidad = Number(texto);
    if (!Number.isInteger(cantidad) || cantidad === 0) {
      window.alert('Ingresá un número entero distinto de cero.');
      return;
    }

    setEnCurso(true);
    try {
      await productosApi.ajustarStock(producto.idProducto, cantidad);
      onCambio();
    } catch (error) {
      window.alert(error.message);
    } finally {
      setEnCurso(false);
    }
  };

  return (
    <button type="button" className="boton-enlace" onClick={ajustar} disabled={enCurso}>
      Ajustar stock
    </button>
  );
};

const PanelProductos = () => {
  const { datos: opciones, error, recargar } = useCargaDatos(useCallback(() => pedirRelaciones(), []));

  if (error) return <EstadoError mensaje={error} onReintentar={recargar} />;
  if (!opciones) return <EstadoCarga mensaje="Cargando relaciones del producto…" />;

  const campos = [
    { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
    { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'texto' },
    { nombre: 'precio', etiqueta: 'Precio', tipo: 'decimal', requerido: true },
    { nombre: 'stockMinimo', etiqueta: 'Stock mínimo', tipo: 'numero', requerido: true },
    {
      nombre: 'stockActual',
      etiqueta: 'Stock inicial',
      tipo: 'numero',
      requerido: true,
      soloAlCrear: true,
    },
    { nombre: 'idCategoria', etiqueta: 'Categoría', tipo: 'seleccion', numerico: true, opciones: opciones.categorias },
    { nombre: 'idTipoMascota', etiqueta: 'Tipo de mascota', tipo: 'seleccion', numerico: true, opciones: opciones.tiposMascota },
    { nombre: 'idProveedor', etiqueta: 'Proveedor', tipo: 'seleccion', numerico: true, opciones: opciones.proveedores },
    {
      nombre: 'urlImagen',
      etiqueta: 'URL de imagen (opcional)',
      tipo: 'texto',
      // No es una propiedad plana del producto: la API la devuelve anidada
      // en producto.imagen.url (tabla relacionada, ver
      // docs/backend-base-de-datos.md). Dejar el campo vacío al guardar
      // borra la imagen cargada (mismo criterio que el resto de los campos
      // opcionales de este formulario: lo que esté en el formulario
      // reemplaza siempre al valor anterior).
      obtenerValor: (fila) => fila.imagen?.url ?? '',
    },
  ];

  return (
    <GestionEntidad
      titulo="Productos"
      servicio={productosApi}
      campos={campos}
      columnas={columnas}
      idCampo="idProducto"
      renderAccionesExtra={(fila, onCambio) => (
        <AjustarStockAccion key="stock" producto={fila} onCambio={onCambio} />
      )}
    />
  );
};

export default PanelProductos;
