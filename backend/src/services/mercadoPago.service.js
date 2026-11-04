
import {
  MercadoPagoConfig,
  Preference,
  Payment,
  WebhookSignatureValidator,
  InvalidWebhookSignatureError,
} from 'mercadopago';

const obtenerClienteMercadoPago = () => {
  const accessToken = process.env.MP_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error('Falta configurar MP_ACCESS_TOKEN.');
  }

  return new MercadoPagoConfig({
    accessToken,
  });
};

const crearPreferencia = async (datos) => {
  const cliente = obtenerClienteMercadoPago();
  const preference = new Preference(cliente);

  return preference.create({
    body: datos,
  });
};

const consultarPago = async (idPago) => {
  const cliente = obtenerClienteMercadoPago();
  const payment = new Payment(cliente);

  return payment.get({
    id: idPago,
  });
};

const validarFirmaWebhook = (req) => {
  const secret = process.env.MP_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error('Falta configurar MP_WEBHOOK_SECRET.');
  }

  try {
    WebhookSignatureValidator.validate({
      xSignature: req.headers['x-signature'],
      xRequestId: req.headers['x-request-id'],
      dataId: req.query['data.id'],
      secret,
      toleranceSeconds: 300,
    });

    return true;
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      return false;
    }

    throw error;
  }
};

export {
  crearPreferencia,
  consultarPago,
  validarFirmaWebhook,
};
