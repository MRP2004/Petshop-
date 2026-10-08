import PDFDocument from 'pdfkit';
import { formatearImporte, formatearFechaHora } from '../utils/formato.js';
import { etiquetaEstadoPago, etiquetaEstadoVenta } from '../utils/estadosLegibles.js';

// Diseño del comprobante (CU-04, §7): referencia visual "comprobante
// comercial" (encabezado, datos del comprador, tabla, total separado) SIN
// copiar CUIT/condición tributaria/domicilios de terceros — no es una
// factura fiscal, se lo aclara explícitamente en el pie. Verde de marca
// (frontend/src/index.css --color-marca) reutilizado acá para no inventar
// una identidad visual distinta a la del resto de la aplicación.
const VERDE_MARCA = '#0ca678';
const GRIS_TEXTO_SUAVE = '#495057';
const GRIS_BORDE = '#dee2e6';

const MARGEN = 50;
const ANCHO_UTIL = 595.28 - MARGEN * 2; // A4

// Columnas de la tabla de productos: cantidad, descripción, precio de lista
// unitario, descuento, subtotal final (CU-04, §7 — "cantidad, descripción,
// precio unitario de lista, descuento y subtotal final").
const COLUMNAS = {
  cantidad: { x: MARGEN, ancho: 40 },
  descripcion: { x: MARGEN + 40, ancho: 195 },
  precioLista: { x: MARGEN + 40 + 195, ancho: 90 },
  descuento: { x: MARGEN + 40 + 195 + 90, ancho: 80 },
  subtotal: { x: MARGEN + 40 + 195 + 90 + 80, ancho: 90 },
};

const ALTURA_MINIMA_FILA = 20;

// Y fijo, DENTRO del área imprimible (no en el borde del margen inferior):
// pdfkit pagina automáticamente un `.text()` cuyo contenido no entra antes
// del margen inferior — un footer puesto justo en ese borde (o más allá)
// terminaba generando una página en blanco extra en cada comprobante de una
// sola página (defecto real, encontrado al revisar visualmente los PDF de
// muestra, no solo generarlos — CU-04, §7).
const dibujarPiePagina = (documento) => {
  const y = documento.page.height - documento.page.margins.bottom - 20;
  documento
    .fontSize(8)
    .fillColor(GRIS_TEXTO_SUAVE)
    .text('Comprobante de demostración — sin validez fiscal', MARGEN, y, {
      width: ANCHO_UTIL,
      align: 'center',
    })
    .fillColor('black');
};

const dibujarEncabezadoTabla = (documento, y) => {
  documento
    .fontSize(9)
    .fillColor(GRIS_TEXTO_SUAVE)
    .text('Cant.', COLUMNAS.cantidad.x, y, { width: COLUMNAS.cantidad.ancho })
    .text('Descripción', COLUMNAS.descripcion.x, y, { width: COLUMNAS.descripcion.ancho })
    .text('Precio lista', COLUMNAS.precioLista.x, y, { width: COLUMNAS.precioLista.ancho, align: 'right' })
    .text('Descuento', COLUMNAS.descuento.x, y, { width: COLUMNAS.descuento.ancho, align: 'right' })
    .text('Subtotal', COLUMNAS.subtotal.x, y, { width: COLUMNAS.subtotal.ancho, align: 'right' })
    .fillColor('black');

  const yLinea = y + 14;
  documento
    .moveTo(MARGEN, yLinea)
    .lineTo(MARGEN + ANCHO_UTIL, yLinea)
    .strokeColor(GRIS_BORDE)
    .stroke();

  return yLinea + 6;
};

const LIMITE_INFERIOR = (documento) => documento.page.height - documento.page.margins.bottom - 30;

// Salto de página manual PARA FILAS DE PRODUCTOS, repitiendo el encabezado
// de la tabla (CU-04, §7: "repetición del encabezado de tabla cuando
// corresponda"; "descripciones largas y varias páginas sin
// superposiciones"). pdfkit no repagina tablas solo: cada fila calcula su
// propia altura (según cuánto ocupe la descripción envuelta) ANTES de
// dibujarla, para decidir si entra en lo que queda de página.
const asegurarEspacioProductos = (documento, alturaNecesaria) => {
  if (documento.y + alturaNecesaria > LIMITE_INFERIOR(documento)) {
    dibujarPiePagina(documento);
    documento.addPage();
    documento.y = MARGEN;
    documento.y = dibujarEncabezadoTabla(documento, documento.y);
  }
};

