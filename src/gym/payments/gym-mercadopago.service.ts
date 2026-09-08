import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoConfig, Payment, Preference, WebhookSignatureValidator } from 'mercadopago';

// El SDK no reexporta `PaymentResponse` desde su entrypoint público — se
// deriva acá del propio método `Payment.get`, mismo criterio que
// tienda-mueble/orders/mercadopago.service.ts.
type MercadoPagoPayment = Awaited<ReturnType<Payment['get']>>;

export interface GymCheckoutPayment {
  id: string; // GymPayment._id — viaja como external_reference
  planName: string;
  amount: number;
  currency: string;
}

// Mismo SDK y patrón que tienda-mueble/orders/mercadopago.service.ts, pero
// con una diferencia deliberada: GymBro cobra en EUR directo, sin conversión
// a ARS. tienda-mueble convierte a ARS porque apunta a compradores en
// Argentina (ver EUR_TO_ARS_RATE ahí); GymBro es un gimnasio físico en
// Valencia — todos los planes, pagos y el resto de la app ya están en EUR
// (ver GymMembershipPlan.currency), así que forzar ARS acá sería
// inconsistente con el resto del dominio. Si algún día hace falta cobrar en
// otra moneda, currency_id sale directo de `payment.currency` en vez de
// hardcodearse.
@Injectable()
export class GymMercadoPagoService {
  private readonly logger = new Logger(GymMercadoPagoService.name);
  private readonly preferenceClient?: Preference;
  private readonly paymentClient?: Payment;
  private readonly webhookSecret?: string;
  private readonly frontendUrl: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.enabled = this.config.get<string>('GYM_MERCADOPAGO_ENABLED') === 'true';
    const accessToken = this.config.get<string>('GYM_MERCADOPAGO_ACCESS_TOKEN');
    this.webhookSecret = this.config.get<string>('GYM_MERCADOPAGO_WEBHOOK_SECRET');
    this.frontendUrl = (this.config.get<string>('GYM_FRONTEND_URL') ?? 'http://localhost:5177').trim();

    if (this.enabled && accessToken) {
      const mpConfig = new MercadoPagoConfig({ accessToken });
      this.preferenceClient = new Preference(mpConfig);
      this.paymentClient = new Payment(mpConfig);
    } else if (this.enabled) {
      this.logger.warn(
        'GYM_MERCADOPAGO_ENABLED=true pero falta GYM_MERCADOPAGO_ACCESS_TOKEN — la creación de preferencias va a fallar hasta que se configure.',
      );
    }
  }

  get isConfigured(): boolean {
    return this.enabled && Boolean(this.preferenceClient);
  }

  async createPreference(payment: GymCheckoutPayment): Promise<{ url: string; preferenceId: string }> {
    if (!this.preferenceClient) {
      throw new InternalServerErrorException('Mercado Pago no está habilitado en el servidor.');
    }

    // Mismo motivo que en tienda-mueble: auto_return solo se manda si la
    // vuelta es https (Mercado Pago rechaza la preferencia si no lo es),
    // en local simplemente muestra el botón "Volver al sitio" en vez de
    // redirigir solo.
    const isHttpsFrontend = this.frontendUrl.startsWith('https://');

    const preference = await this.preferenceClient.create({
      body: {
        items: [
          {
            id: payment.id,
            title: payment.planName,
            quantity: 1,
            currency_id: payment.currency.toUpperCase(),
            unit_price: payment.amount,
          },
        ],
        external_reference: payment.id,
        // payment_id (nuestro GymPayment._id) explícito en la vuelta, mismo
        // motivo que en GymStripeService: es lo que lee PagoConfirmadoPage
        // para pedir el comprobante. Mercado Pago además agrega sus propios
        // params (external_reference, status, etc.) al volver — no hace
        // falta parsearlos, este ya alcanza.
        back_urls: {
          success: `${this.frontendUrl}/membresia/pago-confirmado?payment_id=${payment.id}`,
          pending: `${this.frontendUrl}/membresia/pago-confirmado?payment_id=${payment.id}`,
          failure: `${this.frontendUrl}/membresia/pago-cancelado`,
        },
        ...(isHttpsFrontend ? { auto_return: 'approved' as const } : {}),
      },
    });

    if (!preference.init_point || !preference.id) {
      throw new InternalServerErrorException('Mercado Pago no devolvió una URL de pago.');
    }
    return { url: preference.init_point, preferenceId: preference.id };
  }

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

  async getPayment(paymentId: string): Promise<MercadoPagoPayment> {
    if (!this.paymentClient) {
      throw new InternalServerErrorException('Mercado Pago no está habilitado en el servidor.');
    }
    return this.paymentClient.get({ id: paymentId });
  }
}
