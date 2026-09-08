import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export interface GymCheckoutPayment {
  id: string; // GymPayment._id — viaja en metadata para que el webhook sepa a qué pago corresponde
  planName: string;
  amount: number; // en la unidad mayor de la moneda (euros, no céntimos)
  currency: string;
}

// Mismo patrón que tienda-mueble/orders/stripe.service.ts, pero con
// credenciales y flag propios de GymBro (GYM_STRIPE_*) para no mezclar los
// dos proyectos en el mismo dashboard de Stripe — ver PLANNING.md sección
// 2.7 y 5. A diferencia de tienda-mueble (que no tiene flag de
// activación, solo mira si las claves están seteadas), acá además hace
// falta GYM_STRIPE_ENABLED=true de forma explícita: GymBro puede terminar
// operando con un solo proveedor activo, o ninguno todavía si Mariano
// sigue cobrando las cuotas a mano mientras prueba el resto de la app.
@Injectable()
export class GymStripeService {
  private readonly logger = new Logger(GymStripeService.name);
  private readonly stripe?: Stripe;
  private readonly webhookSecret?: string;
  private readonly frontendUrl: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.enabled = this.config.get<string>('GYM_STRIPE_ENABLED') === 'true';
    const secretKey = this.config.get<string>('GYM_STRIPE_SECRET_KEY');
    this.webhookSecret = this.config.get<string>('GYM_STRIPE_WEBHOOK_SECRET');
    this.frontendUrl = (this.config.get<string>('GYM_FRONTEND_URL') ?? 'http://localhost:5177').trim();

    if (this.enabled && secretKey) {
      this.stripe = new Stripe(secretKey);
    } else if (this.enabled) {
      this.logger.warn(
        'GYM_STRIPE_ENABLED=true pero falta GYM_STRIPE_SECRET_KEY — la creación de sesiones de pago va a fallar hasta que se configure.',
      );
    }
  }

  get isConfigured(): boolean {
    return this.enabled && Boolean(this.stripe);
  }

  async createCheckoutSession(payment: GymCheckoutPayment): Promise<{ url: string; sessionId: string }> {
    if (!this.stripe) {
      throw new InternalServerErrorException('Stripe no está habilitado en el servidor.');
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: payment.currency.toLowerCase(),
            unit_amount: Math.round(payment.amount * 100),
            product_data: { name: payment.planName },
          },
        },
      ],
      // payment_id (nuestro GymPayment._id) va primero, de mano: es lo que usa
      // PagoConfirmadoPage para pedir el comprobante (GET
      // /gym/payments/receipt/:paymentId) — session_id de Stripe queda solo
      // como referencia adicional, no lo lee el frontend.
      success_url: `${this.frontendUrl}/membresia/pago-confirmado?payment_id=${payment.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.frontendUrl}/membresia/pago-cancelado`,
      metadata: { gymPaymentId: payment.id },
    });

    if (!session.url) {
      throw new InternalServerErrorException('Stripe no devolvió una URL de pago.');
    }
    return { url: session.url, sessionId: session.id };
  }

  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    if (!this.stripe || !this.webhookSecret) {
      throw new InternalServerErrorException('El webhook de Stripe no está configurado en el servidor.');
    }
    return this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }
}
