import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AjustarStockDialog from './AjustarStockDialog.jsx';

const producto = { nombre: 'Alimento perro adulto 15kg', stockActual: 10 };

describe('AjustarStockDialog', () => {
  it('no renderiza nada sin un producto (quien lo usa lo monta condicionalmente, ver PanelProductos.jsx)', () => {
    render(<AjustarStockDialog producto={null} onConfirmar={vi.fn()} onCancelar={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('muestra el stock actual y calcula el resultado en vivo', async () => {
    render(<AjustarStockDialog producto={producto} onConfirmar={vi.fn()} onCancelar={vi.fn()} />);

    expect(screen.getByText('10', { exact: false })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Movimiento/), '5');

    expect(screen.getByText(/Resultado:/)).toHaveTextContent('Resultado: 15');
  });

  it('un resultado negativo deshabilita "Guardar" y avisa', async () => {
    render(<AjustarStockDialog producto={producto} onConfirmar={vi.fn()} onCancelar={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/Movimiento/), '-20');

    expect(screen.getByText(/no puede quedar negativo/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('cantidad cero o vacía deshabilita "Guardar"', async () => {
    render(<AjustarStockDialog producto={producto} onConfirmar={vi.fn()} onCancelar={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/Movimiento/), '0');
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('confirmar con una cantidad válida llama a onConfirmar con el número', async () => {
    const onConfirmar = vi.fn();
    render(<AjustarStockDialog producto={producto} onConfirmar={onConfirmar} onCancelar={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/Movimiento/), '3');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onConfirmar).toHaveBeenCalledWith(3);
  });

  it('muestra el error si la API rechaza el movimiento', () => {
    render(
      <AjustarStockDialog
        producto={producto}
        error="El movimiento dejaría el stock en un valor inválido"
        onConfirmar={vi.fn()}
        onCancelar={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('El movimiento dejaría el stock en un valor inválido');
  });

  it('Escape cierra el diálogo (llama a onCancelar)', async () => {
    const onCancelar = vi.fn();
    render(<AjustarStockDialog producto={producto} onConfirmar={vi.fn()} onCancelar={onCancelar} />);

    await userEvent.keyboard('{Escape}');
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });

  it('mientras cargando, Escape no cierra', async () => {
    const onCancelar = vi.fn();
    render(<AjustarStockDialog producto={producto} cargando onConfirmar={vi.fn()} onCancelar={onCancelar} />);

    await userEvent.keyboard('{Escape}');
    expect(onCancelar).not.toHaveBeenCalled();
  });

  it('Tab no deja escapar el foco del diálogo (trampa de foco)', async () => {
    render(<AjustarStockDialog producto={producto} onConfirmar={vi.fn()} onCancelar={vi.fn()} />);

    const campo = screen.getByLabelText(/Movimiento/);
    const botonCancelar = screen.getByRole('button', { name: 'Cancelar' });
    const botonGuardar = screen.getByRole('button', { name: 'Guardar' });

    // Con una cantidad válida "Guardar" deja de estar disabled (los
    // elementos disabled no entran en la trampa de foco, igual que en un
    // navegador real), así el ciclo completo es campo -> Cancelar -> Guardar.
    await userEvent.type(campo, '3');
    expect(botonGuardar).toBeEnabled();

    campo.focus();
    await userEvent.tab();
    expect(botonCancelar).toHaveFocus();

    await userEvent.tab();
    expect(botonGuardar).toHaveFocus();

    await userEvent.tab();
    expect(campo).toHaveFocus(); // vuelve al primero, no se escapa del diálogo
  });
});
