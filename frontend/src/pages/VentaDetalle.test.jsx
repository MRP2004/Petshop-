import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import VentaDetalle from './VentaDetalle.jsx';
import { AuthProvider } from '../context/AuthContext.jsx';
import ventasApi from '../api/ventas.api.js';
import solicitudCancelacionApi from '../api/solicitudCancelacion.api.js';
import * as authApi from '../api/auth.api.js';

// Corrección (CU-04, revisión de Mauro sobre la venta #20): el cliente ya no
// puede cancelar directamente (ver venta.service.js#cancelarVenta) — estas
// pruebas cubren el reemplazo ("Solicitar cancelación") y la resolución por
// el personal (aprobar/rechazar), incluida la confirmación explícita antes
// de una acción destructiva.
vi.mock('../api/ventas.api.js', () => ({
  default: { obtener: vi.fn(), cancelar: vi.fn(), marcarComoEnviada: vi.fn(), marcarComoEntregada: vi.fn() },
}));

vi.mock('../api/solicitudCancelacion.api.js', () => ({
  default: { crear: vi.fn(), aprobar: vi.fn(), rechazar: vi.fn() },
}));

vi.mock('../api/auth.api.js', () => ({
  obtenerPerfil: vi.fn(),
  iniciarSesion: vi.fn(),
  registrarse: vi.fn(),
  cerrarSesion: vi.fn(),
}));

const USUARIO_CLIENTE = { idUsuario: 1, rol: 'cliente', idCliente: 7 };
const USUARIO_VENDEDOR = { idUsuario: 2, rol: 'vendedor', idCliente: null };

const ventaBase = (overrides = {}) => ({
  idVenta: 5,
  fecha: '2026-03-10T15:30:00.000Z',
  total: '25000.00',
  estado: 'registrada',
  metodoEntrega: 'retiro en sucursal',
  cliente: { idCliente: 7, nombre: 'Ana', apellido: 'García' },
  medioPago: { nombre: 'Transferencia bancaria (simulada)' },
  detalles: [],
  solicitudesCancelacion: [],
  ...overrides,
});

const iniciarSesionComo = (usuario) => {
  authApi.obtenerPerfil.mockResolvedValue(usuario);
};

