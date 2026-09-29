import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BotonFavorito from './BotonFavorito.jsx';
import { AuthProvider } from '../context/AuthContext.jsx';
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

const producto = { idProducto: 5, nombre: 'Pelota de goma' };

const renderizar = () =>
  render(
    <AuthProvider>
      <FavoritosProvider>
        <BotonFavorito producto={producto} />
      </FavoritosProvider>
    </AuthProvider>,
  );

describe('BotonFavorito', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sin sesión de cliente, queda deshabilitado', async () => {
    authApi.obtenerPerfil.mockRejectedValue(new Error('sin sesión'));
    renderizar();

    const boton = await screen.findByRole('button', { name: /iniciá sesión/i });
    expect(boton).toBeDisabled();

    await userEvent.click(boton);
    expect(favoritosApi.agregar).not.toHaveBeenCalled();
  });

  it('con sesión de cliente, un clic agrega a favoritos (optimista) y llama a la API', async () => {
    authApi.obtenerPerfil.mockResolvedValue({ idUsuario: 1, rol: 'cliente', idCliente: 7 });
    favoritosApi.listar.mockResolvedValue([]);
    favoritosApi.agregar.mockResolvedValue(null);

    renderizar();

    const boton = await screen.findByRole('button', { name: 'Agregar a favoritos' });
    await userEvent.click(boton);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Quitar de favoritos' })).toBeInTheDocument());
    expect(favoritosApi.agregar).toHaveBeenCalledWith(5);
  });

  it('un producto ya favorito muestra "Quitar de favoritos"; un clic lo quita', async () => {
    authApi.obtenerPerfil.mockResolvedValue({ idUsuario: 1, rol: 'cliente', idCliente: 7 });
    favoritosApi.listar.mockResolvedValue([producto]);
    favoritosApi.quitar.mockResolvedValue(null);

    renderizar();

    const boton = await screen.findByRole('button', { name: 'Quitar de favoritos' });
    await userEvent.click(boton);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Agregar a favoritos' })).toBeInTheDocument());
    expect(favoritosApi.quitar).toHaveBeenCalledWith(5);
  });

  it('mientras hay un pedido en curso para el producto, queda deshabilitado y un segundo clic no dispara otro pedido (hallazgo real de Codex)', async () => {
    authApi.obtenerPerfil.mockResolvedValue({ idUsuario: 1, rol: 'cliente', idCliente: 7 });
    favoritosApi.listar.mockResolvedValue([]);

    let resolverAgregar;
    favoritosApi.agregar.mockReturnValue(
      new Promise((resolve) => {
        resolverAgregar = resolve;
      }),
    );

    renderizar();

    const boton = await screen.findByRole('button', { name: 'Agregar a favoritos' });
    await userEvent.click(boton);

    // Optimista: ya muestra "Quitar de favoritos", pero el pedido real
    // sigue en curso (la promesa de arriba no se resolvió todavía) — el
    // botón debe quedar deshabilitado mientras tanto.
    const botonPendiente = await screen.findByRole('button', { name: 'Quitar de favoritos' });
    expect(botonPendiente).toBeDisabled();

    await userEvent.click(botonPendiente);
    expect(favoritosApi.agregar).toHaveBeenCalledTimes(1);
    expect(favoritosApi.quitar).not.toHaveBeenCalled();

    resolverAgregar(null);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Quitar de favoritos' })).toBeEnabled());
  });

  it('si el backend rechaza el agregado, revierte el estado optimista', async () => {
    authApi.obtenerPerfil.mockResolvedValue({ idUsuario: 1, rol: 'cliente', idCliente: 7 });
    favoritosApi.listar.mockResolvedValue([]);
    favoritosApi.agregar.mockRejectedValue(new Error('No se pudo conectar con el servidor.'));

    renderizar();

    const boton = await screen.findByRole('button', { name: 'Agregar a favoritos' });
    await userEvent.click(boton);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Agregar a favoritos' })).toBeInTheDocument());
  });
});
