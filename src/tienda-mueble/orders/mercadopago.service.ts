import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoConfig, Payment, Preference, WebhookSignatureValidator } from 'mercadopago';

// El SDK no reexporta `PaymentResponse` desde su entrypoint público (solo
// desde una ruta interna de `dist/`, que preferimos no importar directo
// para no atarnos a su estructura interna) — se deriva acá del propio
// método `Payment.get`, así se mantiene en sync automáticamente si el SDK
// cambia de versión.
type MercadoPagoPayment = Awaited<ReturnType<Payment['get']>>;

export interface CheckoutOrderItem {
  name: string;
  price: number;
  quantity: number;
}

export interface CheckoutOrder {
  id: string;
  items: CheckoutOrderItem[];
}

// Mercado Pago no opera con EUR: el cobro queda atado a la cuenta de Mercado
// Pago (Argentina) configurada con MERCADOPAGO_ACCESS_TOKEN, en ARS. Como el
// resto del proyecto (precios, pedido guardado en Mongo, emails) sigue
// siempre en EUR — esta tasa es la ÚNICA conversión, y solo se usa acá, al
// armar los `items` que ve Mercado Pago. Fija a propósito (mismo criterio
// que la validación de código postal: nada de APIs externas de cotización
// en el medio de un checkout) — hay que actualizarla a mano de tanto en
// tanto si se nota muy desactualizada.
const EUR_TO_ARS_RATE = 1400;

@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);
  private readonly preferenceClient?: Preference;
  private readonly paymentClient?: Payment;
  private readonly webhookSecret?: string;
  private readonly frontendUrl: string;

  constructor(private readonly config: ConfigService) {
    const accessToken = this.config.get<string>('MERCADOPAGO_ACCESS_TOKEN');
    this.webhookSecret = this.config.get<string>('MERCADOPAGO_WEBHOOK_SECRET');
    // Mismo motivo que en StripeService: FRONTEND_URL es la lista de
    // orígenes de CORS compartida entre portfolio/airbnb-app/TiendaMueble,
    // así que las redirecciones de pago necesitan su propia variable.
    this.frontendUrl = (this.config.get<string>('TIENDA_MUEBLE_FRONTEND_URL') ?? 'http://localhost:5175').trim();

    if (accessToken) {
      const mpConfig = new MercadoPagoConfig({ accessToken });
      this.preferenceClient = new Preference(mpConfig);
      this.paymentClient = new Payment(mpConfig);
    } else {
      this.logger.warn(
        'MERCADOPAGO_ACCESS_TOKEN no está seteada — la creación de preferencias de pago va a fallar hasta que se configure.',
      );
    }
  }

  get isConfigured(): boolean {
    return Boolean(this.preferenceClient);
  }

  // Checkout Pro, el equivalente de Mercado Pago al Checkout hospedado de
  // Stripe: el backend arma una "preference" (los items + a dónde volver) y
  // el frontend solo redirige (window.location.href) al init_point que
  // devuelve esto. La notificación de pago (¿se aprobó, quedó pendiente,
  // fue rechazado?) llega después via webhook — nunca se confirma un pedido
  // acá, solo se abre el checkout.
  async createPreference(order: CheckoutOrder): Promise<{ url: string; preferenceId: string }> {
    if (!this.preferenceClient) {
      throw new InternalServerErrorException('Mercado Pago no está configurado en el servidor.');
    }

    // Mercado Pago rechaza la preferencia entera (400 "auto_return invalid.
    // back_url.success must be defined") si mandás auto_return con un
    // back_url.success que no sea https — pasa siempre en local, donde
    // TIENDA_MUEBLE_FRONTEND_URL es http://localhost:5175. Por eso
    // auto_return solo se manda si la URL de vuelta es https (producción);
    // en local la preferencia se crea igual, solo que Mercado Pago muestra
    // un botón "Volver al sitio" en vez de redirigir solo tras el pago.
    const isHttpsFrontend = this.frontendUrl.startsWith('https://');

    const preference = await this.preferenceClient.create({
      body: {
        items: order.items.map((item, index) => ({
          id: `${order.id}-${index}`,
          title: item.name,
          quantity: item.quantity,
          currency_id: 'ARS',
          unit_price: Math.round(item.price * EUR_TO_ARS_RATE * 100) / 100,
        })),
        external_reference: order.id,
        back_urls: {
          success: `${this.frontendUrl}/pedido-confirmado`,
          // Métodos offline (rapipago/pago fácil) dejan el pago "pending"
          // en vez de "approved" — mandamos a la misma pantalla de éxito,
          // que ya sabe mostrar "estamos confirmando tu pago" mientras
          // reintenta (ver PedidoConfirmadoPage).
          pending: `${this.frontendUrl}/pedido-confirmado`,
          failure: `${this.frontendUrl}/pedido-cancelado`,
        },
        ...(isHttpsFrontend ? { auto_return: 'approved' as const } : {}),
      },
    });

    if (!preference.init_point || !preference.id) {
      throw new InternalServerErrorException('Mercado Pago no devolvió una URL de pago.');
    }
    return { url: preference.init_point, preferenceId: preference.id };
  }

  // Verifica que la notificación realmente venga de Mercado Pago (HMAC-SHA256
  // sobre "id:{dataId};request-id:{xRequestId};ts:{ts};", ver
  // WebhookSignatureValidator del SDK oficial) antes de confiar en su
  // contenido — mismo rol que StripeService.constructEvent. El secreto se
  // configura en el dashboard de Mercado Pago ("Tus integraciones" → la
  // app → Webhooks), es distinto del MERCADOPAGO_ACCESS_TOKEN.
  verifyWebhookSignature(params: {
    xSignature: string | undefined;
    xRequestId: string | undefined;
    dataId: string | undefined;
  }): void {
    if (!this.webhookSecret) {
      throw new InternalServerErrorException('El webhook de Mercado Pago no está configurado en el servidor.');
    }
    WebhookSignatureValidator.validate({
      xSignature: params.xSignature,
      xRequestId: params.xRequestId,
      dataId: params.dataId,
      secret: this.webhookSecret,
    });
  }

  // El webhook de Mercado Pago solo avisa "cambió el pago con id X" — hay
  // que ir a buscarlo para saber el estado real (approved/pending/rejected)
  // y el external_reference (el id de nuestro pedido). A diferencia de
  // Stripe, que manda el estado adentro del propio evento firmado.
  async getPayment(paymentId: string): Promise<MercadoPagoPayment> {
    if (!this.paymentClient) {
      throw new InternalServerErrorException('Mercado Pago no está configurado en el servidor.');
    }
    return this.paymentClient.get({ id: paymentId });
  }
}
