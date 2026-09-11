import { randomBytes, timingSafeEqual } from 'node:crypto';

const generarTokenCsrf = () => randomBytes(32).toString('hex');

// Comparación en tiempo constante, igual que la verificación de contraseñas
// (ver utils/contrasenas.js): no filtrar por temporización cuánto del
// token coincide.
const coincideCsrf = (valorHeader, valorCookie) => {
  if (typeof valorHeader !== 'string' || typeof valorCookie !== 'string') {
    return false;
  }

  const bufferHeader = Buffer.from(valorHeader);
  const bufferCookie = Buffer.from(valorCookie);

  if (bufferHeader.length !== bufferCookie.length) {
    return false;
  }

  return timingSafeEqual(bufferHeader, bufferCookie);
};

export { generarTokenCsrf, coincideCsrf };
