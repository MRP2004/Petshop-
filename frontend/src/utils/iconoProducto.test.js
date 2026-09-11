import { describe, it, expect } from 'vitest';
import obtenerIconoProducto from './iconoProducto.js';

describe('obtenerIconoProducto', () => {
  it('devuelve un ícono de comida para la categoría "Alimento"', () => {
    expect(obtenerIconoProducto({ categoria: { nombre: 'Alimento' } })).toBe('🍖');
  });

  it('devuelve un ícono de pelota para "Juguetes"', () => {
    expect(obtenerIconoProducto({ categoria: { nombre: 'Juguetes' } })).toBe('🎾');
  });

  it('devuelve un ícono de higiene para "Higiene"', () => {
    expect(obtenerIconoProducto({ categoria: { nombre: 'Higiene' } })).toBe('🧴');
  });

  it('devuelve el ícono por defecto cuando no hay categoría', () => {
    expect(obtenerIconoProducto({ categoria: null })).toBe('🐾');
    expect(obtenerIconoProducto({})).toBe('🐾');
    expect(obtenerIconoProducto(undefined)).toBe('🐾');
  });

  it('devuelve el ícono por defecto para una categoría sin palabra clave reconocida', () => {
    expect(obtenerIconoProducto({ categoria: { nombre: 'Accesorios varios' } })).toBe('🐾');
  });
});
