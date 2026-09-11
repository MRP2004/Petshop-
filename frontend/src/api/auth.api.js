import { solicitar } from './httpClient.js';

const registrarse = (datos) => solicitar('/usuarios/registro', { metodo: 'POST', cuerpo: datos });

const iniciarSesion = (email, password) =>
  solicitar('/usuarios/login', { metodo: 'POST', cuerpo: { email, password } });

const cerrarSesion = () => solicitar('/usuarios/logout', { metodo: 'POST' });

const obtenerPerfil = () => solicitar('/usuarios/perfil');

export { registrarse, iniciarSesion, cerrarSesion, obtenerPerfil };
