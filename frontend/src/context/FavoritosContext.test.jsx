import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from './AuthContext.jsx';
import { FavoritosProvider } from './FavoritosContext.jsx';
import { useFavoritos } from '../hooks/useFavoritos.js';
import { useAuth } from '../hooks/useAuth.js';
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

const PanelDePrueba = () => {
  const { favoritos, cargando, error } = useFavoritos();
  if (cargando) return <span>cargando-favoritos</span>;
  return (
    <div>
      {error && <span data-testid="error">{error}</span>}
      <ul>
        {favoritos.map((producto) => (
          <li key={producto.idProducto}>{producto.nombre}</li>
        ))}
      </ul>
      <span data-testid="cantidad">{favoritos.length}</span>
    </div>
  );
};

const renderizar = () =>
  render(
    <AuthProvider>
      <FavoritosProvider>
        <PanelDePrueba />
      </FavoritosProvider>
    </AuthProvider>,
  );

describe('FavoritosContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sin sesión de cliente, no llama a la API y queda vacío', async () => {
    authApi.obtenerPerfil.mockRejectedValue(new Error('sin sesión'));

    renderizar();

    await waitFor(() => expect(screen.getByTestId('cantidad')).toHaveTextContent('0'));
    expect(favoritosApi.listar).not.toHaveBeenCalled();
  });

  it('con sesión de cliente, carga los favoritos reales al montar', async () => {
    authApi.obtenerPerfil.mockResolvedValue({ idUsuario: 1, rol: 'cliente', idCliente: 7 });
    favoritosApi.listar.mockResolvedValue([{ idProducto: 1, nombre: 'Collar' }]);

    renderizar();

    expect(await screen.findByText('Collar')).toBeInTheDocument();
    expect(favoritosApi.listar).toHaveBeenCalledTimes(1);
  });

  it('con sesión de personal (vendedor), no carga favoritos (no tiene favoritos de compra)', async () => {
    authApi.obtenerPerfil.mockResolvedValue({ idUsuario: 2, rol: 'vendedor', idCliente: null });

    renderizar();

    await waitFor(() => expect(screen.getByTestId('cantidad')).toHaveTextContent('0'));
    expect(favoritosApi.listar).not.toHaveBeenCalled();
  });

  it('si falla la carga inicial, expone el error sin romper la página', async () => {
    authApi.obtenerPerfil.mockResolvedValue({ idUsuario: 1, rol: 'cliente', idCliente: 7 });
    favoritosApi.listar.mockRejectedValue(new Error('No se pudo conectar con el servidor.'));

    renderizar();

    expect(await screen.findByTestId('error')).toHaveTextContent('No se pudo conectar con el servidor.');
  });
});

// Hallazgo real de Codex (revisión de esta etapa): sin depender también de
// `usuario?.idCliente` (no solo de `esCliente`), cambiar de cliente A a
// cliente B SIN desmontar la SPA (el caso real: A cierra sesión y B inicia
// sesión en la misma pestaña, sin recargar la página) dejaba a B viendo en
// pantalla los favoritos de A — `esCliente` era `true` en los dos casos, así
// que el efecto nunca se volvía a disparar.
const PanelDeCambioDeCliente = () => {
  const { iniciarSesion } = useAuth();
  const { favoritos, cargando } = useFavoritos();

  return (
    <div>
      {cargando && <span>cargando-favoritos</span>}
      <ul>
        {favoritos.map((producto) => (
          <li key={producto.idProducto}>{producto.nombre}</li>
        ))}
      </ul>
      <button type="button" onClick={() => iniciarSesion('b@petshop.test', 'ClaveDePrueba123')}>
        Iniciar sesión como B
      </button>
    </div>
  );
};

describe('FavoritosContext — cambio de cliente sin desmontar la app', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('al iniciar sesión como otro cliente (mismo esCliente=true), recarga y deja de mostrar los favoritos del cliente anterior', async () => {
    const usuario = userEvent.setup();

    authApi.obtenerPerfil.mockResolvedValue({ idUsuario: 1, rol: 'cliente', idCliente: 7 });
    favoritosApi.listar.mockResolvedValueOnce([{ idProducto: 1, nombre: 'Favorito de A' }]);
    authApi.iniciarSesion.mockResolvedValue({
      usuario: { idUsuario: 2, rol: 'cliente', idCliente: 12 },
    });
    favoritosApi.listar.mockResolvedValueOnce([{ idProducto: 2, nombre: 'Favorito de B' }]);

    render(
      <AuthProvider>
        <FavoritosProvider>
          <PanelDeCambioDeCliente />
        </FavoritosProvider>
      </AuthProvider>,
    );

    expect(await screen.findByText('Favorito de A')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Iniciar sesión como B' }));

    await waitFor(() => expect(screen.getByText('Favorito de B')).toBeInTheDocument());
    expect(screen.queryByText('Favorito de A')).not.toBeInTheDocument();
    expect(favoritosApi.listar).toHaveBeenCalledTimes(2);
  });
});
