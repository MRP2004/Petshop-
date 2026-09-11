import { useState } from 'react';
import { solicitar } from '../../api/httpClient.js';
import { EstadoError } from '../../components/EstadosSolicitud.jsx';

const crearUsuarioInterno = (datos) => solicitar('/usuarios', { metodo: 'POST', cuerpo: datos });

// Solo administrador (protegido por RutaProtegida en App.jsx y, sobre todo,
// por el backend: POST /api/usuarios exige rol administrador). El registro
// público nunca puede crear estos roles, ver docs/backend-autenticacion.md.
const PanelUsuarios = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState('vendedor');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [creado, setCreado] = useState(null);

  const manejarEnvio = async (evento) => {
    evento.preventDefault();
    if (enviando) return;

    setEnviando(true);
    setError(null);
    setCreado(null);

    try {
      const usuario = await crearUsuarioInterno({ email, password, rol });
      setCreado(usuario);
      setEmail('');
      setPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div>
      <h2>Cuentas internas (vendedor / administrador)</h2>

      <form className="tarjeta" style={{ padding: 20, maxWidth: 420 }} onSubmit={manejarEnvio}>
        <div className="campo">
          <label htmlFor="email">Correo electrónico</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>

        <div className="campo">
          <label htmlFor="password">Contraseña temporal</label>
          <input
            id="password"
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <div className="campo">
          <label htmlFor="rol">Rol</label>
          <select id="rol" value={rol} onChange={(e) => setRol(e.target.value)}>
            <option value="vendedor">Vendedor</option>
            <option value="administrador">Administrador</option>
          </select>
        </div>

        {error && <EstadoError mensaje={error} />}
        {creado && <p>Cuenta creada: {creado.email} ({creado.rol}).</p>}

        <button type="submit" className="boton boton-primario" disabled={enviando}>
          {enviando ? 'Creando…' : 'Crear cuenta'}
        </button>
      </form>
    </div>
  );
};

export default PanelUsuarios;
