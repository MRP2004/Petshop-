// Modelo del carrito de compras: encapsula sus propias reglas (no permitir
// cantidades inválidas, calcular subtotales/total, no duplicar un producto
// como dos líneas) en vez de dejar que cada componente las reimplemente.
// Inmutable a propósito: cada operación devuelve un Carrito nuevo, para que
// encaje naturalmente con el estado de React (useState) sin mutaciones
// ocultas que compliquen la reactividad.
class ItemCarrito {
  constructor(producto, cantidad) {
    this.producto = producto;
    this.cantidad = cantidad;
  }

  get subtotal() {
    return Number(this.producto.precio) * this.cantidad;
  }
}

class Carrito {
  constructor(items = []) {
    this.items = items;
  }

  agregar(producto, cantidad = 1) {
    const existente = this.items.find((item) => item.producto.idProducto === producto.idProducto);

    if (existente) {
      return this.actualizarCantidad(producto.idProducto, existente.cantidad + cantidad);
    }

    return new Carrito([...this.items, new ItemCarrito(producto, cantidad)]);
  }

  actualizarCantidad(idProducto, cantidad) {
    if (cantidad <= 0) {
      return this.quitar(idProducto);
    }

    return new Carrito(
      this.items.map((item) =>
        item.producto.idProducto === idProducto ? new ItemCarrito(item.producto, cantidad) : item,
      ),
    );
  }

  quitar(idProducto) {
    return new Carrito(this.items.filter((item) => item.producto.idProducto !== idProducto));
  }

  vaciar() {
    return new Carrito([]);
  }

  get cantidadTotal() {
    return this.items.reduce((total, item) => total + item.cantidad, 0);
  }

  get total() {
    return this.items.reduce((total, item) => total + item.subtotal, 0);
  }

  get estaVacio() {
    return this.items.length === 0;
  }

  // Forma mínima que se necesita al confirmar la compra (POST /api/ventas):
  // el precio lo vuelve a validar el backend contra lo persistido, así que
  // acá alcanza con id y cantidad.
  aDetallesVenta() {
    return this.items.map((item) => ({
      idProducto: item.producto.idProducto,
      cantidad: item.cantidad,
    }));
  }

  // Persistencia liviana en localStorage (por navegador, no sincronizada
  // entre dispositivos ni con el backend: es solo conveniencia de UI).
  static desdeAlmacenamiento(datosGuardados) {
    if (!Array.isArray(datosGuardados)) {
      return new Carrito();
    }

    const items = datosGuardados
      .filter((item) => item && item.producto && Number.isInteger(item.cantidad) && item.cantidad > 0)
      .map((item) => new ItemCarrito(item.producto, item.cantidad));

    return new Carrito(items);
  }
}

export { Carrito, ItemCarrito };
