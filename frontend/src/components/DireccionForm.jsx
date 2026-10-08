import { useCallback, useId, useMemo, useRef, useState } from 'react';
import georefApi from '../api/georef.api.js';
import { EstadoError } from './EstadosSolicitud.jsx';
import useCargaDatos from '../hooks/useCargaDatos.js';
import './DireccionForm.css';

const LIMITE_SUGERENCIAS_LOCALIDAD = 50;

// Formulario de dirección argentina estructurada (ronda 2, ver
// docs/frontend-diseno.md): provincia (select, 24 opciones estáticas) +
// localidad (combobox con filtro "empieza con" LOCAL) + calle/número
// (obligatorios) + piso/indicaciones (opcionales). No verifica que la
// vivienda exista — solo que la localidad elegida sea una real de Georef
// dentro de la provincia elegida (el backend vuelve a validar esa
// coherencia igual, por id, no solo por nombre).
//
// El filtro de localidad es LOCAL, no contra Georef en cada tecla: el
// filtro `nombre` de la API real de Georef no hace prefijo (confirmado
// contra la API real: "R"/"Ros" no encuentran "Rosario", ver
// georef.service.js) — el backend cachea la lista COMPLETA de localidades
// de la provincia elegida (un pedido, no por tecla) y este componente
// filtra "empieza con" sobre esa lista ya cargada.
//
// `valorInicial` puede ser null (Registro.jsx, cuenta nueva) o la
// dirección ya guardada (MiCuenta.jsx, para editarla).
const DireccionForm = ({ valorInicial, onGuardar, guardando = false, error = null, textoConfirmar = 'Guardar dirección' }) => {
  const idCampoLocalidad = useId();
  const idPanelLocalidad = useId();

  const { datos: provincias, cargando: cargandoProvincias, error: errorProvincias } = useCargaDatos(
    useCallback(() => georefApi.obtenerProvincias(), []),
  );

  const [provinciaElegida, setProvinciaElegida] = useState(valorInicial?.idProvincia || '');

  const {
    datos: localidades,
    cargando: cargandoLocalidades,
    error: errorLocalidades,
  } = useCargaDatos(
    useCallback(
      () => (provinciaElegida ? georefApi.obtenerLocalidades(provinciaElegida) : Promise.resolve([])),
      [provinciaElegida],
    ),
    [provinciaElegida],
  );

  const [textoLocalidad, setTextoLocalidad] = useState(valorInicial?.localidad || '');
  const [idLocalidadElegida, setIdLocalidadElegida] = useState(valorInicial?.idLocalidad || '');
  const [panelLocalidadAbierto, setPanelLocalidadAbierto] = useState(false);
  const [indiceActivo, setIndiceActivo] = useState(-1);
  const referenciaContenedorLocalidad = useRef(null);

  const [calle, setCalle] = useState(valorInicial?.calle || '');
  const [numero, setNumero] = useState(valorInicial?.numero || '');
  const [piso, setPiso] = useState(valorInicial?.piso || '');
  const [indicaciones, setIndicaciones] = useState(valorInicial?.indicaciones || '');

  // Si falló la carga de localidades de la provincia ELEGIDA ahora,
  // useCargaDatos no limpia el `datos` de la carga anterior (la de la
  // provincia previa) — sin este chequeo, un fallo de red al cambiar de
  // provincia dejaba sugerir localidades de la provincia VIEJA con el
  // campo igual habilitado (hallazgo real de la revisión de Codex de esta
  // etapa: se podía "elegir" una localidad que no corresponde a la
  // provincia mostrada; el backend lo rechaza igual, pero el formulario
  // quedaba en un estado engañoso).
  const localidadesUtilizables = errorLocalidades ? null : localidades;

  const sugerenciasLocalidad = useMemo(() => {
    const termino = textoLocalidad.trim().toLowerCase();
    if (!termino || !localidadesUtilizables) return [];
    return localidadesUtilizables
      .filter((localidad) => localidad.nombre.toLowerCase().startsWith(termino))
      .slice(0, LIMITE_SUGERENCIAS_LOCALIDAD);
  }, [textoLocalidad, localidadesUtilizables]);

  const mostrarPanelLocalidad = panelLocalidadAbierto && sugerenciasLocalidad.length > 0;

  const elegirProvincia = (evento) => {
    const nuevoId = evento.target.value;
    setProvinciaElegida(nuevoId);
    // Cambiar de provincia invalida cualquier localidad ya tipeada/elegida:
    // una localidad de una provincia no tiene sentido en otra.
    setTextoLocalidad('');
    setIdLocalidadElegida('');
    setPanelLocalidadAbierto(false);
  };

  const elegirLocalidad = (localidad) => {
    setTextoLocalidad(localidad.nombre);
    setIdLocalidadElegida(localidad.id);
    setPanelLocalidadAbierto(false);
    setIndiceActivo(-1);
  };

  const manejarCambioLocalidad = (evento) => {
    setTextoLocalidad(evento.target.value);
    setIdLocalidadElegida(''); // escribir invalida la selección previa hasta elegir una sugerencia de nuevo
    setPanelLocalidadAbierto(true);
    setIndiceActivo(-1);
  };

  const manejarBlurLocalidad = (evento) => {
    if (!referenciaContenedorLocalidad.current?.contains(evento.relatedTarget)) {
      setPanelLocalidadAbierto(false);
    }
  };

  const manejarTeclaLocalidad = (evento) => {
    if (evento.key === 'ArrowDown') {
      if (sugerenciasLocalidad.length === 0) return;
      evento.preventDefault();
      setPanelLocalidadAbierto(true);
      setIndiceActivo((indice) => Math.min(indice + 1, sugerenciasLocalidad.length - 1));
    } else if (evento.key === 'ArrowUp') {
      if (sugerenciasLocalidad.length === 0) return;
      evento.preventDefault();
      setIndiceActivo((indice) => Math.max(indice - 1, -1));
    } else if (evento.key === 'Escape') {
      setPanelLocalidadAbierto(false);
    } else if (evento.key === 'Enter' && indiceActivo >= 0 && sugerenciasLocalidad[indiceActivo]) {
      evento.preventDefault();
      elegirLocalidad(sugerenciasLocalidad[indiceActivo]);
    }
  };

  const nombreProvinciaElegida = provincias?.find((p) => p.id === provinciaElegida)?.nombre || '';
  const localidadValida = Boolean(idLocalidadElegida) && textoLocalidad.trim() !== '';
  const formularioValido =
    Boolean(provinciaElegida) && localidadValida && calle.trim() !== '' && numero.trim() !== '';

  const manejarEnvio = (evento) => {
    evento.preventDefault();
    if (!formularioValido || guardando) return;

    onGuardar({
      idProvincia: provinciaElegida,
      idLocalidad: idLocalidadElegida,
      calle: calle.trim(),
      numero: numero.trim(),
      piso: piso.trim() || undefined,
      indicaciones: indicaciones.trim() || undefined,
    });
  };

  if (cargandoProvincias) return <p>Cargando provincias…</p>;
  if (errorProvincias) return <EstadoError mensaje={errorProvincias} />;

  const sugerenciaActivaId =
    indiceActivo >= 0 && sugerenciasLocalidad[indiceActivo]
      ? `direccion-localidad-${sugerenciasLocalidad[indiceActivo].id}`
      : undefined;

  return (
    <form className="direccion-form" onSubmit={manejarEnvio}>
      <div className="campo">
        <label htmlFor="direccion-provincia">Provincia</label>
        <select id="direccion-provincia" value={provinciaElegida} onChange={elegirProvincia} required>
          <option value="">Seleccionar…</option>
          {(provincias || []).map((provincia) => (
            <option key={provincia.id} value={provincia.id}>
              {provincia.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="campo direccion-form__localidad" ref={referenciaContenedorLocalidad} onBlur={manejarBlurLocalidad}>
        <label htmlFor={idCampoLocalidad}>Localidad</label>
        <input
          id={idCampoLocalidad}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={mostrarPanelLocalidad}
          aria-controls={idPanelLocalidad}
          aria-activedescendant={sugerenciaActivaId}
          autoComplete="off"
          value={textoLocalidad}
          onChange={manejarCambioLocalidad}
          onKeyDown={manejarTeclaLocalidad}
          onFocus={() => sugerenciasLocalidad.length > 0 && setPanelLocalidadAbierto(true)}
          disabled={!provinciaElegida || cargandoLocalidades || Boolean(errorLocalidades)}
          placeholder={
            !provinciaElegida
              ? 'Elegí una provincia primero'
              : cargandoLocalidades
                ? 'Cargando localidades…'
                : `Escribí para buscar en ${nombreProvinciaElegida}…`
          }
          required
        />

        {errorLocalidades && <EstadoError mensaje={errorLocalidades} />}

        {mostrarPanelLocalidad && (
          <ul id={idPanelLocalidad} role="listbox" className="direccion-form__panel-localidad">
            {sugerenciasLocalidad.map((localidad, indice) => (
              <li
                key={localidad.id}
                id={`direccion-localidad-${localidad.id}`}
                role="option"
                aria-selected={indice === indiceActivo}
                className={`direccion-form__opcion-localidad${indice === indiceActivo ? ' direccion-form__opcion-localidad--activa' : ''}`}
                onMouseDown={(evento) => evento.preventDefault()}
                onClick={() => elegirLocalidad(localidad)}
                onMouseEnter={() => setIndiceActivo(indice)}
              >
                {localidad.nombre}
              </li>
            ))}
          </ul>
        )}

        {textoLocalidad.trim() !== '' && !localidadValida && (
          <span className="direccion-form__ayuda">Elegí una localidad de la lista.</span>
        )}
      </div>

      <div className="campo campo--linea">
        <div>
          <label htmlFor="direccion-calle">Calle</label>
          <input id="direccion-calle" type="text" value={calle} onChange={(e) => setCalle(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="direccion-numero">Número</label>
          <input id="direccion-numero" type="text" value={numero} onChange={(e) => setNumero(e.target.value)} required />
        </div>
      </div>

      <div className="campo">
        <label htmlFor="direccion-piso">Piso / Departamento (opcional)</label>
        <input id="direccion-piso" type="text" value={piso} onChange={(e) => setPiso(e.target.value)} />
      </div>

      <div className="campo">
        <label htmlFor="direccion-indicaciones">Indicaciones para la entrega (opcional)</label>
        <input
          id="direccion-indicaciones"
          type="text"
          value={indicaciones}
          onChange={(e) => setIndicaciones(e.target.value)}
        />
      </div>

      {error && <EstadoError mensaje={error} />}

      <button type="submit" className="boton boton-primario" disabled={!formularioValido || guardando}>
        {guardando ? 'Guardando…' : textoConfirmar}
      </button>
    </form>
  );
};

export default DireccionForm;
