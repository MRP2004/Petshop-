import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CarritoProvider } from './CarritoContext.jsx';
import { useCarrito } from '../hooks/useCarrito.js';
import { useAuth } from '../hooks/useAuth.js';
import carritoApi from '../api/carrito.api.js';

vi.mock('../hooks/useAuth.js', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../api/carrito.api.js', () => ({
  default: {
    listar: vi.fn(),
    agregar: vi.fn(),
    actualizarCantidad: vi.fn(),
    quitar: vi.fn(),
    vaciar: vi.fn(),
    importar: vi.fn(),
  },
}));

const productoAnonimo = {
  idProducto: 1,
  nombre: 'Producto anónimo',
  precio: '100.00',
  stockActual: 5,
};

const productoCuentaA = {
  idProducto: 2,
  nombre: 'Producto de Ana',
  precio: '200.00',
  stockActual: 5,
};

const productoCuentaB = {
  idProducto: 3,
  nombre: 'Producto de Beto',
  precio: '300.00',
  stockActual: 5,
};

let sesion;

const ConsumidorCarrito = () => {
  const {
    carrito,
    agregarProducto,
    actualizarCantidad,
    quitarProducto,
    vaciarCarrito,
    estaListo,
    cargandoCarrito,
  } = useCarrito();

  return (
    <section>
      <span data-testid="estado">
        {cargandoCarrito ? 'cargando' : estaListo ? 'listo' : 'error'}
      </span>
      <span data-testid="carrito">
        {carrito.items.map((item) => `${item.producto.nombre}:${item.cantidad}`).join(',')}
      </span>
      <button type="button" onClick={() => agregarProducto(productoAnonimo, 2)}>Agregar</button>
      <button type="button" onClick={() => actualizarCantidad(1, 4)}>Actualizar</button>
      <button type="button" onClick={() => quitarProducto(1)}>Quitar</button>
      <button type="button" onClick={vaciarCarrito}>Vaciar</button>
    </section>
  );
};

const renderizar = () =>
  render(
    <CarritoProvider>
      <ConsumidorCarrito />
    </CarritoProvider>,
  );

const respuesta = (producto, cantidad) => ({
  items: [{ producto, cantidad }],
});