const renderizar = (idVenta = 5) =>
  render(
    <MemoryRouter initialEntries={[`/mis-compras/${idVenta}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/mis-compras/:id" element={<VentaDetalle />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('VentaDetalle — cancelación restringida al personal, solicitud del cliente', () => {
  it('un cliente ve "Solicitar cancelación" y NUNCA "Cancelar venta"', async () => {
    iniciarSesionComo(USUARIO_CLIENTE);
    ventasApi.obtener.mockResolvedValue(ventaBase());

    renderizar();

    expect(await screen.findByRole('button', { name: 'Solicitar cancelación' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar venta' })).not.toBeInTheDocument();
  });

  it('al hacer clic en "Solicitar cancelación", llama a la API y refleja el estado pendiente (sin tocar la venta)', async () => {
    iniciarSesionComo(USUARIO_CLIENTE);
    ventasApi.obtener.mockResolvedValue(ventaBase());
    solicitudCancelacionApi.crear.mockResolvedValue(
      ventaBase({
        solicitudesCancelacion: [
          { idSolicitud: 1, estado: 'pendiente', creadoEn: '2026-03-11T10:00:00.000Z' },
        ],
      }),
    );

    renderizar();
    await screen.findByRole('button', { name: 'Solicitar cancelación' });

    await userEvent.click(screen.getByRole('button', { name: 'Solicitar cancelación' }));

    expect(solicitudCancelacionApi.crear).toHaveBeenCalledWith(5);
    expect(await screen.findByText(/Solicitud de cancelación enviada, pendiente de revisión/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Solicitar cancelación' })).not.toBeInTheDocument();
  });

  it('un cliente con una solicitud ya rechazada ve el motivo, y puede volver a solicitar', async () => {
    iniciarSesionComo(USUARIO_CLIENTE);
    ventasApi.obtener.mockResolvedValue(
      ventaBase({
        solicitudesCancelacion: [
          {
            idSolicitud: 1,
            estado: 'rechazada',
            creadoEn: '2026-03-11T10:00:00.000Z',
            motivoRechazo: 'Stock ya reservado para retiro en sucursal',
          },
        ],
      }),
    );

    renderizar();

    expect(
      await screen.findByText(/Tu solicitud de cancelación anterior fue rechazada: Stock ya reservado/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Solicitar cancelación' })).toBeInTheDocument();
  });

  it('el personal ve "Cancelar venta" y se le pide confirmación (diálogo) antes de ejecutarla', async () => {
    iniciarSesionComo(USUARIO_VENDEDOR);
    ventasApi.obtener.mockResolvedValue(ventaBase());

    renderizar();
    await screen.findByRole('button', { name: 'Cancelar venta' });
    expect(screen.queryByRole('button', { name: 'Solicitar cancelación' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar venta' }));

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(ventasApi.cancelar).not.toHaveBeenCalled();

    // "Volver" cierra sin llamar a la API.
    await userEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(ventasApi.cancelar).not.toHaveBeenCalled();
  });

  it('el personal confirma la cancelación directa en el diálogo: se llama a la API', async () => {
    iniciarSesionComo(USUARIO_VENDEDOR);
    ventasApi.obtener.mockResolvedValue(ventaBase());
    ventasApi.cancelar.mockResolvedValue(ventaBase({ estado: 'cancelada' }));

    renderizar();
    await screen.findByRole('button', { name: 'Cancelar venta' });
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar venta' }));

    const dialogo = await screen.findByRole('alertdialog');
    // Dos botones dicen "Cancelar venta" con el diálogo abierto (la fila y
    // el diálogo): el del diálogo es el que hay que confirmar.
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar venta' }));

    await waitFor(() => expect(ventasApi.cancelar).toHaveBeenCalledWith('5'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('el personal ve una solicitud pendiente y puede aprobarla (con diálogo de confirmación) o rechazarla', async () => {
    iniciarSesionComo(USUARIO_VENDEDOR);
    ventasApi.obtener.mockResolvedValue(
      ventaBase({
        solicitudesCancelacion: [
          { idSolicitud: 42, estado: 'pendiente', creadoEn: '2026-03-11T10:00:00.000Z' },
        ],
      }),
    );
    solicitudCancelacionApi.aprobar.mockResolvedValue(ventaBase({ estado: 'cancelada' }));

    renderizar();

    expect(await screen.findByText(/Solicitud de cancelación pendiente de tu revisión/)).toBeInTheDocument();
    const botonAprobar = screen.getByRole('button', { name: 'Aprobar solicitud de cancelación' });
    expect(screen.getByRole('button', { name: 'Rechazar solicitud de cancelación' })).toBeInTheDocument();

    await userEvent.click(botonAprobar);

    const dialogo = await screen.findByRole('alertdialog');
    expect(solicitudCancelacionApi.aprobar).not.toHaveBeenCalled();

    await userEvent.click(within(dialogo).getByRole('button', { name: 'Aprobar solicitud de cancelación' }));

    await waitFor(() => expect(solicitudCancelacionApi.aprobar).toHaveBeenCalledWith(42));
  });

  it('rechazar una solicitud NO abre ningún diálogo (no es destructivo) y llama a la API directo', async () => {
    iniciarSesionComo(USUARIO_VENDEDOR);
    ventasApi.obtener.mockResolvedValue(
      ventaBase({
        solicitudesCancelacion: [
          { idSolicitud: 42, estado: 'pendiente', creadoEn: '2026-03-11T10:00:00.000Z' },
        ],
      }),
    );
    solicitudCancelacionApi.rechazar.mockResolvedValue(
      ventaBase({
        solicitudesCancelacion: [
          { idSolicitud: 42, estado: 'rechazada', creadoEn: '2026-03-11T10:00:00.000Z', motivoRechazo: null },
        ],
      }),
    );

    renderizar();
    await screen.findByRole('button', { name: 'Rechazar solicitud de cancelación' });
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar solicitud de cancelación' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => expect(solicitudCancelacionApi.rechazar).toHaveBeenCalledWith(42));
  });

  it('si la cancelación directa falla, el diálogo se queda abierto y muestra el error (se puede reintentar)', async () => {
    iniciarSesionComo(USUARIO_VENDEDOR);
    ventasApi.obtener.mockResolvedValue(ventaBase());
    ventasApi.cancelar.mockRejectedValue(new Error('La venta ya no está en un estado cancelable'));

    renderizar();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar venta' }));
    const dialogo = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar venta' }));

    expect(await screen.findByText('La venta ya no está en un estado cancelable')).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});

// Ronda 2, Etapa 7 (estados de pedido: retiro vs. envío) — diseño de
// esquema revisado con Codex antes de escribir el modelo/migración (ver
// docs/estado-proyecto.md).
describe('VentaDetalle — estados de pedido (retiro vs. envío, Etapa 7)', () => {
  it('registrada + retiro en sucursal: el personal ve "Marcar lista para retirar" (no "Marcar como enviada")', async () => {
    iniciarSesionComo(USUARIO_VENDEDOR);
    ventasApi.obtener.mockResolvedValue(ventaBase({ metodoEntrega: 'retiro en sucursal' }));

    renderizar();

    expect(await screen.findByRole('button', { name: 'Marcar lista para retirar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marcar como enviada' })).not.toBeInTheDocument();
  });

  it('registrada + envío a domicilio: el personal ve "Marcar como enviada"', async () => {
    iniciarSesionComo(USUARIO_VENDEDOR);
    ventasApi.obtener.mockResolvedValue(ventaBase({ metodoEntrega: 'envío a domicilio' }));

    renderizar();

    expect(await screen.findByRole('button', { name: 'Marcar como enviada' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marcar lista para retirar' })).not.toBeInTheDocument();
  });

  it('estado "lista_para_retirar": muestra la etiqueta legible y el botón "Marcar como entregada"', async () => {
    iniciarSesionComo(USUARIO_VENDEDOR);
    ventasApi.obtener.mockResolvedValue(ventaBase({ estado: 'lista_para_retirar', metodoEntrega: 'retiro en sucursal' }));
    ventasApi.marcarComoEntregada.mockResolvedValue(
      ventaBase({ estado: 'entregada', metodoEntrega: 'retiro en sucursal' }),
    );

    renderizar();

    expect(await screen.findByText('Lista para retirar')).toBeInTheDocument();
    const boton = screen.getByRole('button', { name: 'Marcar como entregada' });
    expect(screen.queryByRole('button', { name: 'Marcar lista para retirar' })).not.toBeInTheDocument();

    await userEvent.click(boton);

    await waitFor(() => expect(ventasApi.marcarComoEntregada).toHaveBeenCalledWith('5'));
    expect(await screen.findByText('Entregada')).toBeInTheDocument();
  });

  it('estado "enviada": también muestra "Marcar como entregada"', async () => {
    iniciarSesionComo(USUARIO_VENDEDOR);
    ventasApi.obtener.mockResolvedValue(ventaBase({ estado: 'enviada', metodoEntrega: 'envío a domicilio' }));

    renderizar();

    expect(await screen.findByRole('button', { name: 'Marcar como entregada' })).toBeInTheDocument();
  });

  it('estado "entregada"/"cancelada": no muestra ninguna acción de transición para el personal', async () => {
    iniciarSesionComo(USUARIO_VENDEDOR);
    ventasApi.obtener.mockResolvedValue(ventaBase({ estado: 'entregada' }));

    renderizar();
    await screen.findByText('Entregada');

    expect(screen.queryByRole('button', { name: 'Marcar como enviada' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marcar lista para retirar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marcar como entregada' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar venta' })).not.toBeInTheDocument();
  });
});
