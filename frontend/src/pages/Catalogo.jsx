import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard.jsx';
import CategoryItem from '../components/CategoryItem.jsx';
import { EstadoCarga, EstadoError, EstadoVacio } from '../components/EstadosSolicitud.jsx';
import useCargaDatos from '../hooks/useCargaDatos.js';
import productosApi from '../api/productos.api.js';
import categoriasApi from '../api/categorias.api.js';
import tiposMascotaApi from '../api/tiposMascota.api.js';
import './Catalogo.css';

const pedirFiltrosDisponibles = () =>
  Promise.all([categoriasApi.listar(), tiposMascotaApi.jerarquia(), productosApi.listarMarcas()]).then(([categorias, mascotas, marcas]) => ({
    categorias, mascotas, marcas,
  }));

const filtrosPorMascota = {
  Perro: [
    ['etapaVida', 'Edad', [['cachorro', 'Cachorro'], ['adulto', 'Adulto'], ['senior', 'Senior']]],
    ['tamano', 'Tamaño', [['pequeno', 'Pequeño'], ['mediano', 'Mediano'], ['grande', 'Grande']]],
  ],
  Gato: [
    ['etapaVida', 'Edad', [['gatito', 'Gatito'], ['adulto', 'Adulto'], ['senior', 'Senior']]],
    ['condicion', 'Condición', [['interior', 'Interior'], ['esterilizado', 'Esterilizado'], ['activo', 'Activo']]],
  ],
  Pez: [
    ['tipoAgua', 'Tipo de agua', [['fria', 'Fría'], ['tropical', 'Tropical'], ['marina', 'Marina']]],
  ],
};
const formatoAlimento = ['formato', 'Formato', [['seco', 'Seco'], ['humedo', 'Húmedo'], ['snack', 'Snack']]];
const formatoAves = ['formato', 'Formato', [['semillas', 'Semillas'], ['pellets', 'Pellets']]];
const arenasGato = ['tipoArena', 'Tipo de arena', [
  ['aglomerante', 'Aglomerante'], ['silice', 'Sílice'], ['ecologica', 'Ecológica'],
]];
const nombresFacetas = ['etapaVida', 'tamano', 'condicion', 'formato', 'tipoAgua', 'tipoArena'];

