// Genera 4 PDF de muestra (compra simple, con descuento, cancelada, y con
// suficientes líneas para ocupar varias páginas) para revisar visualmente
// el diseño del comprobante (CU-04, §7) sin necesitar una base de datos ni
// una compra real. No escribe nada en ningún lado más que los 4 archivos de
// salida.
//
// Uso:
//   cd backend
//   node scripts/generarPdfsDeMuestra.js [carpetaDeSalida]
import { writeFileSync } from 'node:fs';
import { generarPdfComprobante } from '../src/services/comprobantePdf.service.js';

const clienteBase = { nombre: 'Ana', apellido: 'García' };

const detalle = (overrides) => ({
  idDetalleVenta: overrides.idDetalleVenta,
  cantidad: overrides.cantidad,
  precioUnitario: overrides.precioUnitario,
  subtotal: overrides.subtotal,
  producto: { nombre: overrides.nombre },
  promocionAplicada: overrides.promocionAplicada ?? null,
});

const ventaSimple = {
  idVenta: 1,
  fecha: new Date('2026-03-10T15:30:00-03:00'),
  total: '25000.00',
  estado: 'registrada',
  metodoEntrega: 'retiro en sucursal',
  cliente: clienteBase,
  comprobante: { numero: 'PS-2026-000001', nombreCompradorHistorico: 'Ana', apellidoCompradorHistorico: 'García' },
  pago: { tipo: 'transferencia', estado: 'aprobado_simulado' },
  detalles: [
    detalle({ idDetalleVenta: 1, cantidad: 1, precioUnitario: '25000.00', subtotal: '25000.00', nombre: 'Alimento perro adulto 15kg' }),
  ],
};

const ventaConDescuento = {
  idVenta: 2,
  fecha: new Date('2026-03-11T09:05:00-03:00'),
  total: '16000.00',
  estado: 'registrada',
  metodoEntrega: 'envío a domicilio',
  direccionEntrega: { direccion: 'Av. Siempre Viva 742, Rosario' },
  cliente: clienteBase,
  comprobante: { numero: 'PS-2026-000002', nombreCompradorHistorico: 'Ana', apellidoCompradorHistorico: 'García' },
  pago: { tipo: 'debito', estado: 'aprobado_simulado', ultimosCuatroDigitos: '0002' },
  detalles: [
    detalle({
      idDetalleVenta: 1,
      cantidad: 2,
      precioUnitario: '8000.00',
      subtotal: '16000.00',
      nombre: 'Alimento gato adulto 7.5kg',
      promocionAplicada: {
        nombreProductoHistorico: 'Alimento gato adulto 7.5kg',
        precioListaUnitario: '10000.00',
        porcentajeDescuento: '20.00',
        montoDescuentoUnitario: '2000.00',
      },
    }),
  ],
};

const ventaCancelada = {
  idVenta: 3,
  fecha: new Date('2026-03-12T18:45:00-03:00'),
  total: '3500.00',
  estado: 'cancelada',
  metodoEntrega: 'retiro en sucursal',
  cliente: clienteBase,
  comprobante: { numero: 'PS-2026-000003', nombreCompradorHistorico: 'Ana', apellidoCompradorHistorico: 'García' },
  pago: { tipo: 'transferencia', estado: 'revertido_simulado' },
  detalles: [
    detalle({ idDetalleVenta: 1, cantidad: 1, precioUnitario: '3500.00', subtotal: '3500.00', nombre: 'Pelota de goma resistente' }),
  ],
};

const nombresLargos = [
  'Alimento balanceado premium para perros adultos de razas grandes, sabor pollo y arroz, bolsa de 15kg',
  'Rascador de sisal con base de madera maciza y plataforma superior acolchada para gatos',
  'Shampoo hipoalergénico antipulgas y garrapatas para perros y gatos, fórmula suave, 500ml',
  'Juguete interactivo dispensador de premios para perros, resistente a mordidas fuertes',
  'Cama ortopédica acolchada con memory foam para perros de talla mediana y grande',
];

const detallesLargos = Array.from({ length: 18 }, (_, i) => {
  const nombre = nombresLargos[i % nombresLargos.length];
  const cantidad = (i % 3) + 1;
  return detalle({
    idDetalleVenta: i + 1,
    cantidad,
    precioUnitario: '1500.00',
    subtotal: (1500 * cantidad).toFixed(2),
    nombre,
  });
});

const ventaMultiplesPaginas = {
  idVenta: 4,
  fecha: new Date('2026-03-13T11:00:00-03:00'),
  total: detallesLargos.reduce((acc, d) => acc + Number(d.subtotal), 0).toFixed(2),
  estado: 'registrada',
  metodoEntrega: 'envío a domicilio',
  direccionEntrega: { direccion: 'Bv. Oroño 1500, Rosario, Santa Fe' },
  cliente: clienteBase,
  comprobante: { numero: 'PS-2026-000004', nombreCompradorHistorico: 'Ana', apellidoCompradorHistorico: 'García' },
  pago: { tipo: 'transferencia', estado: 'aprobado_simulado' },
  detalles: detallesLargos,
};

const out = process.argv[2] || '.';

for (const [nombre, venta] of [
  ['pdf-1-simple', ventaSimple],
  ['pdf-2-descuento', ventaConDescuento],
  ['pdf-3-cancelada', ventaCancelada],
  ['pdf-4-multipagina', ventaMultiplesPaginas],
]) {
  const buffer = await generarPdfComprobante(venta);
  writeFileSync(`${out}\\${nombre}.pdf`, buffer);
  console.log(`Generado: ${nombre}.pdf (${buffer.length} bytes)`);
}
