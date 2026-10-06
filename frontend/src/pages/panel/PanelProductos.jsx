import { useCallback, useState } from 'react';
import GestionEntidad from '../../components/GestionEntidad.jsx';
import { EstadoCarga, EstadoError } from '../../components/EstadosSolicitud.jsx';
import useCargaDatos from '../../hooks/useCargaDatos.js';
import productosApi from '../../api/productos.api.js';
import categoriasApi from '../../api/categorias.api.js';
import tiposMascotaApi from '../../api/tiposMascota.api.js';
import proveedoresApi from '../../api/proveedores.api.js';

// Carga en paralelo de las tablas relacionadas para poblar los selectores del formulario
const pedirRelaciones = () =>
  Promise.all([categoriasApi.listar(), tiposMascotaApi.listar(), proveedoresApi.listar()]).then(
    ([categorias, tiposMascota, proveedores]) => ({
      categorias: categorias.map((c) => ({ valor: c.idCategoria, etiqueta: c.nombre })),
      tiposMascota: tiposMascota.map((t) => ({ valor: t.idTipoMascota, etiqueta: t.nombre })),
      proveedores: proveedores.map((p) => ({ valor: p.idProveedor, etiqueta: p.descripcion })),
    }),
  );

// Definición de las columnas que se renderizan en la tabla principal
const columnas = [
  { clave: 'nombre', etiqueta: 'Nombre' },
  { clave: 'precio', etiqueta: 'Precio', formatear: (fila) => `$${fila.precio}` },
  { clave: 'stockActual', etiqueta: 'Stock' },
  { clave: 'categoria', etiqueta: 'Categoría', formatear: (fila) => fila.categoria?.nombre || '—' },
  { clave: 'imagen', etiqueta: 'Imagen', formatear: (fila) => (fila.imagen?.url ? 'Sí' : '—') },
];

// Componente para la acción de ajuste de stock mediante ventana emergente (PATCH)
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

  // variables de estado locales para almacenar el estado de los filtros y la búsqueda
  const [idCategoriaSel, setIdCategoriaSel] = useState('');
  const [idTipoMascotaSel, setIdTipoMascotaSel] = useState('');
  const [textoBusqueda, setTextoBusqueda] = useState('');

  if (error) return <EstadoError mensaje={error} onReintentar={recargar} />;
  if (!opciones) return <EstadoCarga mensaje="Cargando relaciones del producto…" />;

  // Intercepción del servicio API: Se descarga la lista completa y se filtra localmente en memoria
  // para evitar inconsistencias de enrutamiento y reducir peticiones reiteradas al servidor
  const servicioFiltrado = {
    ...productosApi,
    listar: async () => {
      const listaOriginal = await productosApi.listar();
      
      return listaOriginal.filter(p => {
        // Validación de filtro por Categoría (se unifican los tipos de datos numéricos)
        const cumpleCategoria = !idCategoriaSel || Number(p.idCategoria) === Number(idCategoriaSel);
        // Validación de filtro por Tipo de Mascota
        const cumpleMascota = !idTipoMascotaSel || Number(p.idTipoMascota) === Number(idTipoMascotaSel);
        // Búsqueda predictiva: Coincidencia parcial e insensible a mayúsculas/minúsculas
        const cumpleTexto = !textoBusqueda.trim() || p.nombre.toLowerCase().includes(textoBusqueda.toLowerCase());
        
        return cumpleCategoria && cumpleMascota && cumpleTexto;
      });
    }
  };

  // Configuración de los campos estructurales del formulario ABM
  const campos = [
    { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
    { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'texto' },
    { nombre: 'precio', etiqueta: 'Precio', tipo: 'decimal', requerido: true },
    { nombre: 'stockMinimo', etiqueta: 'Stock mínimo', tipo: 'numero', requerido: true },
    { nombre: 'stockActual', etiqueta: 'Stock inicial', tipo: 'numero', requerido: true, soloAlCrear: true },
    { nombre: 'idCategoria', etiqueta: 'Categoría', tipo: 'seleccion', numerico: true, opciones: opciones.categorias },
    { nombre: 'idTipoMascota', etiqueta: 'Tipo de mascota', tipo: 'seleccion', numerico: true, opciones: opciones.tiposMascota },
    { nombre: 'idProveedor', etiqueta: 'Proveedor', tipo: 'seleccion', numerico: true, opciones: opciones.proveedores },
    { nombre: 'urlImagen', etiqueta: 'URL de imagen (opcional)', tipo: 'texto', obtenerValor: (fila) => fila.imagen?.url ?? '' },
  ];

  return (
    <div>
      {/* Sección superior de filtros - Maquetado adaptable de controles de búsqueda */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', background: '#f5f5f5', padding: '1rem', borderRadius: '8px' }}>
        
        {/* Selector dinámico para filtrado por Categoría */}
        <div style={{ flex: '1 1 200px' }}>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>Categoría:</label>
          <select value={idCategoriaSel} onChange={(e) => setIdCategoriaSel(e.target.value)}>
            <option value="">Todas</option>
            {opciones.categorias.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
          </select>
        </div>

        {/* Selector dinámico para filtrado por Tipo de Mascota */}
        <div style={{ flex: '1 1 200px' }}>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>Mascota:</label>
          <select value={idTipoMascotaSel} onChange={(e) => setIdTipoMascotaSel(e.target.value)}>
            <option value="">Todas</option>
            {opciones.tiposMascota.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
          </select>
        </div>

        {/* Input de texto para la búsqueda predictiva de productos por nombre */}
        <div style={{ flex: '1 1 250px' }}>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>Buscar por nombre:</label>
          <input
            type="text"
            placeholder="Ej: pelota, alimento..."
            value={textoBusqueda}
            onChange={(e) => setTextoBusqueda(e.target.value)}
            style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

      </div>

      {/* Componente ABM centralizado. El atributo 'key' dinámico fuerza el desmontaje 
          y remontaje del componente ante mutaciones de estado, garantizando la reactividad */}
      <GestionEntidad
        key={`${idCategoriaSel}-${idTipoMascotaSel}-${textoBusqueda}`}
        titulo="Productos"
        servicio={servicioFiltrado}
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

export default PanelProductos;
