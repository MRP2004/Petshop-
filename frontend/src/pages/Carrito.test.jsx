import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Carrito from './Carrito.jsx';
import { useCarrito } from '../hooks/useCarrito.js';
import { useAuth } from '../hooks/useAuth.js';
import productosApi from '../api/productos.api.js';

vi.mock('../hooks/useCarrito.js', () => ({ useCarrito: vi.fn() }));
vi.mock('../hooks/useAuth.js', () => ({ useAuth: vi.fn() }));
vi.mock('../api/productos.api.js', () => ({
  default: { preciosVigentes: vi.fn() },
}));

describe('Carrito', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ estaAutenticado: true });
    useCarrito.mockReturnValue({
      carrito: {
        items: [{
          producto: {
            idProducto: 5,
            nombre: 'Alimento promocionado',
            precio: '1000.00',
            stockActual: 10,
          },
          cantidad: 2,
        }],
        estaVacio: false,
      },
      actualizarCantidad: vi.fn(),
      quitarProducto: vi.fn(),
      vaciarCarrito: vi.fn(),
      cargandoCarrito: false,
      estaListo: true,
      reintentarCarga: vi.fn(),
      operacionesPendientes: 0,
    });
    productosApi.preciosVigentes.mockResolvedValue([{
      idProducto: 5,
      precioVigente: {
        idPromocionProducto: 8,
        porcentajeDescuento: 15,
        precioListaCentavos: 100000,
        precioFinalCentavos: 85000,
      },
    }]);
  });

  it('muestra el precio promocional vigente y calcula subtotal y total con el descuento', async () => {
    const { container } = render(
      <MemoryRouter>
        <Carrito />
      </MemoryRouter>,
    );

    await waitFor(() => expect(productosApi.preciosVigentes).toHaveBeenCalledWith([5]));
    expect(await screen.findByText('15% OFF')).toBeInTheDocument();
    expect(container.querySelector('.carrito__item-precio del')).toBeInTheDocument();
    expect(container.querySelector('.carrito__item-subtotal')).toHaveTextContent(/1\.700/);
    expect(container.querySelector('.carrito__total strong')).toHaveTextContent(/1\.700/);
    expect(screen.getByText(/vuelve a consultar los precios y promociones vigentes/i)).toBeInTheDocument();
  });

  it('muestra un error visible si no se pueden actualizar los precios vigentes', async () => {
    productosApi.preciosVigentes.mockRejectedValue(new Error('No hay conexión'));

    render(
      <MemoryRouter>
        <Carrito />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('No hay conexión');
  });
});