// Salto de página para el RESUMEN y el bloque de PAGO (defecto real,
// encontrado al revisar visualmente el PDF de muestra multipágina: usar la
// misma función que las filas de productos hacía que, si el resumen no
// entraba, la página nueva arrancara con un encabezado de tabla de
// productos VACÍO antes del resumen — la paginación de un bloque no
// tabular no debe repetir el encabezado de una tabla que no sigue). Solo
// abre página nueva y resetea el cursor, sin dibujar nada de la tabla.
const asegurarEspacioResumen = (documento, alturaNecesaria) => {
  if (documento.y + alturaNecesaria > LIMITE_INFERIOR(documento)) {
    dibujarPiePagina(documento);
    documento.addPage();
    documento.y = MARGEN;
    documento.x = MARGEN;
  }
};

// PDF del comprobante armado a partir de los mismos datos históricos que se
// muestran en pantalla (venta ya cargada con sus relaciones — ver
// venta.service.js#relacionesVenta): nada de esto vuelve a consultar
// producto/promoción vigentes, así que editar o borrar un producto o una
// promoción después no cambia un PDF ya generado. Devuelve un Buffer (no
// escribe a disco): el controller lo manda directo como respuesta HTTP.
const generarPdfComprobante = (venta) =>
  new Promise((resolve, reject) => {
    const documento = new PDFDocument({ size: 'A4', margin: MARGEN, bufferPages: true });
    const partes = [];

    documento.on('data', (parte) => partes.push(parte));
    documento.on('end', () => resolve(Buffer.concat(partes)));
    documento.on('error', reject);

    const numero = venta.comprobante?.numero || `Venta #${venta.idVenta}`;
    const nombreComprador = venta.comprobante?.nombreCompradorHistorico ?? venta.cliente.nombre;
    const apellidoComprador = venta.comprobante?.apellidoCompradorHistorico ?? venta.cliente.apellido;
    const esDatoHistorico = venta.comprobante?.nombreCompradorHistorico != null;

    // --- Encabezado ---
    documento.fontSize(20).fillColor(VERDE_MARCA).text('PetShop', MARGEN, MARGEN);
    documento
      .fontSize(9)
      .fillColor(GRIS_TEXTO_SUAVE)
      .text('Comprobante de demostración — sin validez fiscal', MARGEN, MARGEN + 24)
      .fillColor('black');

    documento
      .fontSize(11)
      .text(`Comprobante: ${numero}`, MARGEN, MARGEN + 45)
      .text(`Fecha: ${formatearFechaHora(venta.fecha)}`, MARGEN, MARGEN + 60);

    documento
      .moveTo(MARGEN, MARGEN + 82)
      .lineTo(MARGEN + ANCHO_UTIL, MARGEN + 82)
      .strokeColor(GRIS_BORDE)
      .stroke();

    documento.y = MARGEN + 92;

    // --- Datos del comprador y entrega ---
    documento.fontSize(10).text(`Cliente: ${nombreComprador} ${apellidoComprador}`);
    if (!esDatoHistorico) {
      documento
        .fontSize(8)
        .fillColor(GRIS_TEXTO_SUAVE)
        .text('* Dato actual del cliente: este comprobante es anterior al guardado del dato histórico.')
        .fillColor('black')
        .fontSize(10);
    }

    if (venta.direccionEntrega) {
      documento.text(`Entrega: ${venta.metodoEntrega} — ${venta.direccionEntrega.direccion}`);
    } else if (venta.metodoEntrega) {
      documento.text(`Entrega: ${venta.metodoEntrega}`);
    }

    documento.moveDown();
    documento.y = dibujarEncabezadoTabla(documento, documento.y);

    // --- Productos ---
    let subtotalListaCentavos = 0;
    let descuentosCentavos = 0;

    for (const detalle of venta.detalles) {
      const historico = detalle.promocionAplicada;
      const nombre = historico?.nombreProductoHistorico || detalle.producto.nombre;
      const precioLista = historico ? Number(historico.precioListaUnitario) : Number(detalle.precioUnitario);
      const descuentoUnitario = historico ? Number(historico.montoDescuentoUnitario) : 0;
      const cantidad = Number(detalle.cantidad);

      subtotalListaCentavos += Math.round(precioLista * 100) * cantidad;
      descuentosCentavos += Math.round(descuentoUnitario * 100) * cantidad;

      // Altura de la fila según cuánto ocupe la descripción envuelta (nunca
      // menos que la altura mínima de una línea). fontSize(9) primero: el
      // cálculo de heightOfString depende del tamaño de fuente activo.
      documento.fontSize(9);
      const alturaDescripcion = documento.heightOfString(nombre, { width: COLUMNAS.descripcion.ancho });
      const alturaFila = Math.max(ALTURA_MINIMA_FILA, alturaDescripcion + 4);

      asegurarEspacioProductos(documento, alturaFila);

      const y = documento.y;
      documento
        .fontSize(9)
        .text(String(cantidad), COLUMNAS.cantidad.x, y, { width: COLUMNAS.cantidad.ancho })
        .text(nombre, COLUMNAS.descripcion.x, y, { width: COLUMNAS.descripcion.ancho })
        .text(formatearImporte(precioLista), COLUMNAS.precioLista.x, y, {
          width: COLUMNAS.precioLista.ancho,
          align: 'right',
        })
        .text(
          descuentoUnitario > 0 ? `-${formatearImporte(descuentoUnitario)}` : '—',
          COLUMNAS.descuento.x,
          y,
          { width: COLUMNAS.descuento.ancho, align: 'right' },
        )
        .text(formatearImporte(detalle.subtotal), COLUMNAS.subtotal.x, y, {
          width: COLUMNAS.subtotal.ancho,
          align: 'right',
        });

      documento.y = y + alturaFila;
    }

    // --- Resumen: subtotal de lista, descuentos, total destacado ---
    asegurarEspacioResumen(documento, 90);
    documento
      .moveTo(MARGEN, documento.y + 4)
      .lineTo(MARGEN + ANCHO_UTIL, documento.y + 4)
      .strokeColor(GRIS_BORDE)
      .stroke();
    documento.y += 12;

    const anchoEtiqueta = 350;
    documento.fontSize(10);
    documento.text('Subtotal (precio de lista):', MARGEN, documento.y, { width: anchoEtiqueta, align: 'right' });
    documento.text(formatearImporte(subtotalListaCentavos, { enCentavos: true }), MARGEN + anchoEtiqueta, documento.y - 12, {
      width: ANCHO_UTIL - anchoEtiqueta,
      align: 'right',
    });

    if (descuentosCentavos > 0) {
      documento.moveDown(0.3);
      documento.text('Descuentos:', MARGEN, documento.y, { width: anchoEtiqueta, align: 'right' });
      documento.text(
        `-${formatearImporte(descuentosCentavos, { enCentavos: true })}`,
        MARGEN + anchoEtiqueta,
        documento.y - 12,
        { width: ANCHO_UTIL - anchoEtiqueta, align: 'right' },
      );
    }

    documento.moveDown(0.5);
    documento.fontSize(13).fillColor(VERDE_MARCA);
    documento.text('Total:', MARGEN, documento.y, { width: anchoEtiqueta, align: 'right' });
    documento.text(formatearImporte(venta.total), MARGEN + anchoEtiqueta, documento.y - 15, {
      width: ANCHO_UTIL - anchoEtiqueta,
      align: 'right',
    });
    documento.fillColor('black').fontSize(10);

    // --- Pago y estado ---
    // Los bloques de arriba (subtotal/descuentos/total) posicionan cada
    // `.text()` con una x explícita a la derecha del margen (para alinear
    // importes) — pdfkit deja el cursor `documento.x` ahí, así que un
    // `.text()` normal (sin x explícita) que viniera después heredaba ese
    // mismo punto de partida y un ancho disponible mucho más angosto que el
    // de la página completa, provocando saltos de línea extraños en textos
    // cortos como "Estado del pago: ..." (defecto real, visto al revisar
    // los PDF de muestra). Se resetea x explícitamente antes de seguir con
    // texto de ancho completo.
    documento.x = MARGEN;
    documento.moveDown(1.5);
    asegurarEspacioResumen(documento, 60);
    documento.fontSize(11).text('Pago', MARGEN, documento.y, { underline: true });
    documento.fontSize(10);

    if (venta.pago) {
      const medio =
        venta.pago.tipo === 'debito'
          ? `Débito simulado, terminada en ${venta.pago.ultimosCuatroDigitos}`
          : 'Transferencia simulada';
      documento.text(`Medio: ${medio}`, MARGEN, documento.y);
      documento.text(`Estado del pago: ${etiquetaEstadoPago(venta.pago.estado)}`, MARGEN, documento.y);
    } else {
      // Venta anterior a esta etapa, o cargada manualmente por el personal:
      // no se le atribuye ningún estado de pago simulado que nunca ocurrió.
      documento.text(`Medio de pago: ${venta.medioPago.nombre}`, MARGEN, documento.y);
    }

    documento.text(`Estado del pedido: ${etiquetaEstadoVenta(venta.estado)}`, MARGEN, documento.y);

    dibujarPiePagina(documento);
    documento.end();
  });

export { generarPdfComprobante };
