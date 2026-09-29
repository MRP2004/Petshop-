import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Favoritos from './Favoritos.jsx';
import { AuthProvider } from '../context/AuthContext.jsx';
import { CarritoProvider } from '../context/CarritoContext.jsx';
import { FavoritosProvider } from '../context/FavoritosContext.jsx';
import * as authApi from '../api/auth.api.js';
import favoritosApi from '../api/favoritos.api.js';

vi.mock('../api/auth.api.js', () => ({
  obtenerPerfil: vi.fn(),
  iniciarSesion: vi.fn(),
  registrarse: vi.fn(),
  cerrarSesion: vi.fn(),
}));

vi.mock('../api/favoritos.api.js', () => ({
  default: {
    listar: vi.fn(),
    agregar: vi.fn(),
    quitar: vi.fn(),
  },
}));

const renderizar = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <CarritoProvider>
          <FavoritosProvider>
            <Favoritos />
          </FavoritosProvider>
        </CarritoProvider>
      </AuthProvider>
    </MemoryRouter>,
  );

describe('Favoritos (página)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authApi.obtenerPerfil.mockResolvedValue({ idUsuario: 1, rol: 'cliente', idCliente: 7 });
  });

  it('sin favoritos, muestra el estado vacío con un enlace al catálogo', async () => {
    favoritosApi.listar.mockResolvedValue([]);
    renderizar();

    expect(await screen.findByText(/Todavía no marcaste ningún producto/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ir al catálogo/i })).toBeInTheDocument();
  });

  it('con favoritos, muestra una tarjeta por cada producto', async () => {
    favoritosApi.listar.mockResolvedValue([
      { idProducto: 1, nombre: 'Collar antipulgas', precio: '500.00', stockActual: 5 },
      { idProducto: 2, nombre: 'Cama para perro', precio: '9000.00', stockActual: 2 },
    ]);
    renderizar();

    expect(await screen.findByText('Collar antipulgas')).toBeInTheDocument();
    expect(screen.getByText('Cama para perro')).toBeInTheDocument();
  });

  it('si falla la carga, muestra el mensaje de error', async () => {
    favoritosApi.listar.mockRejectedValue(new Error('No se pudo conectar con el servidor.'));
    renderizar();

    expect(await screen.findByText('No se pudo conectar con el servidor.')).toBeInTheDocument();
  });
});
