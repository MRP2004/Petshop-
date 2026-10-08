import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Checkout from './Checkout.jsx';
import { CarritoProvider } from '../context/CarritoContext.jsx';
import { AuthProvider } from '../context/AuthContext.jsx';
import { ErrorApi } from '../api/httpClient.js';
import comprasApi from '../api/compras.api.js';
import clientesApi from '../api/clientes.api.js';
import * as authApi from '../api/auth.api.js';

// El checkout SIEMPRE cotiza contra el backend (nunca confía en el precio
// que el carrito guarda localmente) — mockeamos exclusivamente la capa de
// red, no el carrito ni el componente.
vi.mock('../api/compras.api.js', () => ({
  default: { cotizar: vi.fn(), confirmar: vi.fn(), consultarIntento: vi.fn() },
}));

// Ronda 2: el wrapper de Checkout pide la dirección guardada del cliente
// para pre-llenar el campo de texto libre (ver Checkout.jsx). Por defecto
// no hay ninguna guardada (null) — los tests que sí la necesitan la
// sobreescriben con mockResolvedValueOnce.
vi.mock('../api/clientes.api.js', () => ({
  default: { obtenerDireccion: vi.fn().mockResolvedValue(null), guardarDireccion: vi.fn() },
}));

vi.mock('../api/auth.api.js', () => ({
  obtenerPerfil: vi.fn(),
  iniciarSesion: vi.fn(),
  registrarse: vi.fn(),
  cerrarSesion: vi.fn(),
}));

const USUARIO_CLIENTE = { idUsuario: 1, rol: 'cliente', idCliente: 7 };

const producto = {
  idProducto: 1,
  nombre: 'Alimento perro adulto 15kg',
  precio: '1000.00',
  stockActual: 10,
};

const cotizacionBase = {
  lineas: [
    {
      idProducto: 1,
      nombre: producto.nombre,
      cantidad: 2,
      precioListaCentavos: 100000,
      idPromocionProducto: null,
      porcentajeDescuento: 0,
      montoDescuentoCentavos: 0,
      precioFinalCentavos: 100000,
      subtotalCentavos: 200000,
    },
  ],
  totalCentavos: 200000,
  emitidaEn: new Date().toISOString(),
};

const sembrarCarrito = () => {
  localStorage.setItem('petshop_carrito', JSON.stringify([{ producto, cantidad: 2 }]));
};

const renderizar = () =>
  render(
    <MemoryRouter initialEntries={['/checkout']}>
      <AuthProvider>
        <CarritoProvider>
          <Routes>
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/mis-compras/:id" element={<span>pantalla-comprobante</span>} />
            <Route path="/carrito" element={<span>pantalla-carrito</span>} />
          </Routes>
        </CarritoProvider>
      </AuthProvider>
    </MemoryRouter>,
  );

