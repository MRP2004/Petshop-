import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import productosApi from '../api/productos.api.js';
import ImagenProducto from './ImagenProducto.jsx';
import './BuscadorPredictivo.css';

const formateador = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

// Espera breve tras la última tecla antes de pedir sugerencias (ronda 2, ver
// docs/frontend-diseno.md): ni una llamada por tecla, ni una demora
// perceptible para quien escribe a velocidad normal.
const ESPERA_DEBOUNCE_MS = 250;

// Buscador predictivo del encabezado: desde la primera letra, con imagen +
// nombre + precio real de hasta 6 coincidencias (GET /api/productos/sugerencias,
// mismas reglas de visibilidad que el catálogo público). Enter sin haber
// elegido ninguna sugerencia conserva el comportamiento anterior (deja que
// el <form> haga submit y abra /catalogo?buscar=...); Enter con una
// sugerencia activa (flechas o mouse) navega directo a esa ficha de
// producto. Patrón ARIA "combobox con listbox emergente" (no el de
// NavDropdown.jsx, que es un menú): el foco nunca sale del <input>
// (role="combobox"), las opciones se marcan como activas solo con
// aria-activedescendant, y el popup no mezcla estados (cargando/error/sin
// resultados) con role="option" — viven afuera del listbox, que solo
// contiene opciones reales (corrección de la revisión de Codex de esta
// etapa, ver docs/estado-proyecto.md).
const BuscadorPredictivo = () => {
  const [busqueda, setBusqueda] = useState('');
  const [sugerencias, setSugerencias] = useState([]);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [indiceActivo, setIndiceActivo] = useState(-1);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const navegar = useNavigate();
  const referenciaContenedor = useRef(null);
  const referenciaTimeout = useRef(null);
  const secuencia = useRef(0);

  useEffect(() => {
    const termino = busqueda.trim();

    if (referenciaTimeout.current) {
      clearTimeout(referenciaTimeout.current);
    }

    // Se invalida cualquier pedido anterior (en vuelo o todavía en el
    // debounce) apenas cambia el texto, no recién cuando el debounce
    // dispara: sin esto, un pedido viejo que sigue en vuelo (ya pasaron
    // los 250ms de SU propio debounce) podía llegar durante la ventana en
    // que el debounce del término nuevo todavía no disparó, y esa
    // respuesta vieja pasaba el chequeo de secuencia porque nadie la
    // había invalidado todavía (hallazgo real de la revisión de Codex de
    // esta etapa).
    secuencia.current += 1;
    const idActual = secuencia.current;

    if (!termino) {
      // Con el término vacío el panel no se renderiza (ver `mostrarPanel`
      // más abajo), así que no hace falta limpiar sugerencias/error a
      // mano en cada tecla borrada.
      return undefined;
    }

    referenciaTimeout.current = setTimeout(() => {
      setCargando(true);
      setError(null);
      setPanelAbierto(true);

      productosApi
        .sugerencias(termino)
        .then((resultado) => {
          if (idActual !== secuencia.current) return;
          setSugerencias(resultado);
          setIndiceActivo(-1);
          setCargando(false);
        })
        .catch(() => {
          if (idActual !== secuencia.current) return;
          setSugerencias([]);
          setIndiceActivo(-1);
          setCargando(false);
          setError('No se pudieron cargar sugerencias.');
        });
    }, ESPERA_DEBOUNCE_MS);

    return () => clearTimeout(referenciaTimeout.current);
  }, [busqueda]);

  // Cierra el panel Y cancela cualquier pedido de sugerencias pendiente
  // (el debounce todavía esperando, o uno ya en vuelo): sin esto, escribir
  // y confirmar la búsqueda (Enter/clic en "Buscar") antes de que pasen los
  // 250ms del debounce dejaba ese pedido vivo, y su respuesta reabría el
  // panel con resultados viejos varios pasos después, ya navegada la
  // página (reproducido en el E2E: la sugerencia de "Pelota" seguía
  // montada en /carrito). Bump de `secuencia` invalida también una
  // respuesta que ya esté en camino, no solo el timer.
  const cerrarPanel = () => {
    if (referenciaTimeout.current) {
      clearTimeout(referenciaTimeout.current);
    }
    secuencia.current += 1;
    setPanelAbierto(false);
    setIndiceActivo(-1);
  };

  const manejarBusqueda = (evento) => {
    evento.preventDefault();
    cerrarPanel();
    const termino = busqueda.trim();
    navegar(termino ? `/catalogo?buscar=${encodeURIComponent(termino)}` : '/catalogo');
  };

  // Único camino de selección (clic/Enter, mouse o teclado): no hay ningún
  // <Link> real dentro de una opción (ver el render más abajo, y la
  // corrección de ARIA de esta misma etapa), así que siempre hace falta
  // navegar a mano.
  const elegirSugerencia = (producto) => {
    cerrarPanel();
    setBusqueda('');
    navegar(`/productos/${producto.idProducto}`);
  };

  const manejarBlur = (evento) => {
    if (!referenciaContenedor.current?.contains(evento.relatedTarget)) {
      cerrarPanel();
    }
  };

  const manejarTeclado = (evento) => {
    if (evento.key === 'ArrowDown') {
      if (sugerencias.length === 0) return;
      evento.preventDefault();
      setPanelAbierto(true);
      setIndiceActivo((indice) => Math.min(indice + 1, sugerencias.length - 1));
    } else if (evento.key === 'ArrowUp') {
      if (sugerencias.length === 0) return;
      evento.preventDefault();
      setIndiceActivo((indice) => Math.max(indice - 1, -1));
    } else if (evento.key === 'Escape') {
      if (panelAbierto) {
        evento.preventDefault();
        cerrarPanel();
      }
    } else if (evento.key === 'Enter' && indiceActivo >= 0 && sugerencias[indiceActivo]) {
      evento.preventDefault();
      elegirSugerencia(sugerencias[indiceActivo]);
    }
  };

  const sugerenciaActivaId =
    indiceActivo >= 0 && sugerencias[indiceActivo]
      ? `navbar-sugerencia-${sugerencias[indiceActivo].idProducto}`
      : undefined;

  // Con el campo vacío no se muestra el panel aunque `panelAbierto` siga en
  // true por un foco/estado previo: evita depender de limpiar ese estado a
  // mano en cada tecla borrada (ver el efecto de arriba).
  const mostrarPanel = panelAbierto && busqueda.trim() !== '';
  const hayOpciones = !cargando && !error && sugerencias.length > 0;

  return (
    <div ref={referenciaContenedor} className="buscador-predictivo" onBlur={manejarBlur}>
      <form className="navbar__buscador" onSubmit={manejarBusqueda} role="search">
        <input
          type="search"
          placeholder="Buscar alimentos, juguetes, accesorios…"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          onKeyDown={manejarTeclado}
          onFocus={() => {
            if (sugerencias.length > 0) setPanelAbierto(true);
          }}
          aria-label="Buscar productos"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={mostrarPanel}
          aria-controls="navbar-sugerencias-listbox"
          aria-activedescendant={sugerenciaActivaId}
          autoComplete="off"
        />
        <button type="submit" className="navbar__boton-buscar" aria-label="Buscar">
          🔍
        </button>
      </form>

      {mostrarPanel && (
        <div className="buscador-predictivo__panel">
          {/* Estados (cargando/error/sin resultados) fuera del listbox: un
              listbox solo debe contener option — mezclar acá adentro
              status/alert es un patrón ARIA inválido (hallazgo de Codex). */}
          {cargando && (
            <p className="buscador-predictivo__estado" role="status">
              Buscando…
            </p>
          )}

          {!cargando && error && (
            <p className="buscador-predictivo__estado buscador-predictivo__estado--error" role="alert">
              {error}
            </p>
          )}

          {!cargando && !error && sugerencias.length === 0 && (
            <p className="buscador-predictivo__estado" role="status">
              Sin resultados para «{busqueda.trim()}»
            </p>
          )}

          {hayOpciones && (
            <ul
              className="buscador-predictivo__lista"
              role="listbox"
              id="navbar-sugerencias-listbox"
              // Sin esto, el mousedown de un clic sobre una opción le saca el
              // foco al <input> ANTES de que llegue el evento "click" (las
              // opciones ya no son <a> focosables, a diferencia de
              // NavDropdown): ese blur disparaba manejarBlur -> cerrarPanel()
              // -> el panel se desmontaba a mitad del clic, así que el click
              // nunca llegaba a ejecutar elegirSugerencia (bug real que
              // encontré al agregar la prueba de clic con mouse de esta misma
              // corrección). preventDefault en mousedown evita que el
              // navegador le saque el foco al input en primer lugar.
              onMouseDown={(evento) => evento.preventDefault()}
            >
              {sugerencias.map((producto, indice) => (
                <li
                  key={producto.idProducto}
                  id={`navbar-sugerencia-${producto.idProducto}`}
                  role="option"
                  aria-selected={indice === indiceActivo}
                  className={`buscador-predictivo__item${
                    indice === indiceActivo ? ' buscador-predictivo__item--activo' : ''
                  }`}
                  onClick={() => elegirSugerencia(producto)}
                  onMouseEnter={() => setIndiceActivo(indice)}
                >
                  <ImagenProducto
                    producto={producto}
                    claseContenedor="buscador-predictivo__imagen"
                    claseImagen="buscador-predictivo__imagen-real"
                  />
                  <span className="buscador-predictivo__nombre">{producto.nombre}</span>
                  <span className="buscador-predictivo__precio">
                    {formateador.format(Number(producto.precio))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default BuscadorPredictivo;
