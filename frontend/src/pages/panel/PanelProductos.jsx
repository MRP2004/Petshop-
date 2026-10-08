import { useCallback, useState } from 'react';
import GestionEntidad from '../../components/GestionEntidad.jsx';
import AjustarStockDialog from '../../components/AjustarStockDialog.jsx';
import { EstadoCarga, EstadoError } from '../../components/EstadosSolicitud.jsx';
import useCargaDatos from '../../hooks/useCargaDatos.js';
import productosApi from '../../api/productos.api.js';
import categoriasApi from '../../api/categorias.api.js';
import tiposMascotaApi from '../../api/tiposMascota.api.js';
import proveedoresApi from '../../api/proveedores.api.js';
import './PanelProductos.css';

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
  const [abierto, setAbierto] = useState(false);
  // Se incrementa en cada apertura y se usa como `key` del diálogo: fuerza
  // una instancia de componente nueva por apertura, así el campo de
  // cantidad siempre arranca vacío sin necesitar ningún reseteo manual (ver
  // el comentario en AjustarStockDialog.jsx).
  const [aperturas, setAperturas] = useState(0);
  const [enCurso, setEnCurso] = useState(false);
  const [error, setError] = useState(null);

  const abrir = () => {
    setError(null);
    setAperturas((valor) => valor + 1);
    setAbierto(true);
  };

  const cerrar = () => {
    if (enCurso) return;
    setAbierto(false);
    setError(null);
  };

  const confirmar = async (cantidad) => {
    setEnCurso(true);
    setError(null);
    try {
      await productosApi.ajustarStock(producto.idProducto, cantidad);
      setAbierto(false);
      onCambio();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnCurso(false);
    }
  };

  return (
    <>
      <button type="button" className="boton-enlace" onClick={abrir}>
        Ajustar stock
      </button>
      {abierto && (
        <AjustarStockDialog
          key={aperturas}
          producto={producto}
          cargando={enCurso}
          error={error}
          onConfirmar={confirmar}
          onCancelar={cerrar}
        />
      )}
    </>
  );
};

const PanelProductos = () => {
  const { datos: opciones, error, recargar } = useCargaDatos(useCallback(() => pedirRelaciones(), []));
  const [idCategoria, setIdCategoria] = useState('');
  const [idTipoMascota, setIdTipoMascota] = useState('');
  const [busqueda, setBusqueda] = useState('');

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

  const texto = busqueda.trim().toLocaleLowerCase('es-AR');
  const coincide = (producto) =>
    (!idCategoria || Number(producto.idCategoria) === Number(idCategoria)) &&
    (!idTipoMascota || Number(producto.idTipoMascota) === Number(idTipoMascota)) &&
    (!texto || producto.nombre.toLocaleLowerCase('es-AR').includes(texto));

  return (
    <div>
      <div className="panel-productos__filtros" role="group" aria-label="Filtrar productos del panel">
        <div className="campo">
          <label htmlFor="panel-productos-categoria">Categoría</label>
          <select id="panel-productos-categoria" value={idCategoria} onChange={(evento) => setIdCategoria(evento.target.value)}>
            <option value="">Todas</option>
            {opciones.categorias.map((opcion) => <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="panel-productos-mascota">Mascota</label>
          <select id="panel-productos-mascota" value={idTipoMascota} onChange={(evento) => setIdTipoMascota(evento.target.value)}>
            <option value="">Todas</option>
            {opciones.tiposMascota.map((opcion) => <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="panel-productos-busqueda">Buscar por nombre</label>
          <input id="panel-productos-busqueda" type="search" placeholder="Ej.: pelota, alimento…" value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} />
        </div>
      </div>
      <GestionEntidad
        titulo="Productos"
        servicio={productosApi}
        campos={campos}
        columnas={columnas}
        idCampo="idProducto"
        filtrarFilas={coincide}
        renderAccionesExtra={(fila, onCambio) => (
          <AjustarStockAccion key="stock" producto={fila} onCambio={onCambio} />
        )}
      />
    </div>
  );
};

export default PanelProductos;
