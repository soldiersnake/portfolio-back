import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export interface CheckoutOrderItem {
  name: string;
  price: number;
  quantity: number;
}

export interface CheckoutOrder {
  id: string;
  items: CheckoutOrderItem[];
}

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe?: Stripe;
  private readonly webhookSecret?: string;
  private readonly frontendUrl: string;

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    this.webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    // OJO: no usar FRONTEND_URL acá — esa variable es la lista de orígenes
    // permitidos por CORS (ver main.ts), compartida entre varios proyectos
    // (portfolio, airbnb-app, TiendaMueble) que corren sobre este mismo
    // backend. Tomar el primer origen de esa lista redirigía siempre al
    // proyecto equivocado. Las URLs de retorno de Stripe necesitan el
    // origen específico de TiendaMueble, por eso usan su propia variable.
    this.frontendUrl = (this.config.get<string>('TIENDA_MUEBLE_FRONTEND_URL') ?? 'http://localhost:5175').trim();

    if (secretKey) {
      this.stripe = new Stripe(secretKey);
    } else {
      this.logger.warn(
        'STRIPE_SECRET_KEY no está seteada — la creación de sesiones de pago va a fallar hasta que se configure.',
      );
    }
  }

  get isConfigured(): boolean {
    return Boolean(this.stripe);
  }

  // Checkout hospedado por Stripe: el frontend no necesita Stripe.js ni
  // Elements, solo redirigir (window.location.href) a la URL que devuelve
  // esto. No mandamos `payment_method_types` a propósito: dejando que
  // Stripe lo decida, muestra automáticamente todos los métodos habilitados
  // para la cuenta (tarjeta, Bizum, etc.) según la moneda/país, sin tener
  // que listarlos a mano acá cada vez que se activa uno nuevo en el
  // dashboard.
  async createCheckoutSession(order: CheckoutOrder): Promise<{ url: string; sessionId: string }> {
    if (!this.stripe) {
      throw new InternalServerErrorException('Los pagos no están configurados en el servidor.');
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: order.items.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: 'eur',
          unit_amount: Math.round(item.price * 100),
          product_data: { name: item.name },
        },
      })),
      success_url: `${this.frontendUrl}/pedido-confirmado?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.frontendUrl}/pedido-cancelado`,
      metadata: { orderId: order.id },
    });

    if (!session.url) {
      throw new InternalServerErrorException('Stripe no devolvió una URL de pago.');
    }
    return { url: session.url, sessionId: session.id };
  }

  // Verifica que el evento realmente venga de Stripe (firma HMAC con el
  // secreto del webhook) antes de confiar en su contenido. Necesita el body
  // *sin parsear* (ver rawBody: true en main.ts) porque la firma se calcula
  // sobre los bytes exactos que mandó Stripe.
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    if (!this.stripe || !this.webhookSecret) {
      throw new InternalServerErrorException('El webhook de Stripe no está configurado en el servidor.');
    }
    return this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }
}
