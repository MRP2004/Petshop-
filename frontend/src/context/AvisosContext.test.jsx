import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from './AuthContext.jsx';
import { AvisosProvider } from './AvisosContext.jsx';
import { useAvisos } from '../hooks/useAvisos.js';
import { useAuth } from '../hooks/useAuth.js';
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

const PanelDePrueba = () => {
  const { avisos, noLeidos, cargando, marcarLeido, marcarTodosLeidos } = useAvisos();
  if (cargando) return <span>cargando-avisos</span>;
  return (
    <div>
      <span data-testid="no-leidos">{noLeidos}</span>
      <ul>
        {avisos.map((aviso) => (
          <li key={aviso.idAviso}>
            {aviso.mensaje} — {aviso.leido ? 'leído' : 'no leído'}
            <button type="button" onClick={() => marcarLeido(aviso.idAviso)}>
              Marcar {aviso.idAviso}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={marcarTodosLeidos}>
        Marcar todas
      </button>
    </div>
  );
};

const renderizar = () =>
  render(
    <AuthProvider>
      <AvisosProvider>
        <PanelDePrueba />
      </AvisosProvider>
    </AuthProvider>,
  );

describe('AvisosContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sin sesión, no llama a la API y queda vacío', async () => {
    authApi.obtenerPerfil.mockRejectedValue(new Error('sin sesión'));

    renderizar();

    await waitFor(() => expect(screen.getByTestId('no-leidos')).toHaveTextContent('0'));
    expect(avisosApi.listar).not.toHaveBeenCalled();
  });

  it('con sesión de cualquier rol (personal incluido), carga los avisos reales', async () => {
    authApi.obtenerPerfil.mockResolvedValue({ idUsuario: 1, rol: 'vendedor', idCliente: null });
    avisosApi.listar.mockResolvedValue([
      { idAviso: 1, tipo: 'solicitud_nueva', mensaje: 'Nueva solicitud', leido: false, enlace: '/panel/ventas/5' },
    ]);

    renderizar();

    expect(await screen.findByText(/Nueva solicitud/)).toBeInTheDocument();
    expect(screen.getByTestId('no-leidos')).toHaveTextContent('1');
  });

  it('marcarLeido es optimista: refleja el cambio antes de que responda el servidor', async () => {
    const usuario = userEvent.setup();
    authApi.obtenerPerfil.mockResolvedValue({ idUsuario: 1, rol: 'cliente', idCliente: 7 });
    avisosApi.listar.mockResolvedValue([
      { idAviso: 1, tipo: 'compra_confirmada', mensaje: 'Compra confirmada', leido: false, enlace: '/mis-compras/1' },
    ]);
    avisosApi.marcarLeido.mockResolvedValue(null);

    renderizar();
    await screen.findByText(/no leído/);

    await usuario.click(screen.getByRole('button', { name: 'Marcar 1' }));

    await waitFor(() => expect(screen.getByText(/— leído/)).toBeInTheDocument());
    expect(avisosApi.marcarLeido).toHaveBeenCalledWith(1);
  });

  it('marcarTodosLeidos marca todos los avisos como leídos', async () => {
    const usuario = userEvent.setup();
    authApi.obtenerPerfil.mockResolvedValue({ idUsuario: 1, rol: 'cliente', idCliente: 7 });
    avisosApi.listar.mockResolvedValue([
      { idAviso: 1, tipo: 'compra_confirmada', mensaje: 'Uno', leido: false, enlace: '/mis-compras/1' },
      { idAviso: 2, tipo: 'venta_enviada', mensaje: 'Dos', leido: false, enlace: '/mis-compras/2' },
    ]);
    avisosApi.marcarTodosLeidos.mockResolvedValue(null);

    renderizar();
    await screen.findByText(/Uno/);

    await usuario.click(screen.getByRole('button', { name: 'Marcar todas' }));

    await waitFor(() => expect(screen.getByTestId('no-leidos')).toHaveTextContent('0'));
    expect(avisosApi.marcarTodosLeidos).toHaveBeenCalledTimes(1);
  });

  it('si marcarLeido falla, recarga la lista real desde el servidor', async () => {
    const usuario = userEvent.setup();
    authApi.obtenerPerfil.mockResolvedValue({ idUsuario: 1, rol: 'cliente', idCliente: 7 });
    avisosApi.listar
      .mockResolvedValueOnce([
        { idAviso: 1, tipo: 'compra_confirmada', mensaje: 'Uno', leido: false, enlace: '/mis-compras/1' },
      ])
      .mockResolvedValueOnce([
        { idAviso: 1, tipo: 'compra_confirmada', mensaje: 'Uno', leido: false, enlace: '/mis-compras/1' },
      ]);
    avisosApi.marcarLeido.mockRejectedValue(new Error('No se pudo conectar con el servidor.'));

    renderizar();
    await screen.findByText(/no leído/);

    await usuario.click(screen.getByRole('button', { name: 'Marcar 1' }));

    await waitFor(() => expect(avisosApi.listar).toHaveBeenCalledTimes(2));
  });
});

// Hallazgo real de Codex en FavoritosContext (ver estado-proyecto.md,
// Decimoquinta corrección): aplicado acá desde el principio — cambiar de
// cuenta sin desmontar la SPA debía recargar los avisos, no dejar viendo los
// de la cuenta anterior.
const PanelDeCambioDeCuenta = () => {
  const { iniciarSesion } = useAuth();
  const { avisos } = useAvisos();

  return (
    <div>
      <ul>
        {avisos.map((aviso) => (
          <li key={aviso.idAviso}>{aviso.mensaje}</li>
        ))}
      </ul>
      <button type="button" onClick={() => iniciarSesion('b@petshop.test', 'ClaveDePrueba123')}>
        Iniciar sesión como B
      </button>
    </div>
  );
};

describe('AvisosContext — cambio de cuenta sin desmontar la app', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('al iniciar sesión como otra cuenta, recarga y deja de mostrar los avisos de la anterior', async () => {
    const usuario = userEvent.setup();

    authApi.obtenerPerfil.mockResolvedValue({ idUsuario: 1, rol: 'cliente', idCliente: 7 });
    avisosApi.listar.mockResolvedValueOnce([
      { idAviso: 1, tipo: 'compra_confirmada', mensaje: 'Aviso de A', leido: false, enlace: '/mis-compras/1' },
    ]);
    authApi.iniciarSesion.mockResolvedValue({ usuario: { idUsuario: 2, rol: 'cliente', idCliente: 12 } });
    avisosApi.listar.mockResolvedValueOnce([
      { idAviso: 2, tipo: 'compra_confirmada', mensaje: 'Aviso de B', leido: false, enlace: '/mis-compras/2' },
    ]);

    render(
      <AuthProvider>
        <AvisosProvider>
          <PanelDeCambioDeCuenta />
        </AvisosProvider>
      </AuthProvider>,
    );

    expect(await screen.findByText('Aviso de A')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Iniciar sesión como B' }));

    await waitFor(() => expect(screen.getByText('Aviso de B')).toBeInTheDocument());
    expect(screen.queryByText('Aviso de A')).not.toBeInTheDocument();
  });
});
