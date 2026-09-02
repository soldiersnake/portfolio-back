import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

interface ContactEmailData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

interface RecommendationEmailData {
  name: string;
  email: string;
  message: string;
}

interface AudifonosSubscriberEmailData {
  email: string;
}

interface TiendaMuebleContactEmailData {
  nombre: string;
  email: string;
  asunto: string;
  mensaje: string;
  telefono?: string;
  pais?: string;
  tipo?: string;
  categoria?: string;
}

interface TiendaMuebleOrderItemEmailData {
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

interface TiendaMuebleOrderConfirmationEmailData {
  orderId: string;
  userEmail: string;
  userName?: string;
  items: TiendaMuebleOrderItemEmailData[];
  total: number;
  shippingAddress: string;
  postalCode: string;
  phone: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly fromAddress: string;
  private readonly receiverEmail: string;

  private readonly airbnbReceiverEmail: string;
  private readonly audifonosReceiverEmail: string;
  private readonly tiendaMuebleReceiverEmail: string;
  private readonly tiendaMuebleFrontendUrl: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.fromAddress = this.config.get<string>('CONTACT_FROM_EMAIL') ?? 'onboarding@resend.dev';
    this.receiverEmail = this.config.get<string>('CONTACT_RECEIVER_EMAIL') ?? '';
    // Permite notificar las recomendaciones de Airbnb a una casilla distinta;
    // si no se define, cae en la misma que las notificaciones del portfolio.
    this.airbnbReceiverEmail =
      this.config.get<string>('AIRBNB_RECEIVER_EMAIL') ?? this.receiverEmail;
    // Idem para los nuevos suscriptores del newsletter de TechPRO (audifonos).
    this.audifonosReceiverEmail =
      this.config.get<string>('AUDIFONOS_RECEIVER_EMAIL') ?? this.receiverEmail;
    // Idem para el formulario de contacto de TiendaMueble.
    this.tiendaMuebleReceiverEmail =
      this.config.get<string>('TIENDA_MUEBLE_RECEIVER_EMAIL') ?? this.receiverEmail;
    // Misma variable que usa StripeService para las URLs de retorno (ver
    // stripe.service.ts) — acá se reutiliza solo para poder armar URLs
    // absolutas de imagen en el email (las de los 6 productos originales son
    // rutas relativas tipo /img/productos/x.jpg, servidas por el frontend
    // público; un cliente de correo no tiene dominio implícito como el
    // navegador, así que necesitan el origen completo).
    this.tiendaMuebleFrontendUrl = (
      this.config.get<string>('TIENDA_MUEBLE_FRONTEND_URL') ?? 'http://localhost:5175'
    ).trim();

    if (!apiKey) {
      this.logger.warn(
        'RESEND_API_KEY is not set — emails will be logged instead of sent. ' +
          'Set it in your .env file to enable real email delivery.',
      );
      this.resend = null;
    } else {
      this.resend = new Resend(apiKey);
    }
  }

  /** Notifies Mariano that a new contact form submission arrived. */
  async sendOwnerNotification(data: ContactEmailData): Promise<boolean> {
    if (!this.receiverEmail) {
      this.logger.warn('CONTACT_RECEIVER_EMAIL is not set — skipping owner notification email.');
      return false;
    }

    return this.send({
      to: this.receiverEmail,
      subject: `[Portfolio] Nuevo mensaje: ${data.subject}`,
      html: `
        <h2>Nuevo mensaje desde el formulario de contacto</h2>
        <p><strong>Nombre:</strong> ${escapeHtml(data.name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(data.email)}</p>
        <p><strong>Asunto:</strong> ${escapeHtml(data.subject)}</p>
        <p><strong>Mensaje:</strong></p>
        <p>${escapeHtml(data.message).replace(/\n/g, '<br />')}</p>
      `,
      replyTo: data.email,
    });
  }

  /** Confirms to the sender that their message was received. */
  async sendSenderAutoReply(data: ContactEmailData): Promise<boolean> {
    return this.send({
      to: data.email,
      subject: 'Gracias por tu mensaje — Mariano Macías',
      html: `
        <p>Hola ${escapeHtml(data.name)},</p>
        <p>Gracias por escribirme. Recibí tu mensaje sobre "<strong>${escapeHtml(
          data.subject,
        )}</strong>" y te voy a responder a la brevedad.</p>
        <p>Un saludo,<br />Mariano Macías</p>
        <hr />
        <p style="color:#888;font-size:12px;">Este es un correo automático de confirmación, no necesitás responderlo.</p>
      `,
    });
  }

