import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Registro from './Registro.jsx';
import { AuthProvider } from '../context/AuthContext.jsx';
import clientesApi from '../api/clientes.api.js';
import georefApi from '../api/georef.api.js';
import * as authApi from '../api/auth.api.js';

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

const renderizar = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <Registro />
      </AuthProvider>
    </MemoryRouter>,
  );

const completarDatosBasicos = async () => {
  await userEvent.type(screen.getByLabelText('Nombre'), 'Ana');
  await userEvent.type(screen.getByLabelText('Apellido'), 'Gómez');
  await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@petshop.demo');
  await userEvent.type(screen.getByLabelText('Contraseña'), 'ClaveSegura123');
  await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
};

describe('Registro — paso de dirección después de crear la cuenta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authApi.obtenerPerfil.mockResolvedValue(null);
    authApi.registrarse.mockResolvedValue({
      usuario: { idUsuario: 1, rol: 'cliente', idCliente: 7, email: 'ana@petshop.demo', nombre: 'Ana', apellido: 'Gómez' },
    });
    georefApi.obtenerProvincias.mockResolvedValue([{ id: '82', nombre: 'Santa Fe' }]);
    georefApi.obtenerLocalidades.mockResolvedValue([{ id: '82084270', nombre: 'Rosario' }]);
  });

  it('tras crear la cuenta, muestra el formulario de dirección (opcional) en vez de navegar directo', async () => {
    renderizar();
    await completarDatosBasicos();

    expect(await screen.findByText('¡Cuenta creada!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar dirección' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Completar más tarde' })).toBeInTheDocument();
  });

  it('"Completar más tarde" no llama a guardarDireccion', async () => {
    renderizar();
    await completarDatosBasicos();
    await screen.findByText('¡Cuenta creada!');

    await userEvent.click(screen.getByRole('button', { name: 'Completar más tarde' }));

    expect(clientesApi.guardarDireccion).not.toHaveBeenCalled();
  });

  it('completar y guardar la dirección llama a la API con los datos estructurados', async () => {
    clientesApi.guardarDireccion.mockResolvedValue({});
    renderizar();
    await completarDatosBasicos();
    await screen.findByText('¡Cuenta creada!');

    await userEvent.selectOptions(screen.getByLabelText('Provincia'), '82');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Localidad' })).toBeEnabled());
    await userEvent.type(screen.getByRole('combobox', { name: 'Localidad' }), 'Rosario');
    await userEvent.click(await screen.findByRole('option', { name: 'Rosario' }));
    await userEvent.type(screen.getByLabelText('Calle'), 'San Martín');
    await userEvent.type(screen.getByLabelText('Número'), '1234');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar dirección' }));

    await waitFor(() =>
      expect(clientesApi.guardarDireccion).toHaveBeenCalledWith(
        expect.objectContaining({ idProvincia: '82', idLocalidad: '82084270', calle: 'San Martín', numero: '1234' }),
      ),
    );
  });
});