describe('Checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sembrarCarrito();
    authApi.obtenerPerfil.mockResolvedValue(USUARIO_CLIENTE);
  });

  it('muestra el resumen que devuelve la cotización del backend, no el precio local del carrito', async () => {
    comprasApi.cotizar.mockResolvedValue(cotizacionBase);

    renderizar();

    await waitFor(() => expect(comprasApi.cotizar).toHaveBeenCalledWith([{ idProducto: 1, cantidad: 2 }]));
    expect(await screen.findByTestId('checkout-total')).toHaveTextContent('2.000');
  });

  it('con una dirección guardada, el campo de entrega se pre-llena (pero sigue editable)', async () => {
    comprasApi.cotizar.mockResolvedValue(cotizacionBase);
    clientesApi.obtenerDireccion.mockResolvedValueOnce({
      idProvincia: '82',
      provincia: 'Santa Fe',
      idLocalidad: '82084270',
      localidad: 'Rosario',
      calle: 'San Martín',
      numero: '1234',
      piso: '4B',
      indicaciones: 'Timbre azul',
    });

    renderizar();
    await screen.findByTestId('checkout-total');

    await userEvent.selectOptions(screen.getByLabelText('Entrega'), 'envío a domicilio');

    expect(screen.getByLabelText('Dirección de entrega')).toHaveValue('San Martín 1234, 4B, Rosario, Santa Fe');
  });

  it('sin dirección guardada (o si falla el pedido), el campo de entrega queda vacío como siempre', async () => {
    comprasApi.cotizar.mockResolvedValue(cotizacionBase);
    clientesApi.obtenerDireccion.mockRejectedValueOnce(new Error('falla de red'));

    renderizar();
    await screen.findByTestId('checkout-total');

    await userEvent.selectOptions(screen.getByLabelText('Entrega'), 'envío a domicilio');

    expect(screen.getByLabelText('Dirección de entrega')).toHaveValue('');
  });

  it('con débito, exige los campos de la tarjeta antes de enviar nada al backend', async () => {
    comprasApi.cotizar.mockResolvedValue(cotizacionBase);
    renderizar();
    await screen.findByTestId('checkout-total');

    await userEvent.click(screen.getByLabelText(/Débito \(simulado\)/i));
    await userEvent.click(screen.getByRole('button', { name: /Confirmar y pagar/i }));

    expect(comprasApi.confirmar).not.toHaveBeenCalled();
    expect(screen.getByText(/Debe tener 16 dígitos/)).toBeInTheDocument();
  });

  it('confirma con transferencia simulada y navega al comprobante', async () => {
    comprasApi.cotizar.mockResolvedValue(cotizacionBase);
    comprasApi.confirmar.mockResolvedValue({ idVenta: 42, estado: 'registrada' });
    renderizar();
    await screen.findByTestId('checkout-total');

    await userEvent.click(screen.getByRole('button', { name: /Confirmar y pagar/i }));

    expect(await screen.findByText('pantalla-comprobante')).toBeInTheDocument();
    const cuerpoEnviado = comprasApi.confirmar.mock.calls[0][0];
    expect(cuerpoEnviado.tipoPagoSimulado).toBe('transferencia');
    expect(cuerpoEnviado.detalles).toEqual([{ idProducto: 1, cantidad: 2 }]);
    expect(cuerpoEnviado.cotizacionAceptada).toEqual(cotizacionBase);
    expect(typeof cuerpoEnviado.claveIdempotencia).toBe('string');
    expect(cuerpoEnviado.claveIdempotencia.length).toBeGreaterThan(0);
  });

  it('si la cotización quedó desactualizada (409), muestra el resumen nuevo y NO navega', async () => {
    const cotizacionActualizada = {
      ...cotizacionBase,
      totalCentavos: 180000,
      lineas: [{ ...cotizacionBase.lineas[0], precioFinalCentavos: 90000, subtotalCentavos: 180000 }],
    };
    comprasApi.cotizar.mockResolvedValue(cotizacionBase);
    comprasApi.confirmar.mockRejectedValue(
      new ErrorApi('La cotización aceptada cambió', 409, {
        codigo: 'COTIZACION_DESACTUALIZADA',
        cotizacionVigente: cotizacionActualizada,
      }),
    );
    renderizar();
    await screen.findByTestId('checkout-total');

    await userEvent.click(screen.getByRole('button', { name: /Confirmar y pagar/i }));

    expect(await screen.findByText(/Los precios cambiaron/)).toBeInTheDocument();
    expect(screen.getByTestId('checkout-total')).toHaveTextContent('1.800');
    expect(screen.queryByText('pantalla-comprobante')).not.toBeInTheDocument();
  });

  it('si un producto ya no está disponible al cotizar (409), muestra el motivo y ofrece volver al carrito', async () => {
    comprasApi.cotizar.mockRejectedValue(
      new ErrorApi('El producto "Alimento perro adulto 15kg" ya no está disponible para la venta', 409),
    );
    renderizar();

    expect(await screen.findByText(/ya no está disponible para la venta/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Volver al carrito' }));
    expect(await screen.findByText('pantalla-carrito')).toBeInTheDocument();
  });

  it('si un producto deja de estar disponible al confirmar (409), muestra el motivo y no navega', async () => {
    comprasApi.cotizar.mockResolvedValue(cotizacionBase);
    comprasApi.confirmar.mockRejectedValue(
      new ErrorApi('El producto "Alimento perro adulto 15kg" ya no está disponible para la venta', 409),
    );
    renderizar();
    await screen.findByTestId('checkout-total');

    await userEvent.click(screen.getByRole('button', { name: /Confirmar y pagar/i }));

    expect(await screen.findByText(/ya no está disponible para la venta/)).toBeInTheDocument();
    expect(screen.queryByText('pantalla-comprobante')).not.toBeInTheDocument();
  });

  it('si el pago simulado es rechazado (402), muestra el motivo y no navega', async () => {
    comprasApi.cotizar.mockResolvedValue(cotizacionBase);
    comprasApi.confirmar.mockRejectedValue(
      new ErrorApi('Pago rechazado', 402, { motivoRechazo: 'Fondos insuficientes (simulado)' }),
    );
    renderizar();
    await screen.findByTestId('checkout-total');

    await userEvent.click(screen.getByRole('button', { name: /Confirmar y pagar/i }));

    expect(await screen.findByText(/Fondos insuficientes \(simulado\)/)).toBeInTheDocument();
    expect(screen.queryByText('pantalla-comprobante')).not.toBeInTheDocument();
  });

  // --- Recuperación tras perder la respuesta (CU-04, §1) ---

  it('con un intento guardado ya aprobado, navega directo al comprobante sin volver a cotizar', async () => {
    localStorage.setItem(
      'petshop_compra_en_curso',
      JSON.stringify({
        idCliente: 7,
        firma: '1:2',
        clave: 'clave-guardada-aprobada',
        entrega: { metodoEntrega: 'retiro en sucursal' },
      }),
    );
    comprasApi.consultarIntento.mockResolvedValue({ encontrado: true, estado: 'aprobado', idVenta: 99 });

    renderizar();

    expect(await screen.findByText('pantalla-comprobante')).toBeInTheDocument();
    expect(comprasApi.consultarIntento).toHaveBeenCalledWith('clave-guardada-aprobada');
    expect(comprasApi.cotizar).not.toHaveBeenCalled();
    expect(localStorage.getItem('petshop_compra_en_curso')).toBeNull();
  });

  it('con un intento guardado ya rechazado, muestra el motivo y exige un nuevo intento explícito', async () => {
    localStorage.setItem(
      'petshop_compra_en_curso',
      JSON.stringify({
        idCliente: 7,
        firma: '1:2',
        clave: 'clave-guardada-rechazada',
        entrega: { metodoEntrega: 'retiro en sucursal' },
      }),
    );
    comprasApi.consultarIntento.mockResolvedValue({
      encontrado: true,
      estado: 'rechazado',
      motivoRechazo: 'Fondos insuficientes (simulado)',
    });
    comprasApi.cotizar.mockResolvedValue(cotizacionBase);

    renderizar();

    expect(await screen.findByText(/Fondos insuficientes \(simulado\)/)).toBeInTheDocument();
    expect(comprasApi.cotizar).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /Iniciar un nuevo intento/i }));

    await waitFor(() => expect(comprasApi.cotizar).toHaveBeenCalled());
    expect(await screen.findByTestId('checkout-total')).toBeInTheDocument();
    expect(localStorage.getItem('petshop_compra_en_curso')).toBeNull();
  });

  it('con un intento guardado sin resolver todavía (no encontrado), sigue el flujo normal reutilizando la misma clave', async () => {
    localStorage.setItem(
      'petshop_compra_en_curso',
      JSON.stringify({
        idCliente: 7,
        firma: '1:2',
        clave: 'clave-guardada-incierta',
        entrega: { metodoEntrega: 'retiro en sucursal' },
      }),
    );
    comprasApi.consultarIntento.mockResolvedValue({ encontrado: false });
    comprasApi.cotizar.mockResolvedValue(cotizacionBase);
    comprasApi.confirmar.mockResolvedValue({ idVenta: 5, estado: 'registrada' });

    renderizar();

    await screen.findByTestId('checkout-total');
    await userEvent.click(screen.getByRole('button', { name: /Confirmar y pagar/i }));

    await waitFor(() => expect(comprasApi.confirmar).toHaveBeenCalled());
    expect(comprasApi.confirmar.mock.calls[0][0].claveIdempotencia).toBe('clave-guardada-incierta');
  });
});
