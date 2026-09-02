import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type Stripe from 'stripe';
import { TiendaMuebleOrder, TiendaMuebleOrderDocument } from '../schemas/order.schema.js';
import { CreateTiendaMuebleOrderDto } from '../dto/create-order.dto.js';
import type { TiendaMuebleAuthUser } from '../auth/auth.service.js';
import { StripeService } from './stripe.service.js';
import { EmailService } from '../../email/email.service.js';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(TiendaMuebleOrder.name) private readonly orderModel: Model<TiendaMuebleOrderDocument>,
    private readonly stripeService: StripeService,
    private readonly emailService: EmailService,
  ) {}

  // Crea el pedido en estado "pending" y, en el mismo paso, la Checkout
  // Session de Stripe que lo va a cobrar. El pedido queda guardado *antes*
  // de llamar a Stripe para no perder el registro si algo falla en el medio
  // — si la sesión de pago nunca se completa, el pedido simplemente queda
  // pending/huérfano y no aparece como venta real en ningún lado.
  async createCheckoutSession(dto: CreateTiendaMuebleOrderDto, user: TiendaMuebleAuthUser): Promise<{ url: string }> {
    // El total se calcula acá a partir de los items ya validados por el
    // DTO, nunca se confía en un total mandado por el cliente. Stripe cobra
    // en base a los mismos items (ver StripeService), así que ambos números
    // siempre coinciden.
    const total = dto.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const order = await this.orderModel.create({
      userEmail: user.email,
      userName: user.name,
      items: dto.items,
      total,
      shippingAddress: dto.shippingAddress,
      postalCode: dto.postalCode,
      phone: dto.phone,
      paymentProvider: 'stripe',
      paymentStatus: 'pending',
    });

    const { url, sessionId } = await this.stripeService.createCheckoutSession({
      id: (order._id as { toString(): string }).toString(),
      items: dto.items,
    });

    order.paymentReference = sessionId;
    await order.save();

    return { url };
  }

  // Único punto donde un pedido pasa a "paid": nunca a partir del redirect
  // del navegador (el usuario podría cerrar la pestaña antes o el pago
  // podría fallar después del redirect), siempre a partir de un evento
  // verificado con la firma de Stripe (ver StripeService.constructEvent).
  async handleStripeWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId;
        if (!orderId) {
          this.logger.warn(`checkout.session.completed sin metadata.orderId (session ${session.id})`);
          return;
        }

        const order = await this.orderModel.findById(orderId);
        if (!order) {
          this.logger.warn(`Pedido ${orderId} no encontrado (checkout.session.completed)`);
          return;
        }

        // Stripe puede reintentar el envío de un mismo evento (ej. si
        // tardamos en responder 200 a tiempo). Sin este chequeo, un pedido
        // que ya estaba "paid" dispararía el email de confirmación de nuevo
        // en cada reintento.
        const wasAlreadyPaid = order.paymentStatus === 'paid';
        order.paymentStatus = session.payment_status === 'paid' ? 'paid' : 'pending';
        order.paymentReference = session.id;
        await order.save();

        if (!wasAlreadyPaid && order.paymentStatus === 'paid') {
          await this.sendOrderConfirmationEmails(order);
        }
        break;
      }
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId;
        if (orderId) {
          await this.orderModel.findByIdAndUpdate(orderId, { paymentStatus: 'failed' });
        }
        break;
      }
      default:
        // El resto de los eventos (hay muchos: payment_intent.*, charge.*,
        // etc.) no nos interesan por ahora, se ignoran sin error.
        break;
    }
  }

  // Se ejecuta una sola vez por pedido, justo después de confirmar el pago.
  // Envuelto en try/catch a propósito: si Resend falla (o no está
  // configurado), no puede tirar abajo el webhook — Stripe interpretaría un
  // error 500 como "no llegó" y reintentaría el evento indefinidamente.
  private async sendOrderConfirmationEmails(order: TiendaMuebleOrderDocument): Promise<void> {
    const emailData = {
      orderId: (order._id as { toString(): string }).toString(),
      userEmail: order.userEmail,
      userName: order.userName,
      items: order.items,
      total: order.total,
      shippingAddress: order.shippingAddress,
      postalCode: order.postalCode,
      phone: order.phone,
    };

    try {
      await this.emailService.sendTiendaMuebleOrderConfirmation(emailData);
      await this.emailService.sendTiendaMuebleOrderOwnerNotification(emailData);
    } catch (error) {
      this.logger.error(`Fallo al enviar emails de confirmación del pedido ${emailData.orderId}`, error as Error);
    }
  }
}
