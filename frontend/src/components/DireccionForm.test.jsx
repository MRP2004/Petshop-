import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DireccionForm from './DireccionForm.jsx';
import georefApi from '../api/georef.api.js';

vi.mock('../api/georef.api.js', () => ({
  default: { obtenerProvincias: vi.fn(), obtenerLocalidades: vi.fn() },
}));

const PROVINCIAS = [
  { id: '82', nombre: 'Santa Fe' },
  { id: '02', nombre: 'Ciudad Autónoma de Buenos Aires' },
];

const LOCALIDADES_SANTA_FE = [
  { id: '82084270', nombre: 'Rosario' },
  { id: '82021050', nombre: 'Rafaela' },
  { id: '82063080', nombre: 'Reconquista' },
];

describe('DireccionForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    georefApi.obtenerProvincias.mockResolvedValue(PROVINCIAS);
    georefApi.obtenerLocalidades.mockResolvedValue(LOCALIDADES_SANTA_FE);
  });

  it('carga provincias, y la localidad queda deshabilitada hasta elegir una', async () => {
    render(<DireccionForm onGuardar={vi.fn()} />);

    expect(await screen.findByRole('option', { name: 'Santa Fe' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Localidad' })).toBeDisabled();
  });

  it('al elegir provincia, escribir "R" en localidad muestra las 3 que empiezan con R (Rosario incluida)', async () => {
    render(<DireccionForm onGuardar={vi.fn()} />);
    await screen.findByRole('option', { name: 'Santa Fe' });

    await userEvent.selectOptions(screen.getByLabelText('Provincia'), '82');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Localidad' })).toBeEnabled());

    await userEvent.type(screen.getByRole('combobox', { name: 'Localidad' }), 'R');

    expect(await screen.findByRole('option', { name: 'Rosario' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Rafaela' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Reconquista' })).toBeInTheDocument();
  });

  it('elegir una localidad de la lista completa el campo y habilita guardar con calle/número', async () => {
    const onGuardar = vi.fn();
    render(<DireccionForm onGuardar={onGuardar} />);
    await screen.findByRole('option', { name: 'Santa Fe' });

    await userEvent.selectOptions(screen.getByLabelText('Provincia'), '82');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Localidad' })).toBeEnabled());
    await userEvent.type(screen.getByRole('combobox', { name: 'Localidad' }), 'Rosario');
    await userEvent.click(await screen.findByRole('option', { name: 'Rosario' }));

    expect(screen.getByRole('combobox', { name: 'Localidad' })).toHaveValue('Rosario');
    expect(screen.getByRole('button', { name: 'Guardar dirección' })).toBeDisabled(); // sin calle/número todavía

    await userEvent.type(screen.getByLabelText('Calle'), 'San Martín');
    await userEvent.type(screen.getByLabelText('Número'), '1234');

    expect(screen.getByRole('button', { name: 'Guardar dirección' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Guardar dirección' }));

    expect(onGuardar).toHaveBeenCalledWith({
      idProvincia: '82',
      idLocalidad: '82084270',
      calle: 'San Martín',
      numero: '1234',
      piso: undefined,
      indicaciones: undefined,
    });
  });

  it('escribir sin elegir de la lista no habilita guardar (localidad no confirmada)', async () => {
    render(<DireccionForm onGuardar={vi.fn()} />);
    await screen.findByRole('option', { name: 'Santa Fe' });

    await userEvent.selectOptions(screen.getByLabelText('Provincia'), '82');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Localidad' })).toBeEnabled());
    await userEvent.type(screen.getByRole('combobox', { name: 'Localidad' }), 'Rosario');
    await userEvent.type(screen.getByLabelText('Calle'), 'San Martín');
    await userEvent.type(screen.getByLabelText('Número'), '1234');

    expect(screen.getByText('Elegí una localidad de la lista.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar dirección' })).toBeDisabled();
  });

  it('cambiar de provincia limpia la localidad ya elegida', async () => {
    render(<DireccionForm onGuardar={vi.fn()} />);
    await screen.findByRole('option', { name: 'Santa Fe' });

    await userEvent.selectOptions(screen.getByLabelText('Provincia'), '82');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Localidad' })).toBeEnabled());
    await userEvent.type(screen.getByRole('combobox', { name: 'Localidad' }), 'Rosario');
    await userEvent.click(await screen.findByRole('option', { name: 'Rosario' }));
    expect(screen.getByRole('combobox', { name: 'Localidad' })).toHaveValue('Rosario');

    georefApi.obtenerLocalidades.mockResolvedValue([{ id: '0208401002', nombre: 'Saavedra' }]);
    await userEvent.selectOptions(screen.getByLabelText('Provincia'), '02');

    expect(screen.getByRole('combobox', { name: 'Localidad' })).toHaveValue('');
  });

  it('si falla la carga de localidades de la nueva provincia, no sugiere las de la provincia anterior (hallazgo de Codex)', async () => {
    render(<DireccionForm onGuardar={vi.fn()} />);
    await screen.findByRole('option', { name: 'Santa Fe' });

    // Primero Santa Fe carga bien.
    await userEvent.selectOptions(screen.getByLabelText('Provincia'), '82');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Localidad' })).toBeEnabled());

    // Cambia a CABA, y esa carga falla.
    georefApi.obtenerLocalidades.mockRejectedValueOnce(new Error('No se pudo cargar la lista de localidades.'));
    await userEvent.selectOptions(screen.getByLabelText('Provincia'), '02');

    await screen.findByText('No se pudo cargar la lista de localidades.');
    expect(screen.getByRole('combobox', { name: 'Localidad' })).toBeDisabled();

    // Ni siquiera si alguien fuerza texto en el campo (por ejemplo, un
    // valor pegado) deben aparecer sugerencias de Santa Fe.
    expect(screen.queryByRole('option', { name: 'Rosario' })).not.toBeInTheDocument();
  });

  it('precarga los valores de una dirección ya guardada (edición)', async () => {
    render(
      <DireccionForm
        valorInicial={{
          idProvincia: '82',
          provincia: 'Santa Fe',
          idLocalidad: '82084270',
          localidad: 'Rosario',
          calle: 'San Martín',
          numero: '1234',
          piso: '4B',
          indicaciones: 'Timbre azul',
        }}
        onGuardar={vi.fn()}
      />,
    );

    await screen.findByRole('option', { name: 'Santa Fe' });

    expect(screen.getByLabelText('Provincia')).toHaveValue('82');
    expect(screen.getByRole('combobox', { name: 'Localidad' })).toHaveValue('Rosario');
    expect(screen.getByLabelText('Calle')).toHaveValue('San Martín');
    expect(screen.getByLabelText('Número')).toHaveValue('1234');
    expect(screen.getByLabelText(/Piso/)).toHaveValue('4B');
  });

  it('muestra el error de guardado sin perder los datos ya escritos', async () => {
    render(<DireccionForm onGuardar={vi.fn()} error="La localidad indicada no pertenece a la provincia elegida" />);
    await screen.findByRole('option', { name: 'Santa Fe' });
    expect(screen.getByText('La localidad indicada no pertenece a la provincia elegida')).toBeInTheDocument();
  });
});
