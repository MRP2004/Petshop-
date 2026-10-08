import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { EstadoError } from '../components/EstadosSolicitud.jsx';
import DireccionForm from '../components/DireccionForm.jsx';
import clientesApi from '../api/clientes.api.js';
import './FormularioAuth.css';

// El registro público SIEMPRE crea una cuenta 'cliente' (lo decide el
// backend, no este formulario: no hay ningún campo de rol acá, ni podría
// haberlo). Ver docs/backend-autenticacion.md.
const Registro = () => {
  const { registrarse } = useAuth();
  const navegar = useNavigate();

  const [datos, setDatos] = useState({
    nombre: '',
    apellido: '',
    email: '',
    password: '',
    telefono: '',
  });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  // Ronda 2 (dirección argentina + Georef, ver docs/frontend-diseno.md): la
  // cuenta se crea PRIMERO (email/password/nombre/apellido, sin cambios), y
  // la dirección es un paso SEPARADO después, opcional — no se puede meter
  // el <DireccionForm> adentro de este <form> (HTML no permite forms
  // anidados), y de todos modos el pedido es explícito: "los clientes
  // existentes deben... poder completar la dirección posteriormente", así
  // que "saltear por ahora" tiene que ser una salida real, no decorativa.
  const [cuentaCreada, setCuentaCreada] = useState(false);
  const [guardandoDireccion, setGuardandoDireccion] = useState(false);
  const [errorDireccion, setErrorDireccion] = useState(null);

  const actualizarCampo = (campo) => (evento) =>
    setDatos((actual) => ({ ...actual, [campo]: evento.target.value }));

  const manejarEnvio = async (evento) => {
    evento.preventDefault();
    if (enviando) return;

    setEnviando(true);
    setError(null);

    try {
      await registrarse(datos);
      setCuentaCreada(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const irAlInicio = () => navegar('/', { replace: true });

  const guardarDireccion = async (datosDireccion) => {
    setGuardandoDireccion(true);
    setErrorDireccion(null);
    try {
      await clientesApi.guardarDireccion(datosDireccion);
      irAlInicio();
    } catch (err) {
      setErrorDireccion(err.message);
    } finally {
      setGuardandoDireccion(false);
    }
  };

  if (cuentaCreada) {
    return (
      <div className="pagina contenedor formulario-auth">
        <h1 className="titulo-pagina">¡Cuenta creada!</h1>
        <p>
          Podés agregar tu dirección ahora para que el checkout la tenga lista, o
          completarla más tarde desde Mi cuenta.
        </p>

        <div className="tarjeta formulario-auth__form">
          <DireccionForm
            onGuardar={guardarDireccion}
            guardando={guardandoDireccion}
            error={errorDireccion}
            textoConfirmar="Guardar dirección"
          />
        </div>

        <button type="button" className="boton-enlace formulario-auth__enlace" onClick={irAlInicio}>
          Completar más tarde
        </button>
      </div>
    );
  }

  return (
    <div className="pagina contenedor formulario-auth">
      <h1 className="titulo-pagina">Crear cuenta</h1>

      <form className="tarjeta formulario-auth__form" onSubmit={manejarEnvio}>
        <div className="campo">
          <label htmlFor="nombre">Nombre</label>
          <input id="nombre" value={datos.nombre} onChange={actualizarCampo('nombre')} required />
        </div>

        <div className="campo">
          <label htmlFor="apellido">Apellido</label>
          <input id="apellido" value={datos.apellido} onChange={actualizarCampo('apellido')} required />
        </div>

        <div className="campo">
          <label htmlFor="email">Correo electrónico</label>
          <input id="email" type="email" value={datos.email} onChange={actualizarCampo('email')} required />
        </div>

        <div className="campo">
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            minLength={8}
            value={datos.password}
            onChange={actualizarCampo('password')}
            required
          />
        </div>

        <div className="campo">
          <label htmlFor="telefono">Teléfono (opcional)</label>
          <input id="telefono" value={datos.telefono} onChange={actualizarCampo('telefono')} />
        </div>

        {error && <EstadoError mensaje={error} />}

        <button type="submit" className="boton boton-primario" disabled={enviando}>
          {enviando ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>

        <p className="formulario-auth__enlace">
          ¿Ya tenés cuenta? <Link to="/iniciar-sesion">Iniciá sesión</Link>
        </p>
      </form>
    </div>
  );
};

export default Registro;
