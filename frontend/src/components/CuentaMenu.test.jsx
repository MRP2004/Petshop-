import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CuentaMenu from './CuentaMenu.jsx';

const renderizar = (props = {}) =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <CuentaMenu
              etiqueta="Cliente"
              enlaces={[{ to: '/mi-cuenta', etiqueta: 'Mi cuenta' }]}
              onPedirSalir={vi.fn()}
              {...props}
            />
          }
        />
        <Route path="/mi-cuenta" element={<div data-testid="pagina-mi-cuenta" />} />
        <Route path="/mis-favoritos" element={<div data-testid="pagina-mis-favoritos" />} />
      </Routes>
    </MemoryRouter>,
  );

describe('CuentaMenu', () => {
  it('muestra la etiqueta (nombre real o "Panel (rol)") y el menú arranca cerrado', () => {
    renderizar();
    expect(screen.getByRole('button', { name: /Cliente/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('clic en el botón abre el menú con el destino real y "Salir"', async () => {
    renderizar();
    await userEvent.click(screen.getByRole('button', { name: /Cliente/ }));

    expect(screen.getByRole('menuitem', { name: 'Mi cuenta' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Salir' })).toBeInTheDocument();
  });

  it('clic en el enlace del menú navega y cierra el menú', async () => {
    renderizar();
    await userEvent.click(screen.getByRole('button', { name: /Cliente/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mi cuenta' }));

    expect(await screen.findByTestId('pagina-mi-cuenta')).toBeInTheDocument();
  });

  it('clic en "Salir" cierra el menú y llama a onPedirSalir (no cierra sesión directo)', async () => {
    const onPedirSalir = vi.fn();
    renderizar({ onPedirSalir });

    await userEvent.click(screen.getByRole('button', { name: /Cliente/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Salir' }));

    expect(onPedirSalir).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('teclado: Enter en el botón abre el menú con foco en el primer ítem, Escape cierra y devuelve el foco', async () => {
    renderizar();
    const boton = screen.getByRole('button', { name: /Cliente/ });
    boton.focus();

    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('menuitem', { name: 'Mi cuenta' })).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(boton).toHaveFocus();
  });

  it('con varios enlaces, muestra todos y ArrowDown navega de uno a otro y luego a "Salir"', async () => {
    renderizar({
      enlaces: [
        { to: '/mi-cuenta', etiqueta: 'Mi cuenta' },
        { to: '/mis-favoritos', etiqueta: 'Mis favoritos' },
      ],
    });

    const boton = screen.getByRole('button', { name: /Cliente/ });
    boton.focus();
    await userEvent.keyboard('{Enter}');

    expect(await screen.findByRole('menuitem', { name: 'Mi cuenta' })).toHaveFocus();

    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Mis favoritos' })).toHaveFocus();

    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Salir' })).toHaveFocus();

    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Mis favoritos' })).toHaveFocus();
  });

  it('clic en "Mis favoritos" navega a esa página', async () => {
    renderizar({
      enlaces: [
        { to: '/mi-cuenta', etiqueta: 'Mi cuenta' },
        { to: '/mis-favoritos', etiqueta: 'Mis favoritos' },
      ],
    });

    await userEvent.click(screen.getByRole('button', { name: /Cliente/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mis favoritos' }));

    expect(await screen.findByTestId('pagina-mis-favoritos')).toBeInTheDocument();
  });
});
