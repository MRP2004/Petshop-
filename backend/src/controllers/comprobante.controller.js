import { obtenerVentaPorId } from '../services/venta.service.js';
import { generarPdfComprobante } from '../services/comprobantePdf.service.js';
import { enviarComprobantePorCorreo } from '../services/correo.service.js';
import AppError from '../errors/AppError.js';

// obtenerVentaPorId ya aplica la autorización "propia o personal" (mismo
// criterio que ver/cancelar una venta — ver venta.service.js): la descarga
// del PDF y el reenvío de correo quedan protegidos por la misma regla, sin
// duplicarla.
const descargarPdf = async (req, res, next) => {
  try {
    const venta = await obtenerVentaPorId(req.params.id, req.usuario);
    const pdf = await generarPdfComprobante(venta);
    const numero = venta.comprobante?.numero || `venta-${venta.idVenta}`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${numero}.pdf"`);
    res.status(200).send(pdf);
  } catch (error) {
    next(error);
  }
};

const reenviarCorreo = async (req, res, next) => {
  try {
    const venta = await obtenerVentaPorId(req.params.id, req.usuario);

    if (!venta.comprobante) {
      throw new AppError('Esta venta no tiene comprobante de checkout para reenviar', 400);
    }

    if (venta.comprobante.estadoCorreo === 'no_aplica') {
      throw new AppError('El cliente no tiene un correo electrónico cargado', 400);
    }

    await enviarComprobantePorCorreo(venta);
    const ventaActualizada = await obtenerVentaPorId(req.params.id, req.usuario);

    res.status(200).json({ estadoCorreo: ventaActualizada.comprobante.estadoCorreo });
  } catch (error) {
    next(error);
  }
};

export { descargarPdf, reenviarCorreo };
