import { describe, it, expect } from 'vitest';
import { Carrito } from './Carrito.js';

const productoA = { idProducto: 1, nombre: 'Alimento perro', precio: '1000.00' };
const productoB = { idProducto: 2, nombre: 'Pelota', precio: '500.50' };

describe('Carrito', () => {
  it('empieza vacío', () => {
    const carrito = new Carrito();
    expect(carrito.estaVacio).toBe(true);
    expect(carrito.total).toBe(0);
    expect(carrito.cantidadTotal).toBe(0);
  });

  it('agregar un producto nuevo crea una línea, y es inmutable (no modifica el carrito original)', () => {
    const original = new Carrito();
    const conProducto = original.agregar(productoA, 2);

    expect(original.estaVacio).toBe(true);
    expect(conProducto.items).toHaveLength(1);
    expect(conProducto.items[0].cantidad).toBe(2);
    expect(conProducto.total).toBe(2000);
  });

  it('agregar el mismo producto dos veces suma cantidades, no duplica la línea', () => {
    let carrito = new Carrito();
    carrito = carrito.agregar(productoA, 1);
    carrito = carrito.agregar(productoA, 3);

    expect(carrito.items).toHaveLength(1);
    expect(carrito.items[0].cantidad).toBe(4);
  });

  it('actualizarCantidad a 0 o negativo quita la línea (no deja cantidades inválidas)', () => {
    let carrito = new Carrito().agregar(productoA, 2);
    carrito = carrito.actualizarCantidad(productoA.idProducto, 0);

    expect(carrito.estaVacio).toBe(true);
  });

  it('calcula el total como la suma de los subtotales de cada línea', () => {
    let carrito = new Carrito();
    carrito = carrito.agregar(productoA, 2); // 2000
    carrito = carrito.agregar(productoB, 3); // 1501.5

    expect(carrito.total).toBeCloseTo(3501.5, 2);
    expect(carrito.cantidadTotal).toBe(5);
  });

  it('aDetallesVenta produce solo {idProducto, cantidad}, forma que espera POST /api/ventas', () => {
    let carrito = new Carrito();
    carrito = carrito.agregar(productoA, 2);
    carrito = carrito.agregar(productoB, 1);

    expect(carrito.aDetallesVenta()).toEqual([
      { idProducto: 1, cantidad: 2 },
      { idProducto: 2, cantidad: 1 },
    ]);
  });

  it('desdeAlmacenamiento descarta entradas corruptas (sin producto o con cantidad inválida)', () => {
    const carrito = Carrito.desdeAlmacenamiento([
      { producto: productoA, cantidad: 2 },
      { producto: null, cantidad: 1 },
      { producto: productoB, cantidad: 0 },
      { producto: productoB, cantidad: -1 },
    ]);

    expect(carrito.items).toHaveLength(1);
    expect(carrito.items[0].producto).toBe(productoA);
  });

  it('desdeAlmacenamiento con un valor que no es arreglo devuelve un carrito vacío', () => {
    expect(Carrito.desdeAlmacenamiento(null).estaVacio).toBe(true);
    expect(Carrito.desdeAlmacenamiento('no-es-un-arreglo').estaVacio).toBe(true);
  });
});
