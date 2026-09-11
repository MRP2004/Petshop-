import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from './AuthContext.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { ErrorApi } from '../api/httpClient.js';
import * as authApi from '../api/auth.api.js';

// Corrección de esta etapa (segunda vuelta): la versión anterior atrapaba
// el error de red pero limpiaba el estado local de todas formas,
// presentando a quien usa la app como "desconectado" mientras su cookie
// seguía activa en el servidor — un cierre que en los hechos no había
// ocurrido, mostrado como si hubiera ocurrido. Estas pruebas verifican el
// comportamiento correcto: el estado solo se limpia cuando el servidor
// confirma el cierre (o ya no reconoce la sesión), nunca ante un fallo de
// red u otro error, que en cambio se muestra y permite reintentar.
vi.mock('../api/auth.api.js', () => ({
  obtenerPerfil: vi.fn(),
  iniciarSesion: vi.fn(),
  registrarse: vi.fn(),
  cerrarSesion: vi.fn(),
}));

const PanelDePrueba = () => {
  const { estaAutenticado, cargandoSesion, cerrarSesion, cerrandoSesion, errorCierreSesion } = useAuth();

  if (cargandoSesion) return <span>cargando</span>;

  return (
    <div>
      <span data-testid="estado">{estaAutenticado ? 'autenticado' : 'anonimo'}</span>
      {errorCierreSesion && <span data-testid="error-logout">{errorCierreSesion}</span>}
      <button type="button" onClick={cerrarSesion} disabled={cerrandoSesion}>
        Cerrar sesión
      </button>
    </div>
  );
};

const renderizar = () =>
  render(
    <AuthProvider>
      <PanelDePrueba />
    </AuthProvider>,
  );

describe('AuthContext - cerrarSesion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authApi.obtenerPerfil.mockResolvedValue({ idUsuario: 1, rol: 'cliente', idCliente: 7 });
  });

  it('cierre exitoso: limpia la sesión local cuando el servidor confirma el logout', async () => {
    const usuario = userEvent.setup();
    authApi.cerrarSesion.mockResolvedValue(null);

    renderizar();
    await screen.findByText('autenticado');

    await usuario.click(screen.getByText('Cerrar sesión'));

    await waitFor(() => expect(screen.getByTestId('estado').textContent).toBe('anonimo'));
    expect(screen.queryByTestId('error-logout')).not.toBeInTheDocument();
  });

  it('fallo visible: un fallo de red NO limpia la sesión y muestra un mensaje, sin relanzar el error', async () => {
    const usuario = userEvent.setup();
    authApi.cerrarSesion.mockRejectedValue(new ErrorApi('No se pudo conectar con el servidor.', 0));

    renderizar();
    await screen.findByText('autenticado');

    // Si cerrarSesion() del contexto relanzara el error, este click (que no
    // atrapa nada) produciría un rechazo de promesa no manejado en el
    // proceso de pruebas en vez de resolver — lo que prueba esta aserción
    // es que eso no pasa Y que la sesión sigue activa.
    await usuario.click(screen.getByText('Cerrar sesión'));

    await waitFor(() =>
      expect(screen.getByTestId('error-logout').textContent).toMatch(/revisá tu conexión/i),
    );
    expect(screen.getByTestId('estado').textContent).toBe('autenticado');
  });

  it('reintento exitoso: después de un fallo, un segundo clic que sí responde bien limpia la sesión', async () => {
    const usuario = userEvent.setup();
    authApi.cerrarSesion.mockRejectedValueOnce(new ErrorApi('No se pudo conectar con el servidor.', 0));
    authApi.cerrarSesion.mockResolvedValueOnce(null);

    renderizar();
    await screen.findByText('autenticado');

    await usuario.click(screen.getByText('Cerrar sesión'));
    await screen.findByTestId('error-logout');
    expect(screen.getByTestId('estado').textContent).toBe('autenticado');

    await usuario.click(screen.getByText('Cerrar sesión'));

    await waitFor(() => expect(screen.getByTestId('estado').textContent).toBe('anonimo'));
    expect(screen.queryByTestId('error-logout')).not.toBeInTheDocument();
    expect(authApi.cerrarSesion).toHaveBeenCalledTimes(2);
  });

  it('sesión ya inválida (401 del propio logout): se limpia el estado sin mostrarlo como un fallo', async () => {
    const usuario = userEvent.setup();
    authApi.cerrarSesion.mockRejectedValue(new ErrorApi('La sesión no es válida o expiró', 401));

    renderizar();
    await screen.findByText('autenticado');

    await usuario.click(screen.getByText('Cerrar sesión'));

    await waitFor(() => expect(screen.getByTestId('estado').textContent).toBe('anonimo'));
    expect(screen.queryByTestId('error-logout')).not.toBeInTheDocument();
  });

  it('recargar después de un fallo: como el servidor nunca confirmó el cierre, la cookie sigue viva y la sesión vuelve a aparecer', async () => {
    const usuario = userEvent.setup();
    authApi.cerrarSesion.mockRejectedValue(new ErrorApi('No se pudo conectar con el servidor.', 0));

    const primeraMontura = renderizar();
    await screen.findByText('autenticado');
    await usuario.click(screen.getByText('Cerrar sesión'));
    await screen.findByTestId('error-logout');

    // "Recargar la página" en la app real vuelve a preguntarle al backend
    // quién está logueado (GET /api/usuarios/perfil) en un montaje nuevo de
    // AuthProvider; se simula desmontando y montando de nuevo. Como el
    // logout nunca llegó a confirmarse, el perfil sigue devolviendo el
    // mismo usuario.
    primeraMontura.unmount();
    renderizar();

    await waitFor(() => expect(screen.getByTestId('estado').textContent).toBe('autenticado'));
  });
});
