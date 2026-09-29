import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MiCuenta from './MiCuenta.jsx';
import { AuthProvider } from '../context/AuthContext.jsx';
import RutaProtegida from '../components/RutaProtegida.jsx';
import ventasApi from '../api/ventas.api.js';
import clientesApi from '../api/clientes.api.js';
import georefApi from '../api/georef.api.js';
import * as authApi from '../api/auth.api.js';

vi.mock('../api/ventas.api.js', () => ({ default: { listar: vi.fn() } }));
vi.mock('../api/clientes.api.js', () => ({
  default: { obtenerDireccion: vi.fn(), guardarDireccion: vi.fn() },
}));
vi.mock('../api/georef.api.js', () => ({
  default: { obtenerProvincias: vi.fn(), obtenerLocalidades: vi.fn() },
}));
vi.mock('../api/auth.api.js', () => ({
  obtenerPerfil: vi.fn(),
  iniciarSesion: vi.fn(),
  registrarse: vi.fn(),
  cerrarSesion: vi.fn(),
}));

const USUARIO = { idUsuario: 1, rol: 'cliente', idCliente: 7, email: 'ana@petshop.demo', nombre: 'Ana', apellido: 'Gómez' };

// MiCuenta.jsx asume `usuario` ya resuelto (como en la app real, siempre
// montada dentro de RutaProtegida): se envuelve acá igual, para no
// simular un estado ("usuario === null, todavía cargando sesión") que en
// la app real nunca llega a mostrar este componente.
const renderizar = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <RutaProtegida roles={['cliente']}>
          <MiCuenta />
        </RutaProtegida>
      </AuthProvider>
    </MemoryRouter>,
  );

describe('MiCuenta — sección de dirección', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authApi.obtenerPerfil.mockResolvedValue(USUARIO);
    ventasApi.listar.mockResolvedValue([]);
    georefApi.obtenerProvincias.mockResolvedValue([{ id: '82', nombre: 'Santa Fe' }]);
    georefApi.obtenerLocalidades.mockResolvedValue([{ id: '82084270', nombre: 'Rosario' }]);
  });

  it('muestra el nombre real del cliente en el perfil', async () => {
    clientesApi.obtenerDireccion.mockResolvedValue(null);
    renderizar();
    expect(await screen.findByText('Ana Gómez', { exact: false })).toBeInTheDocument();
  });

  it('sin dirección guardada, muestra el formulario directamente', async () => {
    clientesApi.obtenerDireccion.mockResolvedValue(null);
    renderizar();

    expect(await screen.findByRole('button', { name: 'Guardar dirección' })).toBeInTheDocument();
  });

  it('con dirección guardada, muestra el resumen y "Editar dirección"', async () => {
    clientesApi.obtenerDireccion.mockResolvedValue({
      idProvincia: '82',
      provincia: 'Santa Fe',
      idLocalidad: '82084270',
      localidad: 'Rosario',
      calle: 'San Martín',
      numero: '1234',
      piso: null,
      indicaciones: null,
    });
    renderizar();

    expect(await screen.findByText('San Martín 1234', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Rosario, Santa Fe')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar dirección' })).toBeInTheDocument();
  });

  it('"Editar dirección" abre el formulario precargado, y guardar vuelve al resumen', async () => {
    clientesApi.obtenerDireccion.mockResolvedValue({
      idProvincia: '82',
      provincia: 'Santa Fe',
      idLocalidad: '82084270',
      localidad: 'Rosario',
      calle: 'San Martín',
      numero: '1234',
      piso: null,
      indicaciones: null,
    });
    clientesApi.guardarDireccion.mockResolvedValue({});

    renderizar();
    await userEvent.click(await screen.findByRole('button', { name: 'Editar dirección' }));

    const campoCalle = await screen.findByLabelText('Calle');
    expect(campoCalle).toHaveValue('San Martín');

    await userEvent.clear(campoCalle);
    await userEvent.type(campoCalle, 'Corrientes');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar dirección' }));

    await waitFor(() =>
      expect(clientesApi.guardarDireccion).toHaveBeenCalledWith(
        expect.objectContaining({ calle: 'Corrientes' }),
      ),
    );
  });
});
