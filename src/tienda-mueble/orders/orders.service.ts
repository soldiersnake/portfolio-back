import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type Stripe from 'stripe';
import { TiendaMuebleOrder, TiendaMuebleOrderDocument, TiendaMueblePaymentProvider } from '../schemas/order.schema.js';
import { CreateTiendaMuebleOrderDto } from '../dto/create-order.dto.js';
import type { TiendaMuebleAuthUser } from '../auth/auth.service.js';
import { StripeService } from './stripe.service.js';
import { MercadoPagoService } from './mercadopago.service.js';
import { EmailService } from '../../email/email.service.js';
import { getSpanishLocationFromPostalCode } from '../lib/spain-locations.js';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(TiendaMuebleOrder.name) private readonly orderModel: Model<TiendaMuebleOrderDocument>,
    private readonly stripeService: StripeService,
    private readonly mercadoPagoService: MercadoPagoService,
    private readonly emailService: EmailService,
  ) {}

  // Crea el pedido en estado "pending", compartido por ambos proveedores de
  // pago — el total y la ubicación siempre se calculan server-side acá,
  // nunca se confía en nada mandado por el cliente más allá de los items y
  // los datos de envío. Queda guardado *antes* de abrir el checkout en el
  // proveedor que corresponda, para no perder el registro si algo falla en
  // el medio (si el pago nunca se completa, el pedido simplemente queda
  // pending/huérfano y no aparece como venta real en ningún lado).
  private async createPendingOrder(
    dto: CreateTiendaMuebleOrderDto,
    user: TiendaMuebleAuthUser,
    paymentProvider: TiendaMueblePaymentProvider,
  ): Promise<TiendaMuebleOrderDocument> {
    const total = dto.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const location = getSpanishLocationFromPostalCode(dto.postalCode);

    return this.orderModel.create({
      userEmail: user.email,
      userName: user.name,
      items: dto.items,
      total,
      shippingAddress: dto.shippingAddress,
      postalCode: dto.postalCode,
      provincia: location?.provincia,
      comunidadAutonoma: location?.comunidadAutonoma,
      phone: dto.phone,
      paymentProvider,
      paymentStatus: 'pending',
    });
  }

  // Crea el pedido + la Checkout Session de Stripe que lo va a cobrar (ver
  // createPendingOrder para el porqué del orden de operaciones).
  async createCheckoutSession(dto: CreateTiendaMuebleOrderDto, user: TiendaMuebleAuthUser): Promise<{ url: string }> {
    const order = await this.createPendingOrder(dto, user, 'stripe');

    const { url, sessionId } = await this.stripeService.createCheckoutSession({
      id: (order._id as { toString(): string }).toString(),
      items: dto.items,
    });

    order.paymentReference = sessionId;
    await order.save();

    return { url };
  }

  // Mismo flujo que createCheckoutSession pero contra Mercado Pago Checkout
  // Pro (ver MercadoPagoService — cobra en ARS, el pedido en Mongo sigue
  // guardado en EUR como siempre). El external_reference que le pasamos acá
  // es el id del pedido: es lo que usamos después para encontrarlo desde el
  // webhook (ver handleMercadoPagoPaymentNotification).
  async createMercadoPagoCheckout(dto: CreateTiendaMuebleOrderDto, user: TiendaMuebleAuthUser): Promise<{ url: string }> {
    const order = await this.createPendingOrder(dto, user, 'mercadopago');

    const { url, preferenceId } = await this.mercadoPagoService.createPreference({
      id: (order._id as { toString(): string }).toString(),
      items: dto.items,
    });

    order.paymentReference = preferenceId;
    await order.save();

    return { url };
  }

  // Usado desde /pedido-confirmado (frontend) para mostrar el resumen del
  // pedido apenas el usuario vuelve de Stripe. Se busca por el session_id
  // que Stripe agrega al success_url (no por el id del pedido, que el
  // frontend no conoce en ese punto) y se exige que sea del mismo usuario
  // logueado — sin esto, cualquiera con un session_id ajeno (aunque sea
  // difícil de adivinar) podría ver el pedido de otra persona.
  async findBySessionForUser(sessionId: string, userEmail: string): Promise<TiendaMuebleOrderDocument | null> {
    const order = await this.orderModel.findOne({ paymentReference: sessionId });
    if (!order || order.userEmail !== userEmail) return null;
    return order;
  }

  // Mismo propósito que findBySessionForUser pero para /pedido-confirmado
  // al volver de Mercado Pago: a diferencia de Stripe, Mercado Pago no
  // agrega un id de sesión propio al back_url, así que el frontend manda de
  // vuelta el external_reference que le pasamos al crear la preferencia —
  // que es, justamente, el id del pedido.
  async findByIdForUser(orderId: string, userEmail: string): Promise<TiendaMuebleOrderDocument | null> {
    const order = await this.orderModel.findById(orderId).catch(() => null);
    if (!order || order.userEmail !== userEmail) return null;
    return order;
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

  // Contraparte de handleStripeWebhookEvent para Mercado Pago: al webhook
  // (ya verificado por firma, ver MercadoPagoController) solo le interesa
  // avisar "cambió el payment con este id", así que acá vamos a buscarlo
  // para saber el estado real y a qué pedido corresponde
  // (payment.external_reference, seteado al crear la preferencia).
  async handleMercadoPagoPaymentNotification(paymentId: string): Promise<void> {
    const payment = await this.mercadoPagoService.getPayment(paymentId);
    const orderId = payment.external_reference;
    if (!orderId) {
      this.logger.warn(`Payment ${paymentId} de Mercado Pago sin external_reference`);
      return;
    }

    const order = await this.orderModel.findById(orderId).catch(() => null);
    if (!order) {
      this.logger.warn(`Pedido ${orderId} no encontrado (Mercado Pago payment ${paymentId})`);
      return;
    }

    // Mismo motivo que en Stripe: Mercado Pago puede volver a notificar el
    // mismo payment (reintentos, o updates posteriores como un
    // contracargo) — sin este chequeo, el email de confirmación se
    // reenviaría cada vez.
    const wasAlreadyPaid = order.paymentStatus === 'paid';
    if (payment.status === 'approved') {
      order.paymentStatus = 'paid';
    } else if (payment.status === 'rejected' || payment.status === 'cancelled') {
      order.paymentStatus = 'failed';
    } else {
      // in_process, pending, etc. (ej. rapipago/pago fácil: el comprador
      // todavía no fue a pagar el cupón) — el pedido se queda "pending"
      // hasta la próxima notificación.
      order.paymentStatus = 'pending';
    }
    // Reemplaza el preferenceId inicial por el payment id real: es el dato
    // útil para buscar el pago en el dashboard de Mercado Pago de acá en
    // más.
    order.paymentReference = String(payment.id ?? paymentId);
    await order.save();

    if (!wasAlreadyPaid && order.paymentStatus === 'paid') {
      await this.sendOrderConfirmationEmails(order);
    }
  }

  // Se ejecuta una sola vez por pedido, justo después de confirmar el pago
  // (desde cualquiera de los dos webhooks). Envuelto en try/catch a
  // propósito: si Resend falla (o no está configurado), no puede tirar
  // abajo el webhook — tanto Stripe como Mercado Pago interpretarían un
  // error 500 como "no llegó" y reintentarían el evento indefinidamente.
  private async sendOrderConfirmationEmails(order: TiendaMuebleOrderDocument): Promise<void> {
    const emailData = {
      orderId: (order._id as { toString(): string }).toString(),
      userEmail: order.userEmail,
      userName: order.userName,
      items: order.items,
      total: order.total,
      shippingAddress: order.shippingAddress,
      postalCode: order.postalCode,
      provincia: order.provincia,
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
