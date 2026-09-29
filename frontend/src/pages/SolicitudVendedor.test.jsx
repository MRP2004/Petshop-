import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SolicitudVendedor from './SolicitudVendedor.jsx';
import solicitudVendedorApi from '../api/solicitudVendedor.api.js';

vi.mock('../api/solicitudVendedor.api.js', () => ({
  default: { crear: vi.fn() },
}));

const renderizar = () =>
  render(
    <MemoryRouter>
      <SolicitudVendedor />
    </MemoryRouter>,
  );

describe('SolicitudVendedor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CUIL (persona física): no pide razón social, y envía el formulario', async () => {
    solicitudVendedorApi.crear.mockResolvedValue(null);
    renderizar();

    await userEvent.type(screen.getByLabelText('Nombre de tu tienda'), 'Tienda de Ana');
    await userEvent.type(screen.getByLabelText(/^CUIL$/), '20-17254359-7');
    expect(screen.queryByLabelText('Razón social')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));

    expect(solicitudVendedorApi.crear).toHaveBeenCalledWith({
      nombreTienda: 'Tienda de Ana',
      tipoDocumento: 'CUIL',
      numeroDocumento: '20-17254359-7',
      razonSocial: undefined,
    });
    expect(await screen.findByText('Solicitud enviada')).toBeInTheDocument();
  });

  it('CUIT (empresa): pide razón social como campo obligatorio', async () => {
    solicitudVendedorApi.crear.mockResolvedValue(null);
    renderizar();

    await userEvent.selectOptions(screen.getByLabelText('Tipo de documento'), 'CUIT (empresa)');
    expect(screen.getByLabelText('Razón social')).toBeRequired();
  });

  it('si el backend rechaza (CUIL inválido), muestra el error sin navegar', async () => {
    solicitudVendedorApi.crear.mockRejectedValue(new Error('El CUIL no es válido'));
    renderizar();

    await userEvent.type(screen.getByLabelText('Nombre de tu tienda'), 'Tienda de Ana');
    await userEvent.type(screen.getByLabelText(/^CUIL$/), '123');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));

    expect(await screen.findByText('El CUIL no es válido')).toBeInTheDocument();
    expect(screen.queryByText('Solicitud enviada')).not.toBeInTheDocument();
  });
});
