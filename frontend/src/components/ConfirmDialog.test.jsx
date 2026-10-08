import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmDialog from './ConfirmDialog.jsx';

describe('ConfirmDialog', () => {
  it('no renderiza nada cuando abierto=false', () => {
    render(<ConfirmDialog abierto={false} titulo="t" mensaje="m" onConfirmar={vi.fn()} onCancelar={vi.fn()} />);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('muestra título/mensaje y llama a onConfirmar/onCancelar', async () => {
    const onConfirmar = vi.fn();
    const onCancelar = vi.fn();

    render(
      <ConfirmDialog
        abierto
        titulo="¿Cancelar la venta #5?"
        mensaje="Se restituye el stock vendido."
        textoConfirmar="Cancelar venta"
        textoCancelar="Volver"
        onConfirmar={onConfirmar}
        onCancelar={onCancelar}
      />,
    );

    expect(screen.getByRole('alertdialog', { name: /Cancelar la venta #5/ })).toBeInTheDocument();
    expect(screen.getByText('Se restituye el stock vendido.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar venta' }));
    expect(onConfirmar).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });

  it('el foco inicial va al botón de cancelar, no al de confirmar', () => {
    render(
      <ConfirmDialog
        abierto
        titulo="t"
        mensaje="m"
        textoConfirmar="Confirmar"
        textoCancelar="Volver"
        onConfirmar={vi.fn()}
        onCancelar={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Volver' })).toHaveFocus();
  });

  it('Escape llama a onCancelar', async () => {
    const onCancelar = vi.fn();
    render(<ConfirmDialog abierto titulo="t" mensaje="m" onConfirmar={vi.fn()} onCancelar={onCancelar} />);

    await userEvent.keyboard('{Escape}');
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });

  it('mientras cargando, los botones están deshabilitados y Escape no cierra', async () => {
    const onCancelar = vi.fn();
    render(
      <ConfirmDialog
        abierto
        titulo="t"
        mensaje="m"
        textoConfirmar="Confirmar"
        cargando
        onConfirmar={vi.fn()}
        onCancelar={onCancelar}
      />,
    );

    expect(screen.getByRole('button', { name: 'Procesando…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();

    await userEvent.keyboard('{Escape}');
    expect(onCancelar).not.toHaveBeenCalled();
  });

  it('el mensaje está asociado al diálogo vía aria-describedby', () => {
    render(
      <ConfirmDialog
        abierto
        titulo="t"
        mensaje="Se restituye el stock vendido y no se puede deshacer."
        onConfirmar={vi.fn()}
        onCancelar={vi.fn()}
      />,
    );

    const dialogo = screen.getByRole('alertdialog');
    const idDescripcion = dialogo.getAttribute('aria-describedby');
    expect(idDescripcion).toBeTruthy();
    expect(document.getElementById(idDescripcion)).toHaveTextContent(
      'Se restituye el stock vendido y no se puede deshacer.',
    );
  });

  it('Tab desde el último botón vuelve al primero, y Shift+Tab desde el primero va al último (trampa de foco)', async () => {
    render(
      <ConfirmDialog
        abierto
        titulo="t"
        mensaje="m"
        textoConfirmar="Confirmar"
        textoCancelar="Volver"
        onConfirmar={vi.fn()}
        onCancelar={vi.fn()}
      />,
    );

    const botonVolver = screen.getByRole('button', { name: 'Volver' });
    const botonConfirmar = screen.getByRole('button', { name: 'Confirmar' });

    expect(botonVolver).toHaveFocus();

    await userEvent.tab();
    expect(botonConfirmar).toHaveFocus();

    await userEvent.tab();
    expect(botonVolver).toHaveFocus(); // no se escapó del diálogo hacia el fondo

    await userEvent.tab({ shift: true });
    expect(botonConfirmar).toHaveFocus();
  });
});
