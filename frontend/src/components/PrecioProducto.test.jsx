import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PrecioProducto from './PrecioProducto.jsx';

describe('PrecioProducto', () => {
  it('muestra porcentaje, precio anterior y precio promocional', () => {
    const { container } = render(
      <PrecioProducto
        precioLista="1000.00"
        precioVigente={{
          idPromocionProducto: 7,
          porcentajeDescuento: 15,
          precioListaCentavos: 100000,
          precioFinalCentavos: 85000,
        }}
      />,
    );

    expect(screen.getByText('15% OFF')).toBeInTheDocument();
    expect(container.querySelector('del')).toHaveTextContent(/1\.000,00/);
    expect(container.querySelector('.precio-producto__actual')).toHaveTextContent(/850,00/);
  });

  it('muestra solo el precio de lista si no hay promoción vigente', () => {
    const { container } = render(
      <PrecioProducto
        precioLista="1000.00"
        precioVigente={{
          idPromocionProducto: null,
          precioListaCentavos: 100000,
          precioFinalCentavos: 100000,
        }}
      />,
    );

    expect(screen.queryByText(/OFF/)).not.toBeInTheDocument();
    expect(container.querySelector('del')).not.toBeInTheDocument();
    expect(container.querySelector('.precio-producto__actual')).toHaveTextContent(/1\.000,00/);
  });
});