  /**
   * Notifies Mariano that a guest left a recommendation via the Airbnb
   * guest guide. Private by design: no auto-reply is sent to the guest.
   */
  async sendRecommendationNotification(data: RecommendationEmailData): Promise<boolean> {
    if (!this.airbnbReceiverEmail) {
      this.logger.warn(
        'AIRBNB_RECEIVER_EMAIL / CONTACT_RECEIVER_EMAIL is not set — skipping recommendation notification email.',
      );
      return false;
    }

    return this.send({
      to: this.airbnbReceiverEmail,
      subject: `[Guía Airbnb] Nueva recomendación de ${data.name}`,
      html: `
        <h2>Nueva recomendación de un huésped</h2>
        <p><strong>Nombre:</strong> ${escapeHtml(data.name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(data.email)}</p>
        <p><strong>Recomendación:</strong></p>
        <p>${escapeHtml(data.message).replace(/\n/g, '<br />')}</p>
      `,
      replyTo: data.email,
    });
  }

  /**
   * Notifies Mariano that someone subscribed to the TechPRO (audifonos)
   * newsletter.
   */
  async sendAudifonosSubscriberNotification(data: AudifonosSubscriberEmailData): Promise<boolean> {
    if (!this.audifonosReceiverEmail) {
      this.logger.warn(
        'AUDIFONOS_RECEIVER_EMAIL / CONTACT_RECEIVER_EMAIL is not set — skipping subscriber notification email.',
      );
      return false;
    }

    return this.send({
      to: this.audifonosReceiverEmail,
      subject: '[TechPRO] Nuevo suscriptor al newsletter',
      html: `
        <h2>Nuevo suscriptor al newsletter de TechPRO</h2>
        <p><strong>Email:</strong> ${escapeHtml(data.email)}</p>
      `,
    });
  }

  /** Confirms to the subscriber that they successfully joined the newsletter. */
  async sendAudifonosSubscriptionConfirmation(data: AudifonosSubscriberEmailData): Promise<boolean> {
    return this.send({
      to: data.email,
      subject: '¡Bienvenido a TechPRO!',
      html: `
        <p>Hola,</p>
        <p>Gracias por sumarte al newsletter de <strong>TechPRO</strong>. A partir de ahora vas a recibir
        novedades sobre lanzamientos, descuentos exclusivos y contenido sobre nuestros audífonos.</p>
        <p>Un saludo,<br />El equipo de TechPRO</p>
        <hr />
        <p style="color:#888;font-size:12px;">Este es un correo automático de confirmación, no necesitás responderlo.</p>
      `,
    });
  }

  /** Notifies Mariano that a new TiendaMueble contact form submission arrived. */
  async sendTiendaMuebleOwnerNotification(data: TiendaMuebleContactEmailData): Promise<boolean> {
    if (!this.tiendaMuebleReceiverEmail) {
      this.logger.warn(
        'TIENDA_MUEBLE_RECEIVER_EMAIL / CONTACT_RECEIVER_EMAIL is not set — skipping owner notification email.',
      );
      return false;
    }

    return this.send({
      to: this.tiendaMuebleReceiverEmail,
      subject: `[TiendaMueble] Nuevo mensaje: ${data.asunto}`,
      html: `
        <h2>Nuevo mensaje desde el formulario de contacto de TiendaMueble</h2>
        <p><strong>Nombre:</strong> ${escapeHtml(data.nombre)}</p>
        <p><strong>Email:</strong> ${escapeHtml(data.email)}</p>
        <p><strong>Teléfono:</strong> ${escapeHtml(data.telefono ?? '-')}</p>
        <p><strong>País:</strong> ${escapeHtml(data.pais ?? '-')}</p>
        <p><strong>Tipo:</strong> ${escapeHtml(data.tipo ?? '-')}</p>
        <p><strong>Categoría de interés:</strong> ${escapeHtml(data.categoria ?? '-')}</p>
        <p><strong>Asunto:</strong> ${escapeHtml(data.asunto)}</p>
        <p><strong>Mensaje:</strong></p>
        <p>${escapeHtml(data.mensaje).replace(/\n/g, '<br />')}</p>
      `,
      replyTo: data.email,
    });
  }

  /** Confirms to the sender that their TiendaMueble message was received. */
  async sendTiendaMuebleSenderAutoReply(data: TiendaMuebleContactEmailData): Promise<boolean> {
    return this.send({
      to: data.email,
      subject: 'Gracias por tu mensaje — TiendaMuebles',
      html: `
        <p>Hola ${escapeHtml(data.nombre)},</p>
        <p>Gracias por escribirnos. Recibimos tu mensaje sobre "<strong>${escapeHtml(
          data.asunto,
        )}</strong>" y te vamos a responder a la brevedad.</p>
        <p>Un saludo,<br />El equipo de TiendaMuebles</p>
        <hr />
        <p style="color:#888;font-size:12px;">Este es un correo automático de confirmación, no necesitás responderlo.</p>
      `,
    });
  }

