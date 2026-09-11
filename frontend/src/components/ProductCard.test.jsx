import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ProductCard from './ProductCard.jsx';
import { CarritoProvider } from '../context/CarritoContext.jsx';
import { useCarrito } from '../hooks/useCarrito.js';

const producto = {
  idProducto: 1,
  nombre: 'Alimento perro adulto 15kg',
  precio: '25999.00',
  stockActual: 10,
};

// Componente auxiliar solo para exponer la cantidad de items del carrito en
// el DOM y poder comprobar, en el test, que "Agregar al carrito" realmente
// actualiza el estado compartido (reactividad ante un evento del usuario).
const ContadorDeCarrito = () => {
  const { carrito } = useCarrito();
  return <span data-testid="cantidad-carrito">{carrito.cantidadTotal}</span>;
};

const renderizar = (productoAMostrar) =>
  render(
    <MemoryRouter>
      <CarritoProvider>
        <ContadorDeCarrito />
        <ProductCard producto={productoAMostrar} />
      </CarritoProvider>
    </MemoryRouter>,
  );

describe('ProductCard', () => {
  it('muestra nombre, precio formateado y disponibilidad', () => {
    renderizar(producto);

    expect(screen.getByText('Alimento perro adulto 15kg')).toBeInTheDocument();
    expect(screen.getByText(/25\.999/)).toBeInTheDocument();
    expect(screen.getByText(/Disponible \(10\)/)).toBeInTheDocument();
  });

  it('al hacer click en "Agregar al carrito" suma un item al carrito (evento de usuario + reactividad)', async () => {
    renderizar(producto);

    expect(screen.getByTestId('cantidad-carrito')).toHaveTextContent('0');

    await userEvent.click(screen.getByRole('button', { name: /Agregar al carrito/i }));

    expect(screen.getByTestId('cantidad-carrito')).toHaveTextContent('1');
  });

  it('sin stock, el botón de agregar está deshabilitado y avisa "Sin stock"', () => {
    renderizar({ ...producto, stockActual: 0 });

    expect(screen.getByText('Sin stock')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Agregar al carrito/i })).toBeDisabled();
  });
});
