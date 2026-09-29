import { useCallback, useState } from 'react';
import { EstadoCarga, EstadoError, EstadoVacio } from './EstadosSolicitud.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import useCargaDatos from '../hooks/useCargaDatos.js';
import './GestionEntidad.css';

// Tabla + formulario de alta/edición genéricos para el panel de gestión.
// Las seis entidades CRUD del alcance mínimo (cliente, proveedor, categoría,
// tipo de mascota, medio de pago, producto) y promoción comparten el mismo
// patrón (listar, crear, editar, borrar); en vez de escribir una pantalla
// casi idéntica por cada una, se parametriza acá una sola vez por
// "campos" (para el formulario) y "columnas" (para la tabla). Cada página
// de panel (PanelClientes.jsx, etc.) solo declara esa configuración.
//
// campo: { nombre, etiqueta, tipo: 'texto'|'numero'|'decimal'|'booleano'|'seleccion'|'fecha',
//          requerido, opciones (para 'seleccion': [{valor, etiqueta}]),
//          obtenerValor(fila) (opcional: para un campo cuyo valor actual no
//          es una propiedad plana de la fila, p. ej. producto.urlImagen
//          viene anidado en producto.imagen.url — ver PanelProductos.jsx) }
// columna: { clave, etiqueta, formatear(fila) }
const valorInicialDesdeCampo = (campo) => {
  if (campo.tipo === 'booleano') return true;
  return '';
};

const formularioVacio = (campos) =>
  Object.fromEntries(campos.map((campo) => [campo.nombre, valorInicialDesdeCampo(campo)]));

const formularioDesdeFila = (campos, fila) =>
  Object.fromEntries(
    campos.map((campo) => [
      campo.nombre,
      (campo.obtenerValor ? campo.obtenerValor(fila) : fila[campo.nombre]) ??
        valorInicialDesdeCampo(campo),
    ]),
  );

const prepararValor = (campo, valorCrudo) => {
  if (campo.tipo === 'numero' || campo.tipo === 'decimal' || (campo.tipo === 'seleccion' && campo.numerico)) {
    return valorCrudo === '' ? undefined : Number(valorCrudo);
  }
  if (campo.tipo === 'booleano') {
    return Boolean(valorCrudo);
  }
  return valorCrudo === '' ? undefined : valorCrudo;
};