const Catalogo = () => {
  const [parametros, setParametros] = useSearchParams();
  const { datos: filtrosDisponibles, cargando: cargandoFiltros, error: errorFiltros, recargar: recargarFiltros } = useCargaDatos(
    useCallback(() => pedirFiltrosDisponibles(), []),
  );
  const categorias = filtrosDisponibles?.categorias || [];
  const mascotas = filtrosDisponibles?.mascotas || [];
  const marcas = filtrosDisponibles?.marcas || [];
  const mascotaUrl = parametros.get('mascota') || '';
  const idCategoria = parametros.get('idCategoria') || '';
  const idSubtipoMascota = parametros.get('idSubtipoMascota') || '';
  const buscar = parametros.get('buscar') || '';
  const orden = parametros.get('orden') || 'nombre';
  const disponibles = parametros.get('disponibles') === 'si';
  const precioMin = parametros.get('precioMin') || '';
  const precioMax = parametros.get('precioMax') || '';
  const marca = parametros.get('marca') || '';
  const facetas = Object.fromEntries(nombresFacetas.map((nombre) => [nombre, parametros.get(nombre) || '']));

  // Los enlaces existentes de la portada y del menú usan ?mascota=perro/gato.
  // También se admiten los IDs en la URL para grupos nuevos y sus subtipos.
  const mascotaSeleccionada = mascotas.find((tipo) =>
    String(tipo.idTipoMascota) === mascotaUrl || tipo.nombre.toLowerCase() === mascotaUrl.toLowerCase(),
  );
  const idTipoMascota = mascotaSeleccionada ? String(mascotaSeleccionada.idTipoMascota) : '';
  const mascotaInvalida = Boolean(mascotaUrl && !cargandoFiltros && !errorFiltros && !mascotaSeleccionada);
  const categoriaSeleccionada = categorias.find((categoria) => String(categoria.idCategoria) === idCategoria)?.nombre;
  const filtrosEspecificos = [
    ...(filtrosPorMascota[mascotaSeleccionada?.nombre] || []),
    ...(['Alimento', 'Snacks'].includes(categoriaSeleccionada) && mascotaSeleccionada
      ? [mascotaSeleccionada.nombre === 'Ave' ? formatoAves : formatoAlimento] : []),
    ...(mascotaSeleccionada?.nombre === 'Gato' && categoriaSeleccionada === 'Higiene' ? [arenasGato] : []),
  ];

  const consulta = parametros.toString();
  const filtrosConsulta = useMemo(() => {
    const url = new URLSearchParams(consulta);
    return {
      idCategoria: url.get('idCategoria') || '',
      idTipoMascota,
      idSubtipoMascota: url.get('idSubtipoMascota') || '',
      buscar: url.get('buscar') || '',
      precioMin: url.get('precioMin') || '',
      precioMax: url.get('precioMax') || '',
      marca: url.get('marca') || '',
      disponibles: url.get('disponibles') || '',
      orden: url.get('orden') || 'nombre',
      pagina: url.get('pagina') || '1',
      ...Object.fromEntries(nombresFacetas.map((nombre) => [nombre, url.get(nombre) || ''])),
    };
  }, [consulta, idTipoMascota]);

  const { datos: resultado, cargando, error, recargar } = useCargaDatos(
    () => ((mascotaUrl && cargandoFiltros) || errorFiltros || mascotaInvalida
      ? Promise.resolve(null)
      : productosApi.buscarCatalogo(filtrosConsulta)),
    [mascotaUrl, cargandoFiltros, errorFiltros, mascotaInvalida, filtrosConsulta],
  );

  const cambiarFiltros = (cambios) => {
    const siguientes = new URLSearchParams(parametros);
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor === '' || valor === null || valor === false) siguientes.delete(clave);
      else siguientes.set(clave, String(valor));
    }
    if (!Object.hasOwn(cambios, 'pagina')) siguientes.delete('pagina');
    setParametros(siguientes);
  };

  const enviarPrecio = (evento) => {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    cambiarFiltros({
      precioMin: String(datos.get('precioMin') || '').trim(),
      precioMax: String(datos.get('precioMax') || '').trim(),
    });
  };

  const cambiarPagina = (nuevaPagina) => {
    cambiarFiltros({ pagina: nuevaPagina });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const productos = resultado?.productos || [];
  const totalPaginas = resultado?.totalPaginas || 0;
  const cargandoResultado = cargando || (Boolean(mascotaUrl) && cargandoFiltros);

  return (
    <div className="pagina contenedor">
      <h1 className="titulo-pagina">Catálogo</h1>

      <div className="catalogo__filtros">
        <CategoryItem etiqueta="Todas" activo={!idCategoria} onClick={() => cambiarFiltros({ idCategoria: '' })} />
        {categorias.map((categoria) => (
          <CategoryItem
            key={categoria.idCategoria}
            etiqueta={categoria.nombre}
            activo={idCategoria === String(categoria.idCategoria)}
            onClick={() => cambiarFiltros({ idCategoria: categoria.idCategoria })}
          />
        ))}
      </div>

      <div className="catalogo__controles">
        {marcas.length > 0 && (
          <label>
            Marca
            <select value={marca} onChange={(evento) => cambiarFiltros({ marca: evento.target.value })}>
              <option value="">Todas</option>
              {marcas.map((nombre) => <option key={nombre} value={nombre}>{nombre}</option>)}
            </select>
          </label>
        )}
        <label>
          Mascota
          <select value={idTipoMascota} onChange={(evento) => cambiarFiltros({
            mascota: evento.target.value, idSubtipoMascota: '',
            ...Object.fromEntries(nombresFacetas.map((nombre) => [nombre, ''])),
          })}>
            <option value="">Todas</option>
            {mascotas.map((tipo) => <option key={tipo.idTipoMascota} value={tipo.idTipoMascota}>{tipo.nombre}</option>)}
          </select>
        </label>

        {mascotaSeleccionada?.subtipos?.length > 0 && (
          <label>
            Tipo de {mascotaSeleccionada.nombre.toLowerCase()}
            <select value={idSubtipoMascota} onChange={(evento) => cambiarFiltros({ idSubtipoMascota: evento.target.value })}>
              <option value="">Todos</option>
              {mascotaSeleccionada.subtipos.map((tipo) => (
                <option key={tipo.idTipoMascota} value={tipo.idTipoMascota}>{tipo.nombre}</option>
              ))}
            </select>
          </label>
        )}

        {filtrosEspecificos.map(([clave, etiqueta, opciones]) => (
          <label key={clave}>
            {etiqueta}
            <select value={facetas[clave]} onChange={(evento) => cambiarFiltros({ [clave]: evento.target.value })}>
              <option value="">Todos</option>
              {opciones.map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
            </select>
          </label>
        ))}

        <form className="catalogo__precios" onSubmit={enviarPrecio}>
          <label>Precio desde <input key={`min-${precioMin}`} name="precioMin" type="number" min="0" step="0.01" defaultValue={precioMin} /></label>
          <label>Hasta <input key={`max-${precioMax}`} name="precioMax" type="number" min="0" step="0.01" defaultValue={precioMax} /></label>
          <button type="submit" className="boton">Aplicar precio</button>
        </form>

        <label className="catalogo__disponibles">
          <input type="checkbox" checked={disponibles} onChange={(evento) => cambiarFiltros({ disponibles: evento.target.checked ? 'si' : '' })} />
          Solo disponibles
        </label>

        <label>
          Ordenar
          <select value={orden} onChange={(evento) => cambiarFiltros({ orden: evento.target.value })}>
            <option value="nombre">Nombre</option>
            <option value="precio-asc">Menor precio</option>
            <option value="precio-desc">Mayor precio</option>
            <option value="nuevos">Más recientes</option>
          </select>
        </label>
      </div>

      {buscar && <p className="catalogo__busqueda-activa">Resultados para «{buscar}»</p>}
      {errorFiltros && <EstadoError mensaje={errorFiltros} onReintentar={recargarFiltros} />}
      {mascotaInvalida && <EstadoVacio mensaje="No se encontró ese tipo de mascota." />}
      {cargandoResultado && !errorFiltros && <EstadoCarga mensaje="Cargando catálogo…" />}
      {error && !cargandoResultado && !errorFiltros && <EstadoError mensaje={error} onReintentar={recargar} />}
      {!cargandoResultado && !error && !errorFiltros && !mascotaInvalida && resultado && (
        <>
          <p className="catalogo__total">{resultado.total} producto{resultado.total === 1 ? '' : 's'}</p>
          {productos.length === 0 ? (
            <EstadoVacio mensaje="No se encontraron productos con esos filtros." />
          ) : (
            <div className="catalogo__grilla">
              {productos.map((producto) => <ProductCard key={producto.idProducto} producto={producto} />)}
            </div>
          )}
          {totalPaginas > 1 && (
            <nav className="catalogo__paginas" aria-label="Páginas del catálogo">
              <button type="button" disabled={resultado.pagina <= 1} onClick={() => cambiarPagina(resultado.pagina - 1)}>Anterior</button>
              <span>Página {resultado.pagina} de {totalPaginas}</span>
              <button type="button" disabled={resultado.pagina >= totalPaginas} onClick={() => cambiarPagina(resultado.pagina + 1)}>Siguiente</button>
            </nav>
          )}
        </>
      )}
    </div>
  );
};

export default Catalogo;
