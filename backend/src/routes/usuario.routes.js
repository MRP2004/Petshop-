import { Router } from 'express';
import { registro, login, cerrarSesion, crearInterno, perfil } from '../controllers/usuario.controller.js';
import { requiereAutenticacion, requiereRol } from '../middlewares/autenticacion.middleware.js';
import limitarIntentos, { claveSoloIp } from '../middlewares/limiteIntentos.middleware.js';

const router = Router();

// Límites básicos contra fuerza bruta y registro automatizado masivo (ver
// middlewares/limiteIntentos.middleware.js para las limitaciones conocidas
// de esta implementación en memoria).
//
// Dos capas, no una: la clave por defecto (IP+email) sola dejaba pasar sin
// límite a quien prueba muchos emails distintos desde la misma IP (cada
// email arranca su propio contador en cero). La capa por IP sola es más
// laxa (para no bloquear una oficina/NAT compartida haciendo uso legítimo)
// y actúa como techo general; la capa por IP+email sigue siendo la más
// estricta para frenar rápido un ataque contra una cuenta puntual. Cada una
// de las cuatro instancias de abajo tiene su propio Map y su propia
// ventana (ver limiteIntentos.middleware.js): no hace falta namespacear
// las claves para que no se pisen entre sí, porque ya no comparten
// almacenamiento.
// Ambos máximos de login son configurables SOLO para poder relajarlos en
// backend/.env.e2e (corrección de una revisión posterior): Playwright corre
// en serie, sin reiniciar el backend, contra 2 cuentas fijas sembradas por
// scripts/sembrarDatosE2E.js, para 3 viewports — eso acumula, de forma
// legítima, más intentos de login (de ambas cuentas juntas, para el techo
// por IP; de una sola, para el límite por IP+email) que los que un ataque
// real necesitaría permitir. En desarrollo y en cualquier .env sin estas
// variables, los máximos siguen siendo los mismos de siempre (30 y 8), sin
// cambios.
const limiteLoginPorIp = limitarIntentos({
  maximo: Number(process.env.LIMITE_LOGIN_POR_IP) || 30,
  ventanaMs: 15 * 60 * 1000,
  obtenerClave: claveSoloIp,
});
const limiteLogin = limitarIntentos({
  maximo: Number(process.env.LIMITE_LOGIN) || 8,
  ventanaMs: 15 * 60 * 1000,
});

const limiteRegistroPorIp = limitarIntentos({
  maximo: 15,
  ventanaMs: 60 * 60 * 1000,
  obtenerClave: claveSoloIp,
});
const limiteRegistro = limitarIntentos({ maximo: 5, ventanaMs: 60 * 60 * 1000 });

router.post('/registro', limiteRegistroPorIp, limiteRegistro, registro);
router.post('/login', limiteLoginPorIp, limiteLogin, login);
router.post('/logout', cerrarSesion);
router.get('/perfil', requiereAutenticacion, perfil);

// Alta de cuentas internas (vendedor/administrador): solo un administrador
// ya autenticado puede crearlas. El registro público (/registro) nunca
// puede producir estos roles.
router.post('/', requiereAutenticacion, requiereRol('administrador'), crearInterno);

export default router;
