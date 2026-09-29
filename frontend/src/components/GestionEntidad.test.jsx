import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GestionEntidad from './GestionEntidad.jsx';

// Ronda 2 (ver docs/frontend-diseno.md): reemplaza el `window.confirm`/
// `window.alert` que tenía "Eliminar" por el ConfirmDialog reutilizable —
// esto es justamente lo que antes no se podía probar con facilidad (mockear
// window.confirm no deja probar un error de la API sin cerrar el diálogo).
const columnas = [{ clave: 'nombre', etiqueta: 'Nombre' }];
const campos = [{ nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true }];

const crearServicio = (overrides = {}) => ({
  listar: vi.fn().mockResolvedValue([{ idCategoria: 1, nombre: 'Alimento' }]),
  crear: vi.fn(),
  actualizar: vi.fn(),
  eliminar: vi.fn(),
  ...overrides,
});

describe('GestionEntidad — borrado con confirmación', () => {
  it('clic en "Eliminar" abre el diálogo sin llamar todavía al servicio', async () => {
    const servicio = crearServicio();
    render(<GestionEntidad titulo="Categorías" servicio={servicio} campos={campos} columnas={columnas} idCampo="idCategoria" />);

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(servicio.eliminar).not.toHaveBeenCalled();
  });

  it('confirmar en el diálogo llama al servicio y recarga la lista', async () => {
    const servicio = crearServicio();
    render(<GestionEntidad titulo="Categorías" servicio={servicio} campos={campos} columnas={columnas} idCampo="idCategoria" />);

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    // Dos botones dicen "Eliminar" con el diálogo abierto (la fila y el
    // diálogo); el del diálogo es el segundo.
    await userEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[1]);

    await waitFor(() => expect(servicio.eliminar).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('cancelar en el diálogo NO llama al servicio y lo cierra', async () => {
    const servicio = crearServicio();
    render(<GestionEntidad titulo="Categorías" servicio={servicio} campos={campos} columnas={columnas} idCampo="idCategoria" />);

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(servicio.eliminar).not.toHaveBeenCalled();
  });

  it('si el servicio falla, el diálogo se queda abierto y muestra el error', async () => {
    const servicio = crearServicio({ eliminar: vi.fn().mockRejectedValue(new Error('No se puede borrar: tiene ventas asociadas')) });
    render(<GestionEntidad titulo="Categorías" servicio={servicio} campos={campos} columnas={columnas} idCampo="idCategoria" />);

    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[1]);

    expect(await screen.findByText('No se puede borrar: tiene ventas asociadas')).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
