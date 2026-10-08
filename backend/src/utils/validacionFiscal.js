import AppError from '../errors/AppError.js';

// Validación de CUIL/CUIT (ronda 2, Etapa 8 — marketplace): SOLO formato y
// dígito verificador (algoritmo módulo 11 real, el mismo que usa AFIP para
// emitir el número). Esto NO verifica que el CUIL/CUIT exista de verdad ni
// que esté al día ante AFIP — no hay ninguna integración con un servicio
// fiscal externo real en este proyecto. Documentado explícitamente: "no
// verifica existencia fiscal real", ver docs/estado-proyecto.md.
//
// Ponderadores fijos del algoritmo real: 5,4,3,2,7,6,5,4,3,2 sobre los
// primeros 10 dígitos; el dígito 11 es el verificador. Casos especiales
// reales del algoritmo (no una simplificación propia): resto=0 → dígito 0;
// resto=1 → dígito 9 (en la práctica real, esto se resuelve con un prefijo
// alternativo — acá simplemente se acepta 9 como válido para ese caso, sin
// inventar la lógica de sustitución de prefijo, que excede lo que hace
// falta para validar un dígito verificador).
const PONDERADORES = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

// Quita puntos, guiones y espacios — el formato real que ingresa una
// persona ("20-17254359-7") no es el que se valida dígito por dígito.
const normalizarNumeroDocumento = (valorCrudo) => {
  if (typeof valorCrudo !== 'string') return '';
  return valorCrudo.replace(/[.\-\s]/g, '');
};

const calcularDigitoVerificador = (primerosDiez) => {
  const suma = primerosDiez.reduce(
    (acumulado, digito, indice) => acumulado + digito * PONDERADORES[indice],
    0,
  );

  const resto = suma % 11;
  const digito = 11 - resto;

  if (digito === 11) return 0;
  if (digito === 10) return 9;
  return digito;
};

// Verdadero/falso, sin lanzar — para usarse tanto en validación de
// solicitudes (que sí lanza AppError con mensaje) como en pruebas unitarias
// del algoritmo en sí, sin acoplarlas al mensaje de error.
const esCuilCuitValido = (valorCrudo) => {
  const normalizado = normalizarNumeroDocumento(valorCrudo);

  if (!/^\d{11}$/.test(normalizado)) {
    return false;
  }

  const digitos = normalizado.split('').map(Number);
  const primerosDiez = digitos.slice(0, 10);
  const verificadorReal = digitos[10];

  return calcularDigitoVerificador(primerosDiez) === verificadorReal;
};

// Valida y devuelve el número YA normalizado (sin puntos/guiones/espacios),
// listo para persistir — mismo criterio que el resto de las validaciones
// del proyecto (rechazar con AppError 400, no devolver un booleano acá).
const validarCuilCuit = (valorCrudo, nombreCampo = 'El CUIL/CUIT') => {
  const normalizado = normalizarNumeroDocumento(valorCrudo);

  if (!esCuilCuitValido(normalizado)) {
    throw new AppError(
      `${nombreCampo} no es válido (formato o dígito verificador incorrecto)`,
      400,
    );
  }

  return normalizado;
};

export { normalizarNumeroDocumento, esCuilCuitValido, validarCuilCuit };
