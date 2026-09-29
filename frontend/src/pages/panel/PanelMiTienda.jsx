import { useCallback, useState } from 'react';
import GestionEntidad from '../../components/GestionEntidad.jsx';
import AjustarStockDialog from '../../components/AjustarStockDialog.jsx';
import { EstadoCarga, EstadoError } from '../../components/EstadosSolicitud.jsx';
import useCargaDatos from '../../hooks/useCargaDatos.js';
import productosApi from '../../api/productos.api.js';
import categoriasApi from '../../api/categorias.api.js';
import tiposMascotaApi from '../../api/tiposMascota.api.js';
import tiendaApi from '../../api/tienda.api.js';

const pedirRelaciones = () =>
  Promise.all([categoriasApi.listar(), tiposMascotaApi.listar(), tiendaApi.obtenerPropia()]).then(
    ([categorias, tiposMascota, tienda]) => ({
      categorias: categorias.map((c) => ({ valor: c.idCategoria, etiqueta: c.nombre })),
      tiposMascota: tiposMascota.map((t) => ({ valor: t.idTipoMascota, etiqueta: t.nombre })),
      tienda,
    }),
  );

const columnas = [
  { clave: 'nombre', etiqueta: 'Nombre' },
  { clave: 'precio', etiqueta: 'Precio', formatear: (fila) => `$${fila.precio}` },
  { clave: 'stockActual', etiqueta: 'Stock' },
  { clave: 'categoria', etiqueta: 'Categoría', formatear: (fila) => fila.categoria?.nombre || '—' },
];

// Mismo patrón que PanelProductos.jsx#AjustarStockAccion (personal
// interno): el mismo endpoint PATCH /:id/stock ya acepta a un vendedor
// independiente sobre SU PROPIO producto (ver producto.service.js).
const AjustarStockAccion = ({ producto, onCambio }) => {
  const [abierto, setAbierto] = useState(false);
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

// "Mis productos" de un vendedor independiente (ronda 2, Etapa 8): reutiliza
// GestionEntidad (mismo componente que el panel interno) con un `servicio`
// propio — listar trae SOLO los productos de esta tienda
// (GET /api/tiendas/propia/productos), crear/actualizar/eliminar/ajustar
// stock son los mismos endpoints de /api/productos que ya usa el personal
// interno: la autorización real (que solo pueda tocar sus propios
// productos, y solo si su tienda está activa) ocurre en el backend, ver
// producto.service.js.
const PanelMiTienda = () => {
  const { datos: opciones, error, recargar } = useCargaDatos(useCallback(() => pedirRelaciones(), []));

  if (error) return <EstadoError mensaje={error} onReintentar={recargar} />;
  if (!opciones) return <EstadoCarga mensaje="Cargando tu tienda…" />;

  const campos = [
    { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
    { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'texto' },
    { nombre: 'precio', etiqueta: 'Precio', tipo: 'decimal', requerido: true },
    { nombre: 'stockMinimo', etiqueta: 'Stock mínimo', tipo: 'numero', requerido: true },
    { nombre: 'stockActual', etiqueta: 'Stock inicial', tipo: 'numero', requerido: true, soloAlCrear: true },
    { nombre: 'idCategoria', etiqueta: 'Categoría', tipo: 'seleccion', numerico: true, opciones: opciones.categorias },
    { nombre: 'idTipoMascota', etiqueta: 'Tipo de mascota', tipo: 'seleccion', numerico: true, opciones: opciones.tiposMascota },
    {
      nombre: 'urlImagen',
      etiqueta: 'URL de imagen (opcional)',
      tipo: 'texto',
      obtenerValor: (fila) => fila.imagen?.url ?? '',
    },
  ];

  const servicio = { ...productosApi, listar: tiendaApi.misProductos };

  return (
    <div>
      <div className="tarjeta" style={{ padding: 16, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>{opciones.tienda.nombre}</h2>
        <p>
          Estado: <strong>{opciones.tienda.estado === 'activa' ? 'Activa' : 'Suspendida'}</strong>
          {opciones.tienda.estado !== 'activa' && ' — no podés crear ni editar productos mientras esté suspendida.'}
        </p>
      </div>

      <GestionEntidad
        titulo="Mis productos"
        servicio={servicio}
        campos={campos}
        columnas={columnas}
        idCampo="idProducto"
        renderAccionesExtra={(fila, onCambio) => (
          <AjustarStockAccion key="stock" producto={fila} onCambio={onCambio} />
        )}
      />
    </div>
  );
};

export default PanelMiTienda;