const GestionEntidad = ({ titulo, servicio, campos, columnas, idCampo, renderAccionesExtra }) => {
  const { datos: filas, cargando, error, recargar } = useCargaDatos(useCallback(() => servicio.listar(), [servicio]));
  const [edicion, setEdicion] = useState(null); // null = cerrado, {} = alta, {...fila} = edición
  const [formulario, setFormulario] = useState({});
  const [errorFormulario, setErrorFormulario] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [filaABorrar, setFilaABorrar] = useState(null); // null = diálogo cerrado
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState(null);

  const abrirAlta = () => {
    setFormulario(formularioVacio(campos));
    setErrorFormulario(null);
    setEdicion({});
  };

  const abrirEdicion = (fila) => {
    setFormulario(formularioDesdeFila(campos, fila));
    setErrorFormulario(null);
    setEdicion(fila);
  };

  const cerrarFormulario = () => setEdicion(null);

  const actualizarCampo = (nombre) => (evento) => {
    const valor = evento.target.type === 'checkbox' ? evento.target.checked : evento.target.value;
    setFormulario((actual) => ({ ...actual, [nombre]: valor }));
  };

  const guardar = async (evento) => {
    evento.preventDefault();
    if (guardando) return;

    setGuardando(true);
    setErrorFormulario(null);

    const esEdicion = edicion && edicion[idCampo] !== undefined;

    // Campos marcados soloAlCrear (p. ej. el stock inicial de un producto)
    // no se mandan al editar: el backend rechaza directamente un PUT que
    // incluya esa clave (ver docs/backend-api.md), así que ni siquiera debe
    // formar parte del cuerpo de la edición.
    const datos = Object.fromEntries(
      campos
        .filter((campo) => !(esEdicion && campo.soloAlCrear))
        .map((campo) => [campo.nombre, prepararValor(campo, formulario[campo.nombre])]),
    );

    try {
      if (esEdicion) {
        await servicio.actualizar(edicion[idCampo], datos);
      } else {
        await servicio.crear(datos);
      }
      setEdicion(null);
      recargar();
    } catch (err) {
      setErrorFormulario(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const pedirBorrado = (fila) => {
    setErrorBorrado(null);
    setFilaABorrar(fila);
  };

  const cancelarBorrado = () => {
    if (borrando) return;
    setFilaABorrar(null);
    setErrorBorrado(null);
  };

  const confirmarBorrado = async () => {
    if (borrando) return;
    setBorrando(true);
    setErrorBorrado(null);
    try {
      await servicio.eliminar(filaABorrar[idCampo]);
      setFilaABorrar(null);
      recargar();
    } catch (err) {
      setErrorBorrado(err.message);
    } finally {
      setBorrando(false);
    }
  };

  return (
    <div className="gestion-entidad">
      <div className="gestion-entidad__encabezado">
        <h2>{titulo}</h2>
        <button type="button" className="boton boton-primario" onClick={abrirAlta}>
          + Nuevo
        </button>
      </div>

      {cargando && <EstadoCarga />}
      {error && <EstadoError mensaje={error} onReintentar={recargar} />}
      {!cargando && !error && filas?.length === 0 && <EstadoVacio />}

      {!cargando && !error && filas?.length > 0 && (
        <div className="gestion-entidad__tabla-scroll">
          <table className="gestion-entidad__tabla">
            <thead>
              <tr>
                {columnas.map((columna) => (
                  <th key={columna.clave}>{columna.etiqueta}</th>
                ))}
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={fila[idCampo]}>
                  {columnas.map((columna) => (
                    <td key={columna.clave}>
                      {columna.formatear ? columna.formatear(fila) : String(fila[columna.clave] ?? '')}
                    </td>
                  ))}
                  <td className="gestion-entidad__acciones">
                    <button type="button" className="boton-enlace" onClick={() => abrirEdicion(fila)}>
                      Editar
                    </button>
                    <button type="button" className="boton-enlace" onClick={() => pedirBorrado(fila)}>
                      Eliminar
                    </button>
                    {renderAccionesExtra && renderAccionesExtra(fila, recargar)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {edicion !== null && (
        <div className="gestion-entidad__modal" role="dialog" aria-modal="true">
          <form className="gestion-entidad__formulario tarjeta" onSubmit={guardar}>
            <h3>{edicion[idCampo] !== undefined ? 'Editar' : 'Nuevo'} — {titulo}</h3>

            {campos
              .filter((campo) => !(edicion[idCampo] !== undefined && campo.soloAlCrear))
              .map((campo) => (
              <div className="campo" key={campo.nombre}>
                <label htmlFor={campo.nombre}>{campo.etiqueta}</label>

                {campo.tipo === 'booleano' ? (
                  <input
                    id={campo.nombre}
                    type="checkbox"
                    checked={Boolean(formulario[campo.nombre])}
                    onChange={actualizarCampo(campo.nombre)}
                  />
                ) : campo.tipo === 'seleccion' ? (
                  <select
                    id={campo.nombre}
                    value={formulario[campo.nombre] ?? ''}
                    onChange={actualizarCampo(campo.nombre)}
                    required={campo.requerido}
                  >
                    <option value="">—</option>
                    {campo.opciones.map((opcion) => (
                      <option key={opcion.valor} value={opcion.valor}>
                        {opcion.etiqueta}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={campo.nombre}
                    type={
                      campo.tipo === 'numero' || campo.tipo === 'decimal'
                        ? 'number'
                        : campo.tipo === 'fecha'
                          ? 'date'
                          : 'text'
                    }
                    step={campo.tipo === 'decimal' ? '0.01' : undefined}
                    value={formulario[campo.nombre] ?? ''}
                    onChange={actualizarCampo(campo.nombre)}
                    required={campo.requerido}
                  />
                )}
              </div>
            ))}

            {errorFormulario && <EstadoError mensaje={errorFormulario} />}

            <div className="gestion-entidad__formulario-acciones">
              <button type="button" className="boton boton-secundario" onClick={cerrarFormulario}>
                Cancelar
              </button>
              <button type="submit" className="boton boton-primario" disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        abierto={filaABorrar !== null}
        titulo="¿Eliminar este registro?"
        mensaje="Esta acción no se puede deshacer."
        textoConfirmar={borrando ? 'Eliminando…' : 'Eliminar'}
        textoCancelar="Cancelar"
        peligro
        cargando={borrando}
        error={errorBorrado}
        onConfirmar={confirmarBorrado}
        onCancelar={cancelarBorrado}
      />
    </div>
  );
};

export default GestionEntidad;
