import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { EstadoError } from '../components/EstadosSolicitud.jsx';
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

  const actualizarCampo = (campo) => (evento) =>
    setDatos((actual) => ({ ...actual, [campo]: evento.target.value }));

  const manejarEnvio = async (evento) => {
    evento.preventDefault();
    if (enviando) return;

    setEnviando(true);
    setError(null);

    try {
      await registrarse(datos);
      navegar('/', { replace: true });
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  };

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