  /**
   * Comprobante de compra para el cliente. Se dispara una sola vez, desde
   * OrdersService.handleStripeWebhookEvent, justo cuando el pedido pasa a
   * "paid" por primera vez (evento verificado de Stripe) — nunca antes,
   * para no confirmar una compra que todavía puede fallar o cancelarse.
   */
  async sendTiendaMuebleOrderConfirmation(data: TiendaMuebleOrderConfirmationEmailData): Promise<boolean> {
    return this.send({
      to: data.userEmail,
      subject: `Pedido confirmado — TiendaMuebles (#${data.orderId.slice(-8)})`,
      html: `
        <h2>¡Gracias por tu compra${data.userName ? `, ${escapeHtml(data.userName)}` : ''}!</h2>
        <p>Confirmamos que tu pago fue procesado correctamente. Este email es tu comprobante de compra.</p>
        <p><strong>Nº de pedido:</strong> ${escapeHtml(data.orderId)}</p>
        ${this.renderOrderItemsTable(data.items, data.total)}
        <h3>Datos de entrega</h3>
        <p>
          <strong>Dirección:</strong> ${escapeHtml(data.shippingAddress)}<br />
          <strong>Código postal:</strong> ${escapeHtml(data.postalCode)}<br />
          <strong>Teléfono de contacto:</strong> ${escapeHtml(data.phone)}
        </p>
        <p>Nos vamos a contactar al teléfono que dejaste para coordinar la entrega.</p>
        <hr />
        <p style="color:#888;font-size:12px;">Este es un correo automático de confirmación, no necesitás responderlo.</p>
      `,
    });
  }

  /** Avisa a Mariano (dueño de la tienda) que entró un pedido pagado, para que coordine la entrega. */
  async sendTiendaMuebleOrderOwnerNotification(data: TiendaMuebleOrderConfirmationEmailData): Promise<boolean> {
    if (!this.tiendaMuebleReceiverEmail) {
      this.logger.warn(
        'TIENDA_MUEBLE_RECEIVER_EMAIL / CONTACT_RECEIVER_EMAIL is not set — skipping order owner notification email.',
      );
      return false;
    }

    return this.send({
      to: this.tiendaMuebleReceiverEmail,
      subject: `[TiendaMueble] Nuevo pedido pagado — #${data.orderId.slice(-8)}`,
      html: `
        <h2>Nuevo pedido pagado</h2>
        <p><strong>Cliente:</strong> ${escapeHtml(data.userName ?? data.userEmail)} (${escapeHtml(data.userEmail)})</p>
        <p><strong>Nº de pedido:</strong> ${escapeHtml(data.orderId)}</p>
        ${this.renderOrderItemsTable(data.items, data.total)}
        <h3>Datos de entrega</h3>
        <p>
          <strong>Dirección:</strong> ${escapeHtml(data.shippingAddress)}<br />
          <strong>Código postal:</strong> ${escapeHtml(data.postalCode)}<br />
          <strong>Teléfono de contacto:</strong> ${escapeHtml(data.phone)}
        </p>
      `,
      replyTo: data.userEmail,
    });
  }

  private renderOrderItemsTable(items: TiendaMuebleOrderItemEmailData[], total: number): string {
    const rows = items
      .map((item) => {
        const imageUrl = this.resolveTiendaMuebleImageUrl(item.image);
        const subtotal = (item.price * item.quantity).toFixed(2);
        return `
          <tr>
            <td style="padding:8px;border-bottom:1px solid #eee;">
              ${
                imageUrl
                  ? `<img src="${imageUrl}" alt="${escapeHtml(item.name)}" width="56" height="56" style="object-fit:cover;border-radius:4px;display:block;" />`
                  : ''
              }
            </td>
            <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(item.name)}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">€${item.price.toFixed(2)}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">€${subtotal}</td>
          </tr>
        `;
      })
      .join('');

    return `
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <thead>
          <tr style="text-align:left;">
            <th style="padding:8px;border-bottom:2px solid #333;"></th>
            <th style="padding:8px;border-bottom:2px solid #333;">Producto</th>
            <th style="padding:8px;border-bottom:2px solid #333;text-align:center;">Cant.</th>
            <th style="padding:8px;border-bottom:2px solid #333;text-align:right;">Precio</th>
            <th style="padding:8px;border-bottom:2px solid #333;text-align:right;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="4" style="padding:8px;text-align:right;"><strong>Total</strong></td>
            <td style="padding:8px;text-align:right;"><strong>€${total.toFixed(2)}</strong></td>
          </tr>
        </tfoot>
      </table>
    `;
  }

  private resolveTiendaMuebleImageUrl(image?: string): string | undefined {
    if (!image) return undefined;
    if (/^https?:\/\//i.test(image)) return image;
    return `${this.tiendaMuebleFrontendUrl}${image.startsWith('/') ? '' : '/'}${image}`;
  }

  private async send(params: { to: string; subject: string; html: string; replyTo?: string }): Promise<boolean> {
    if (!this.resend) {
      this.logger.log(`[DEV] Email to ${params.to}: ${params.subject}`);
      return false;
    }

    try {
      await this.resend.emails.send({
        from: this.fromAddress,
        to: params.to,
        subject: params.subject,
        html: params.html,
        ...(params.replyTo ? { replyTo: params.replyTo } : {}),
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${params.to}`, error as Error);
      return false;
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
