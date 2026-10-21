import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProductoDetalle from './ProductoDetalle.jsx';
import { useCarrito } from '../hooks/useCarrito.js';
import productosApi from '../api/productos.api.js';

vi.mock('../hooks/useCarrito.js', () => ({ useCarrito: vi.fn() }));
vi.mock('../api/productos.api.js', () => ({
  default: { obtener: vi.fn() },
}));
vi.mock('../components/BotonFavorito.jsx', () => ({
  default: () => null,
}));

describe('ProductoDetalle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCarrito.mockReturnValue({
      agregarProducto: vi.fn(),
      cargandoCarrito: false,
      estaListo: true,
    });
    productosApi.obtener.mockResolvedValue({
      idProducto: 5,
      nombre: 'Alimento promocionado',
      precio: '1000.00',
      stockActual: 10,
      precioVigente: {
        idPromocionProducto: 8,
        porcentajeDescuento: 15,
        precioListaCentavos: 100000,
        precioFinalCentavos: 85000,
      },
    });
  });

  it('muestra el precio promocional vigente y el precio de lista anterior', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/productos/5']}>
        <Routes>
          <Route path="/productos/:id" element={<ProductoDetalle />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('15% OFF')).toBeInTheDocument();
    expect(container.querySelector('.producto-detalle__precio del')).toBeInTheDocument();
    expect(container.querySelector('.producto-detalle__precio')).toHaveTextContent(/850/);
  });
});
