import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Campana from './Campana.jsx';
import { AuthProvider } from '../context/AuthContext.jsx';
import { AvisosProvider } from '../context/AvisosContext.jsx';
import * as authApi from '../api/auth.api.js';
import avisosApi from '../api/avisos.api.js';

vi.mock('../api/auth.api.js', () => ({
  obtenerPerfil: vi.fn(),
  iniciarSesion: vi.fn(),
  registrarse: vi.fn(),
  cerrarSesion: vi.fn(),
}));

vi.mock('../api/avisos.api.js', () => ({
  default: {
    listar: vi.fn(),
    marcarLeido: vi.fn(),
    marcarTodosLeidos: vi.fn(),
  },
}));

const renderizar = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <AvisosProvider>
          <Routes>
            <Route path="/" element={<Campana />} />
            <Route path="/mis-compras/:id" element={<div data-testid="pagina-venta" />} />
          </Routes>
        </AvisosProvider>
      </AuthProvider>
    </MemoryRouter>,
  );

describe('Campana', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authApi.obtenerPerfil.mockResolvedValue({ idUsuario: 1, rol: 'cliente', idCliente: 7 });
  });

  it('muestra el contador de no leídos', async () => {
    avisosApi.listar.mockResolvedValue([
      { idAviso: 1, tipo: 'compra_confirmada', mensaje: 'Uno', leido: false, enlace: '/mis-compras/1', creadoEn: new Date().toISOString() },
      { idAviso: 2, tipo: 'venta_enviada', mensaje: 'Dos', leido: true, enlace: '/mis-compras/2', creadoEn: new Date().toISOString() },
    ]);

    renderizar();

    expect(await screen.findByText('1')).toBeInTheDocument();
  });

  it('sin no leídos, no muestra ningún contador', async () => {
    avisosApi.listar.mockResolvedValue([
      { idAviso: 1, tipo: 'compra_confirmada', mensaje: 'Uno', leido: true, enlace: '/mis-compras/1', creadoEn: new Date().toISOString() },
    ]);

    renderizar();
    await screen.findByRole('button', { name: /Notificaciones/i });

    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('clic en el botón abre el panel con la lista de avisos', async () => {
    avisosApi.listar.mockResolvedValue([
      { idAviso: 1, tipo: 'compra_confirmada', mensaje: 'Tu compra fue confirmada', leido: false, enlace: '/mis-compras/1', creadoEn: new Date().toISOString() },
    ]);

    renderizar();
    const boton = await screen.findByRole('button', { name: /Notificaciones/i });
    await userEvent.click(boton);

    expect(screen.getByText('Tu compra fue confirmada')).toBeInTheDocument();
  });

  it('clic en un aviso con enlace navega a esa página y lo marca leído', async () => {
    avisosApi.listar.mockResolvedValue([
      { idAviso: 1, tipo: 'compra_confirmada', mensaje: 'Tu compra fue confirmada', leido: false, enlace: '/mis-compras/1', creadoEn: new Date().toISOString() },
    ]);
    avisosApi.marcarLeido.mockResolvedValue(null);

    renderizar();
    await userEvent.click(await screen.findByRole('button', { name: /Notificaciones/i }));
    await userEvent.click(screen.getByText('Tu compra fue confirmada'));

    expect(await screen.findByTestId('pagina-venta')).toBeInTheDocument();
    expect(avisosApi.marcarLeido).toHaveBeenCalledWith(1);
  });

  it('Escape cierra el panel aunque el foco esté en un ítem interno, y devuelve el foco a la campana (hallazgo real de Codex)', async () => {
    avisosApi.listar.mockResolvedValue([
      { idAviso: 1, tipo: 'compra_confirmada', mensaje: 'Tu compra fue confirmada', leido: false, enlace: '/mis-compras/1', creadoEn: new Date().toISOString() },
    ]);

    renderizar();
    const boton = await screen.findByRole('button', { name: /Notificaciones/i });
    await userEvent.click(boton);

    const item = screen.getByText('Tu compra fue confirmada');
    item.closest('a').focus();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByText('Tu compra fue confirmada')).not.toBeInTheDocument();
    expect(boton).toHaveFocus();
  });

  it('"Marcar todas como leídas" llama a marcarTodosLeidos', async () => {
    avisosApi.listar.mockResolvedValue([
      { idAviso: 1, tipo: 'compra_confirmada', mensaje: 'Uno', leido: false, enlace: '/mis-compras/1', creadoEn: new Date().toISOString() },
    ]);
    avisosApi.marcarTodosLeidos.mockResolvedValue(null);

    renderizar();
    await userEvent.click(await screen.findByRole('button', { name: /Notificaciones/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Marcar todas como leídas' }));

    expect(avisosApi.marcarTodosLeidos).toHaveBeenCalledTimes(1);
  });
});
