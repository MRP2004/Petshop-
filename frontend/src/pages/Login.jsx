import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { EstadoError } from '../components/EstadosSolicitud.jsx';
import './FormularioAuth.css';

const Login = () => {
  const { iniciarSesion } = useAuth();
  const navegar = useNavigate();
  const ubicacion = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const manejarEnvio = async (evento) => {
    evento.preventDefault();
    if (enviando) return;

    setEnviando(true);
    setError(null);

    try {
      await iniciarSesion(email, password);
      const destino = ubicacion.state?.desde?.pathname || '/';
      navegar(destino, { replace: true });
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  };

  return (
    <div className="pagina contenedor formulario-auth">
      <h1 className="titulo-pagina">Iniciar sesión</h1>

      <form className="tarjeta formulario-auth__form" onSubmit={manejarEnvio}>
        <div className="campo">
          <label htmlFor="email">Correo electrónico</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
            required
          />
        </div>

        <div className="campo">
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(evento) => setPassword(evento.target.value)}
            required
          />
        </div>

        {error && <EstadoError mensaje={error} />}

        <button type="submit" className="boton boton-primario" disabled={enviando}>
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>

        <p className="formulario-auth__enlace">
          ¿No tenés cuenta? <Link to="/registro">Registrate</Link>
        </p>
      </form>
    </div>
  );
};

export default Login;
