import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ProductCard from './ProductCard.jsx';
import { CarritoProvider } from '../context/CarritoContext.jsx';
import { AuthProvider } from '../context/AuthContext.jsx';
import { FavoritosProvider } from '../context/FavoritosContext.jsx';
import { useCarrito } from '../hooks/useCarrito.js';
import * as authApi from '../api/auth.api.js';

// ProductCard incluye BotonFavorito (ronda 2): necesita AuthProvider +
// FavoritosProvider alrededor. Sin sesión (mock por defecto, más abajo), el
// botón queda deshabilitado y favoritosApi nunca se llama — no hace falta
// mockear favoritos.api.js para estas pruebas, que no verifican favoritos.
vi.mock('../api/auth.api.js', () => ({
  obtenerPerfil: vi.fn(),
  iniciarSesion: vi.fn(),
  registrarse: vi.fn(),
  cerrarSesion: vi.fn(),
}));

const producto = {
  idProducto: 1,
  nombre: 'Alimento perro adulto 15kg',
  precio: '25999.00',
  stockActual: 10,
};

// Componente auxiliar solo para exponer la cantidad de items del carrito en
// el DOM y poder comprobar, en el test, que "Agregar al carrito" realmente
// actualiza el estado compartido (reactividad ante un evento del usuario).
const ContadorDeCarrito = () => {
  const { carrito } = useCarrito();
  return <span data-testid="cantidad-carrito">{carrito.cantidadTotal}</span>;
};

const renderizar = (productoAMostrar) =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <CarritoProvider>
          <FavoritosProvider>
            <ContadorDeCarrito />
            <ProductCard producto={productoAMostrar} />
          </FavoritosProvider>
        </CarritoProvider>
      </AuthProvider>
    </MemoryRouter>,
  );

describe('ProductCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authApi.obtenerPerfil.mockRejectedValue(new Error('sin sesión'));
  });

  it('muestra nombre, precio formateado y disponibilidad', async () => {
    renderizar(producto);
    await screen.findByRole('button', { name: /favoritos/i });

    expect(screen.getByText('Alimento perro adulto 15kg')).toBeInTheDocument();
    expect(screen.getByText(/25\.999/)).toBeInTheDocument();
    expect(screen.getByText(/Disponible \(10\)/)).toBeInTheDocument();
  });

  it('al hacer click en "Agregar al carrito" suma un item al carrito (evento de usuario + reactividad)', async () => {
    renderizar(producto);

    expect(screen.getByTestId('cantidad-carrito')).toHaveTextContent('0');

    await userEvent.click(screen.getByRole('button', { name: /Agregar al carrito/i }));

    expect(screen.getByTestId('cantidad-carrito')).toHaveTextContent('1');
  });

  it('sin stock, el botón de agregar está deshabilitado y avisa "Sin stock"', async () => {
    renderizar({ ...producto, stockActual: 0 });
    await screen.findByRole('button', { name: /favoritos/i });

    expect(screen.getByText('Sin stock')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Agregar al carrito/i })).toBeDisabled();
  });

  // Ronda 2, Etapa 8 (marketplace): "Vendido por: X" cuando el producto es
  // de un vendedor independiente; nada para el catálogo propio de PetShop.
  it('con tienda, muestra "Vendido por"', async () => {
    renderizar({ ...producto, tienda: { idTienda: 5, nombre: 'Tienda de Ana' } });
    await screen.findByRole('button', { name: /favoritos/i });

    expect(screen.getByText('Vendido por: Tienda de Ana')).toBeInTheDocument();
  });

  it('sin tienda (catálogo de PetShop), no muestra "Vendido por"', async () => {
    renderizar(producto);
    await screen.findByRole('button', { name: /favoritos/i });

    expect(screen.queryByText(/Vendido por/)).not.toBeInTheDocument();
  });
});