describe('CarritoContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sesion = { usuario: null, cargandoSesion: false };
    useAuth.mockImplementation(() => sesion);
    carritoApi.listar.mockResolvedValue({ items: [] });
    carritoApi.agregar.mockResolvedValue(respuesta(productoAnonimo, 2));
    carritoApi.actualizarCantidad.mockResolvedValue(respuesta(productoAnonimo, 4));
    carritoApi.quitar.mockResolvedValue({ items: [] });
    carritoApi.vaciar.mockResolvedValue(null);
    carritoApi.importar.mockImplementation(async (items) => ({
      importado: true,
      items: items.map(({ idProducto, cantidad }) => ({
        producto: idProducto === productoAnonimo.idProducto ? productoAnonimo : productoCuentaA,
        cantidad,
      })),
    }));
  });

  it('carga y persiste el carrito anónimo en el navegador', async () => {
    localStorage.setItem(
      'petshop_carrito',
      JSON.stringify([{ producto: productoAnonimo, cantidad: 1 }]),
    );

    renderizar();

    expect(await screen.findByTestId('estado')).toHaveTextContent('listo');
    expect(screen.getByTestId('carrito')).toHaveTextContent('Producto anónimo:1');
    expect(carritoApi.listar).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(screen.getByTestId('carrito')).toHaveTextContent(
      'Producto anónimo:3',
    );
    expect(JSON.parse(localStorage.getItem('petshop_carrito'))[0].cantidad).toBe(3);
  });

  it('importa el carrito anónimo al iniciar sesión si la cuenta no tiene productos', async () => {
    localStorage.setItem(
      'petshop_carrito',
      JSON.stringify([{ producto: productoAnonimo, cantidad: 2 }]),
    );
    sesion = {
      usuario: { idUsuario: 10, rol: 'cliente', idCliente: 20 },
      cargandoSesion: false,
    };

    renderizar();

    expect(await screen.findByTestId('carrito')).toHaveTextContent(
      'Producto anónimo:2',
    );
    expect(carritoApi.importar).toHaveBeenCalledWith([
      { idProducto: productoAnonimo.idProducto, cantidad: 2 },
    ]);
    expect(localStorage.getItem('petshop_carrito')).toBeNull();
  });

  it('descarta el carrito anónimo si la cuenta ya tiene su propio carrito', async () => {
    localStorage.setItem(
      'petshop_carrito',
      JSON.stringify([{ producto: productoAnonimo, cantidad: 1 }]),
    );
    carritoApi.listar.mockResolvedValue(respuesta(productoCuentaA, 3));
    sesion = {
      usuario: { idUsuario: 10, rol: 'cliente', idCliente: 20 },
      cargandoSesion: false,
    };

    renderizar();

    expect(await screen.findByTestId('carrito')).toHaveTextContent(
      'Producto de Ana:3',
    );
    expect(carritoApi.importar).not.toHaveBeenCalled();
    expect(localStorage.getItem('petshop_carrito')).toBeNull();
  });

  it('no muestra el carrito anterior mientras cambia de cuenta y luego carga el de la nueva', async () => {
    carritoApi.listar
      .mockResolvedValueOnce(respuesta(productoCuentaA, 2))
      .mockImplementationOnce(() => new Promise((resolve) => {
        window.resolverCarritoB = resolve;
      }));
    sesion = {
      usuario: { idUsuario: 10, rol: 'cliente', idCliente: 20 },
      cargandoSesion: false,
    };
    const vista = renderizar();

    expect(await screen.findByTestId('carrito')).toHaveTextContent(
      'Producto de Ana:2',
    );

    sesion = {
      usuario: { idUsuario: 11, rol: 'administrador', idCliente: null },
      cargandoSesion: false,
    };
    vista.rerender(
      <CarritoProvider>
        <ConsumidorCarrito />
      </CarritoProvider>,
    );

    await waitFor(() => expect(carritoApi.listar).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('estado')).toHaveTextContent('cargando');
    expect(screen.getByTestId('carrito')).not.toHaveTextContent('Producto de Ana');

    window.resolverCarritoB(respuesta(productoCuentaB, 5));
    expect(await screen.findByTestId('carrito')).toHaveTextContent(
      'Producto de Beto:5',
    );
    delete window.resolverCarritoB;
  });

  it('al cerrar sesión limpia el carrito local, pero no borra el carrito de la cuenta', async () => {
    sesion = {
      usuario: { idUsuario: 10, rol: 'cliente', idCliente: 20 },
      cargandoSesion: false,
    };
    const vista = renderizar();
    expect(await screen.findByTestId('estado')).toHaveTextContent('listo');

    sesion = { usuario: null, cargandoSesion: false };
    vista.rerender(
      <CarritoProvider>
        <ConsumidorCarrito />
      </CarritoProvider>,
    );

    expect(await screen.findByTestId('carrito')).toBeEmptyDOMElement();
    expect(localStorage.getItem('petshop_carrito')).toBeNull();
    expect(carritoApi.vaciar).not.toHaveBeenCalled();
  });

  it('si falla la carga, avisa y permite reintentar sin descartar el carrito anónimo', async () => {
    localStorage.setItem(
      'petshop_carrito',
      JSON.stringify([{ producto: productoAnonimo, cantidad: 1 }]),
    );
    carritoApi.listar
      .mockRejectedValueOnce(new Error('No se pudo conectar'))
      .mockResolvedValueOnce({ items: [] });
    sesion = {
      usuario: { idUsuario: 10, rol: 'cliente', idCliente: 20 },
      cargandoSesion: false,
    };

    renderizar();

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar');
    expect(localStorage.getItem('petshop_carrito')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByTestId('estado')).toHaveTextContent('listo');
    expect(carritoApi.importar).toHaveBeenCalledWith([
      { idProducto: productoAnonimo.idProducto, cantidad: 1 },
    ]);
  });

  it('persiste las operaciones de una cuenta en la API, no en localStorage', async () => {
    sesion = {
      usuario: { idUsuario: 10, rol: 'vendedor', idCliente: null },
      cargandoSesion: false,
    };
    renderizar();
    expect(await screen.findByTestId('estado')).toHaveTextContent('listo');

    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(await screen.findByTestId('carrito')).toHaveTextContent(
      'Producto anónimo:2',
    );
    expect(carritoApi.agregar).toHaveBeenCalledWith(1, 2);
    expect(localStorage.getItem('petshop_carrito')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(await screen.findByTestId('carrito')).toHaveTextContent(
      'Producto anónimo:4',
    );
    expect(carritoApi.actualizarCantidad).toHaveBeenCalledWith(1, 4);

    await userEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(await screen.findByTestId('carrito')).toBeEmptyDOMElement();
    expect(carritoApi.quitar).toHaveBeenCalledWith(1);

    await userEvent.click(screen.getByRole('button', { name: 'Vaciar' }));
    expect(carritoApi.vaciar).toHaveBeenCalledOnce();
  });

  it('muestra errores de escritura en vez de presentar un guardado fallido como exitoso', async () => {
    sesion = {
      usuario: { idUsuario: 10, rol: 'cliente', idCliente: 20 },
      cargandoSesion: false,
    };
    carritoApi.agregar.mockRejectedValue(new Error('No se pudo guardar el producto'));
    renderizar();
    expect(await screen.findByTestId('estado')).toHaveTextContent('listo');

    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo guardar el producto',
    );
    expect(screen.getByTestId('carrito')).toBeEmptyDOMElement();
  });

  it('avisa si el navegador no permite persistir el carrito anónimo y lo conserva en memoria', async () => {
    renderizar();
    expect(await screen.findByTestId('estado')).toHaveTextContent('listo');
    const guardar = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Almacenamiento bloqueado');
    });

    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo guardar el carrito en este navegador',
    );
    expect(screen.getByTestId('carrito')).toHaveTextContent(
      'Producto anónimo:2',
    );
    guardar.mockRestore();
  });
});
