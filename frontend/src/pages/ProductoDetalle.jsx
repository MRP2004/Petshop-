import { useCallback, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { EstadoCarga, EstadoError } from '../components/EstadosSolicitud.jsx';
import { useCarrito } from '../hooks/useCarrito.js';
import useCargaDatos from '../hooks/useCargaDatos.js';
import productosApi from '../api/productos.api.js';
import ImagenProducto from '../components/ImagenProducto.jsx';
import './ProductoDetalle.css';

const formateador = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

// Detalle de producto: precio, disponibilidad, sus relaciones (categoría,
// tipo de mascota, proveedor) y selección de cantidad para agregar al
// carrito. La validación de cantidad acá es solo de UX (no puede superar el
// stock visible); el backend vuelve a validar stock real al confirmar la
// compra, porque este valor puede haber cambiado mientras tanto.
//
// El wrapper de abajo monta este contenido con key={id}: así, al navegar de
// un producto a otro, React lo remonta entero en vez de reutilizar la
// instancia, y "cantidad"/"agregado" arrancan limpios de forma natural, sin
// necesitar un efecto que los resetee manualmente.
const ProductoDetalleContenido = ({ id }) => {
  const { agregarProducto } = useCarrito();
  const { datos: producto, cargando, error, recargar } = useCargaDatos(
    useCallback(() => productosApi.obtener(id), [id]),
  );

  const [cantidad, setCantidad] = useState(1);
  const [agregado, setAgregado] = useState(false);

  const manejarAgregar = () => {
    agregarProducto(producto, cantidad);
    setAgregado(true);
  };

  if (cargando) return <div className="pagina contenedor"><EstadoCarga /></div>;
  if (error) return <div className="pagina contenedor"><EstadoError mensaje={error} onReintentar={recargar} /></div>;
  if (!producto) return null;

  const sinStock = producto.stockActual <= 0;

  return (
    <div className="pagina contenedor producto-detalle">
      <ImagenProducto
        producto={producto}
        claseContenedor="producto-detalle__imagen"
        claseImagen="producto-detalle__imagen-real"
      />

      <div className="producto-detalle__info">
        <h1>{producto.nombre}</h1>
        {producto.descripcion && <p className="producto-detalle__descripcion">{producto.descripcion}</p>}

        <p className="producto-detalle__precio">{formateador.format(Number(producto.precio))}</p>
        <p className={sinStock ? 'producto-detalle__stock--agotado' : 'producto-detalle__stock'}>
          {sinStock ? 'Sin stock disponible' : `Stock disponible: ${producto.stockActual} unidades`}
        </p>

        <dl className="producto-detalle__relaciones">
          {producto.categoria && (
            <div>
              <dt>Categoría</dt>
              <dd>{producto.categoria.nombre}</dd>
            </div>
          )}
          {producto.tipoMascota && (
            <div>
              <dt>Para</dt>
              <dd>{producto.tipoMascota.nombre}</dd>
            </div>
          )}
        </dl>

        {!sinStock && (
          <div className="producto-detalle__accion">
            <label htmlFor="cantidad">Cantidad</label>
            <input
              id="cantidad"
              type="number"
              min="1"
              max={producto.stockActual}
              value={cantidad}
              onChange={(evento) => {
                const valor = Number(evento.target.value);
                setCantidad(Math.min(Math.max(valor || 1, 1), producto.stockActual));
              }}
            />
            <button type="button" className="boton boton-primario" onClick={manejarAgregar}>
              Agregar al carrito 🛒
            </button>
          </div>
        )}

        {agregado && (
          <p className="producto-detalle__confirmacion">
            Agregado al carrito. <Link to="/carrito">Ver carrito</Link>
          </p>
        )}
      </div>
    </div>
  );
};

const ProductoDetalle = () => {
  const { id } = useParams();
  return <ProductoDetalleContenido key={id} id={id} />;
};

export default ProductoDetalle;
