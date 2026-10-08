// Pruebas directas del módulo (CU-04, corrección — revisión independiente):
// antes solo se probaba indirectamente a través de Checkout.test.jsx, que
// no llegaba a cubrir el escenario exacto reportado (localStorage.setItem
// lanza, localStorage.getItem sigue funcionando y devuelve null, y
// sessionStorage sí funciona).
//
// localStorage y sessionStorage comparten el mismo prototipo (`Storage`) en
// jsdom, así que simular una falla de UNO SOLO de los dos requiere mockear
// `Storage.prototype.setItem` distinguiendo por `this` (la instancia sobre
// la que se llamó), en vez de mockear cada objeto por separado (eso mockea
// los dos a la vez, sin distinción).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  obtenerOCrearClave,
  obtenerIntentoGuardado,
  limpiarClave,
  firmarDetalles,
} from './claveIdempotencia.js';

const detalles = [{ idProducto: 1, cantidad: 2 }];
const setItemOriginal = Storage.prototype.setItem;

const bloquearSetItemDe = (...instancias) => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (clave, valor) {
    if (instancias.includes(this)) {
      throw new DOMException('QuotaExceededError');
    }
    return setItemOriginal.call(this, clave, valor);
  });
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  // El respaldo en memoria es una variable de módulo: se limpia explícitamente
  // entre pruebas para no arrastrar estado de una prueba anterior.
  limpiarClave();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('claveIdempotencia — localStorage.setItem falla pero localStorage.getItem funciona', () => {
  it('reutiliza la misma clave en dos llamadas seguidas (no genera una segunda compra)', () => {
    bloquearSetItemDe(window.localStorage);

    const claveUno = obtenerOCrearClave(7, detalles, { metodoEntrega: 'retiro en sucursal' });
    const claveDos = obtenerOCrearClave(7, detalles, { metodoEntrega: 'retiro en sucursal' });

    expect(claveDos).toBe(claveUno);
    // localStorage.getItem nunca lanzó ni devolvió el valor: quedó en null
    // durante toda la prueba, y aun así se recuperó la misma clave — solo
    // pudo venir de sessionStorage.
    expect(localStorage.getItem('petshop_compra_en_curso')).toBeNull();
    expect(JSON.parse(sessionStorage.getItem('petshop_compra_en_curso')).clave).toBe(claveUno);
  });

  it('un reintento de una compra confirmada recupera el mismo intento (mismo usuario y carrito)', () => {
    bloquearSetItemDe(window.localStorage);

    const clave = obtenerOCrearClave(7, detalles, { metodoEntrega: 'retiro en sucursal' });

    const recuperado = obtenerIntentoGuardado(7, detalles);
    expect(recuperado).not.toBeNull();
    expect(recuperado.clave).toBe(clave);
    expect(recuperado.firma).toBe(firmarDetalles(detalles));
  });
});

describe('claveIdempotencia — recuperación de localStorage y limpieza entre niveles', () => {
  it('al volver a escribir con éxito en localStorage, limpia la copia vieja de sessionStorage', () => {
    bloquearSetItemDe(window.localStorage);
    const claveVieja = obtenerOCrearClave(7, detalles, {});
    expect(sessionStorage.getItem('petshop_compra_en_curso')).not.toBeNull();

    vi.restoreAllMocks();
    // localStorage vuelve a funcionar normalmente (simula que se liberó
    // espacio); un carrito distinto genera una clave nueva.
    const otrosDetalles = [{ idProducto: 2, cantidad: 1 }];
    const claveNueva = obtenerOCrearClave(7, otrosDetalles, {});

    expect(claveNueva).not.toBe(claveVieja);
    expect(localStorage.getItem('petshop_compra_en_curso')).not.toBeNull();
    // La entrada vieja en sessionStorage ya no debería seguir ahí: si
    // localStorage fallara de nuevo más adelante, no hay riesgo de
    // recuperar por error el intento reemplazado.
    expect(sessionStorage.getItem('petshop_compra_en_curso')).toBeNull();
  });

  it('localStorage con un intento VIEJO (otro carrito) que luego empieza a fallar al escribir: el intento nuevo en sessionStorage no queda tapado por el viejo', () => {
    // Reproduce el hallazgo de la revisión independiente: localStorage
    // funcionaba normalmente cuando se guardó el carrito viejo (firma
    // distinta, deliberadamente no limpiado — p. ej. una cotización
    // desactualizada que espera un reintento). Luego, para el carrito
    // NUEVO, localStorage.setItem empieza a fallar (cuota) pero
    // localStorage.getItem sigue devolviendo el valor viejo (no lanza, no
    // está vacío). Sin limpiar ese resto viejo, leerGuardado() lo
    // devolvería como si fuera el vigente, tapando el intento nuevo que sí
    // se pudo guardar en sessionStorage.
    const detallesViejos = [{ idProducto: 9, cantidad: 1 }];
    const claveVieja = obtenerOCrearClave(7, detallesViejos, {});
    expect(localStorage.getItem('petshop_compra_en_curso')).not.toBeNull();

    bloquearSetItemDe(window.localStorage);
    const claveNueva = obtenerOCrearClave(7, detalles, { metodoEntrega: 'retiro en sucursal' });
    expect(claveNueva).not.toBe(claveVieja);

    // El resto viejo en localStorage debe haber sido limpiado por la
    // escritura que ganó en sessionStorage — si no, seguiría ahí y
    // taparía la lectura del intento nuevo.
    expect(localStorage.getItem('petshop_compra_en_curso')).toBeNull();

    const recuperado = obtenerIntentoGuardado(7, detalles);
    expect(recuperado).not.toBeNull();
    expect(recuperado.clave).toBe(claveNueva);
  });

  it('separa intentos por usuario: un intento de otro idCliente no se devuelve', () => {
    obtenerOCrearClave(7, detalles, {});
    const recuperadoOtroUsuario = obtenerIntentoGuardado(99, detalles);
    expect(recuperadoOtroUsuario).toBeNull();
  });

  it('limpiarClave() borra el intento en localStorage Y en sessionStorage', () => {
    bloquearSetItemDe(window.localStorage);
    obtenerOCrearClave(7, detalles, {});
    expect(sessionStorage.getItem('petshop_compra_en_curso')).not.toBeNull();

    limpiarClave();

    expect(localStorage.getItem('petshop_compra_en_curso')).toBeNull();
    expect(sessionStorage.getItem('petshop_compra_en_curso')).toBeNull();
    expect(obtenerIntentoGuardado(7, detalles)).toBeNull();
  });
});

describe('claveIdempotencia — respaldo en memoria', () => {
  it('si ningún almacenamiento del navegador está disponible, sigue devolviendo la misma clave dentro de la misma carga de página', () => {
    bloquearSetItemDe(window.localStorage, window.sessionStorage);

    const claveUno = obtenerOCrearClave(7, detalles, {});
    const claveDos = obtenerOCrearClave(7, detalles, {});

    expect(claveDos).toBe(claveUno);
    expect(localStorage.getItem('petshop_compra_en_curso')).toBeNull();
    expect(sessionStorage.getItem('petshop_compra_en_curso')).toBeNull();
  });
});
