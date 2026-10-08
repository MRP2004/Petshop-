import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useSearchParams } from 'react-router-dom';
import BuscadorPredictivo from './BuscadorPredictivo.jsx';
import productosApi from '../api/productos.api.js';

// Buscador predictivo del encabezado (ronda 2, ver docs/frontend-diseno.md):
// sugerencias desde la primera letra, teclado completo, y una respuesta
// vieja que nunca debe reemplazar sugerencias de una consulta más reciente.
vi.mock('../api/productos.api.js', () => ({
  default: { sugerencias: vi.fn() },
}));

const PaginaCatalogo = () => {
  const [parametros] = useSearchParams();
  return <div data-testid="pagina-catalogo">catalogo:{parametros.get('buscar') || ''}</div>;
};

const renderizar = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<BuscadorPredictivo />} />
        <Route path="/productos/:id" element={<div data-testid="pagina-producto" />} />
        <Route path="/catalogo" element={<PaginaCatalogo />} />
      </Routes>
    </MemoryRouter>,
  );

const producto = (overrides = {}) => ({
  idProducto: 1,
  nombre: 'Alimento para perro',
  precio: '18999.00',
  ...overrides,
});

describe('BuscadorPredictivo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra sugerencias con imagen/nombre/precio tras escribir', async () => {
    productosApi.sugerencias.mockResolvedValue([producto()]);
    renderizar();

    await userEvent.type(screen.getByLabelText('Buscar productos'), 'alim');

    await waitFor(() => expect(productosApi.sugerencias).toHaveBeenCalledWith('alim'));
    expect(await screen.findByText('Alimento para perro')).toBeInTheDocument();
    expect(screen.getByText(/18\.999/)).toBeInTheDocument();
  });

  it('muestra "sin resultados" cuando la búsqueda no encuentra nada', async () => {
    productosApi.sugerencias.mockResolvedValue([]);
    renderizar();

    await userEvent.type(screen.getByLabelText('Buscar productos'), 'zzz');

    expect(await screen.findByText(/Sin resultados para/)).toBeInTheDocument();
  });

  it('muestra un aviso de error si el pedido falla, sin romper el campo', async () => {
    productosApi.sugerencias.mockRejectedValue(new Error('falla de red'));
    renderizar();

    await userEvent.type(screen.getByLabelText('Buscar productos'), 'alim');

    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudieron cargar/i);
    expect(screen.getByLabelText('Buscar productos')).toHaveValue('alim');
  });

  it('una respuesta vieja no reemplaza las sugerencias de la consulta más reciente', async () => {
    let resolverPrimera;
    productosApi.sugerencias
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolverPrimera = resolve;
          }),
      )
      .mockResolvedValueOnce([producto({ idProducto: 2, nombre: 'Juguete nuevo' })]);

    renderizar();
    const campo = screen.getByLabelText('Buscar productos');

    await userEvent.type(campo, 'al');
    await waitFor(() => expect(productosApi.sugerencias).toHaveBeenCalledWith('al'));

    await userEvent.type(campo, 'go');
    await waitFor(() => expect(productosApi.sugerencias).toHaveBeenCalledWith('algo'));
    expect(await screen.findByText('Juguete nuevo')).toBeInTheDocument();

    // La primera respuesta (de "al") llega tarde, después de que "algo" ya
    // resolvió: no debe pisar lo que ya se muestra.
    resolverPrimera([producto({ idProducto: 1, nombre: 'Alimento viejo' })]);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.getByText('Juguete nuevo')).toBeInTheDocument();
    expect(screen.queryByText('Alimento viejo')).not.toBeInTheDocument();
  });

  it('ArrowDown selecciona la primera sugerencia y Enter navega a su ficha de producto', async () => {
    productosApi.sugerencias.mockResolvedValue([producto()]);
    renderizar();
    const campo = screen.getByLabelText('Buscar productos');

    await userEvent.type(campo, 'alim');
    await screen.findByText('Alimento para perro');

    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('option', { name: /Alimento para perro/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await userEvent.keyboard('{Enter}');
    expect(await screen.findByTestId('pagina-producto')).toBeInTheDocument();
  });

  it('un clic sobre una sugerencia navega a su ficha de producto y limpia el campo', async () => {
    productosApi.sugerencias.mockResolvedValue([producto()]);
    renderizar();
    const campo = screen.getByLabelText('Buscar productos');

    await userEvent.type(campo, 'alim');
    await userEvent.click(await screen.findByText('Alimento para perro'));

    expect(await screen.findByTestId('pagina-producto')).toBeInTheDocument();
  });

  it('Enter sin ninguna sugerencia activa conserva el comportamiento anterior: abre el catálogo con la búsqueda completa', async () => {
    productosApi.sugerencias.mockResolvedValue([producto()]);
    renderizar();
    const campo = screen.getByLabelText('Buscar productos');

    await userEvent.type(campo, 'Pelota');
    await screen.findByText('Alimento para perro');

    await userEvent.keyboard('{Enter}');

    expect(await screen.findByTestId('pagina-catalogo')).toHaveTextContent('catalogo:Pelota');
  });

  it('Escape cierra el panel sin borrar el texto escrito', async () => {
    productosApi.sugerencias.mockResolvedValue([producto()]);
    renderizar();
    const campo = screen.getByLabelText('Buscar productos');

    await userEvent.type(campo, 'alim');
    await screen.findByText('Alimento para perro');

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByText('Alimento para perro')).not.toBeInTheDocument();
    expect(campo).toHaveValue('alim');
  });

  it('con el campo vacío no llama a la API ni muestra el panel', async () => {
    renderizar();
    expect(productosApi.sugerencias).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
