import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// Hash de contraseñas con scrypt (biblioteca estándar de Node, no una
// implementación propia de criptografía). Se usa scrypt en vez de bcrypt
// para no agregar una dependencia nueva: node:crypto ya la incluye.
const scrypt = promisify(scryptCallback);

const LONGITUD_SAL = 16;
const LONGITUD_HASH = 64;

// Formato persistido: "sal_hex:hash_hex", ambos en hexadecimal.
const hashearContrasena = async (contrasenaPlana) => {
  const sal = randomBytes(LONGITUD_SAL);
  const derivado = await scrypt(contrasenaPlana, sal, LONGITUD_HASH);

  return `${sal.toString('hex')}:${derivado.toString('hex')}`;
};

// Comparación en tiempo constante para no filtrar por temporización cuánto
// del hash coincide.
const verificarContrasena = async (contrasenaPlana, hashAlmacenado) => {
  const [salHex, hashHex] = String(hashAlmacenado).split(':');

  if (!salHex || !hashHex) {
    return false;
  }

  const sal = Buffer.from(salHex, 'hex');
  const hashEsperado = Buffer.from(hashHex, 'hex');
  const hashCalculado = await scrypt(contrasenaPlana, sal, hashEsperado.length);

  if (hashCalculado.length !== hashEsperado.length) {
    return false;
  }

  return timingSafeEqual(hashCalculado, hashEsperado);
};

export { hashearContrasena, verificarContrasena };
