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
  provincia?: string;
  phone: string;
}

interface ArquitecturaContactEmailData {
  nombre: string;
  email: string;
  mensaje: string;
  telefono?: string;
  modelo?: string;
}

interface GymInviteEmailData {
  email: string;
  firstName: string;
  inviteToken: string;
  centerName?: string;
}

interface GymWelcomeEmailData {
  email: string;
  firstName: string;
}

interface GymPaymentEmailData {
  email: string;
  firstName: string;
  planName: string;
  amount: number;
  currency: string;
  periodEnd: Date;
}

interface GymManualPaymentAdminEmailData {
  email: string;
  memberName: string;
  planName: string;
  amount: number;
  currency: string;
  processedByName: string;
}

interface GymClassSpotAvailableEmailData {
  email: string;
  firstName: string;
  className: string;
  sessionDate: Date;
}

interface GymAnnouncementEmailData {
  email: string;
  firstName: string;
  title: string;
  body?: string;
}

interface GymMembershipExpiringSoonEmailData {
  email: string;
  firstName: string;
  daysLeft: number;
  membershipEndDate: Date;
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
  private readonly arquitecturaReceiverEmail: string;
  private readonly gymFrontendUrl: string;

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
    // Idem para el formulario de contacto/consulta de arquitectura.
    this.arquitecturaReceiverEmail =
      this.config.get<string>('ARQUITECTURA_RECEIVER_EMAIL') ?? this.receiverEmail;
    // Igual que TIENDA_MUEBLE_FRONTEND_URL: se usa solo para armar el link
    // absoluto de "aceptar invitación" que recibe el socio dado de alta por
    // un admin (ver GymUsersService.createByAdmin) — no confundir con
    // FRONTEND_URL, que es la lista de orígenes CORS.
    this.gymFrontendUrl = (
      this.config.get<string>('GYM_FRONTEND_URL') ?? 'http://localhost:5177'
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
          <strong>Código postal:</strong> ${escapeHtml(data.postalCode)}${data.provincia ? ` (${escapeHtml(data.provincia)})` : ''}<br />
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
          <strong>Código postal:</strong> ${escapeHtml(data.postalCode)}${data.provincia ? ` (${escapeHtml(data.provincia)})` : ''}<br />
          <strong>Teléfono de contacto:</strong> ${escapeHtml(data.phone)}
        </p>
      `,
      replyTo: data.userEmail,
    });
  }

  /** Notifies Mariano that a new arquitectura contact/consultation form submission arrived. */
  async sendArquitecturaOwnerNotification(data: ArquitecturaContactEmailData): Promise<boolean> {
    if (!this.arquitecturaReceiverEmail) {
      this.logger.warn(
        'ARQUITECTURA_RECEIVER_EMAIL / CONTACT_RECEIVER_EMAIL is not set — skipping owner notification email.',
      );
      return false;
    }

    const heading = data.modelo
      ? `Nueva consulta sobre el modelo "${escapeHtml(data.modelo)}"`
      : 'Nuevo mensaje desde el formulario de contacto';

    return this.send({
      to: this.arquitecturaReceiverEmail,
      subject: data.modelo
        ? `[ArquitecturaBosque] Consulta: ${data.modelo}`
        : '[ArquitecturaBosque] Nuevo mensaje de contacto',
      html: this.renderArquitecturaEmailShell({
        preheader: data.modelo
          ? `Nueva consulta de ${data.nombre} sobre ${data.modelo}`
          : `Nuevo mensaje de ${data.nombre}`,
        title: heading,
        bodyHtml: `
          ${this.renderArquitecturaInfoRow('Nombre', escapeHtml(data.nombre))}
          ${this.renderArquitecturaInfoRow('Email', escapeHtml(data.email))}
          ${data.telefono ? this.renderArquitecturaInfoRow('Teléfono', escapeHtml(data.telefono)) : ''}
          ${data.modelo ? this.renderArquitecturaInfoRow('Modelo de interés', escapeHtml(data.modelo)) : ''}
          <p style="margin:24px 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:#5c6b57;">Mensaje</p>
          <p style="margin:0;padding:16px;background:#f4f2ec;border-radius:8px;color:#33352f;line-height:1.6;">${escapeHtml(data.mensaje).replace(/\n/g, '<br />')}</p>
        `,
      }),
      replyTo: data.email,
    });
  }

  /** Confirms to the sender that their arquitectura message was received. */
  async sendArquitecturaSenderAutoReply(data: ArquitecturaContactEmailData): Promise<boolean> {
    return this.send({
      to: data.email,
      subject: 'Gracias por tu mensaje — ArquitecturaBosque',
      html: this.renderArquitecturaEmailShell({
        preheader: 'Recibimos tu mensaje y te vamos a responder a la brevedad.',
        title: `Gracias, ${escapeHtml(data.nombre)}`,
        bodyHtml: `
          <p style="margin:0 0 16px;color:#33352f;line-height:1.7;">
            Recibimos tu ${data.modelo ? `consulta sobre el modelo <strong>${escapeHtml(data.modelo)}</strong>` : 'mensaje'}
            y nuestro equipo se va a poner en contacto con vos a la brevedad para conversar sobre tu futura casa en el bosque.
          </p>
          <p style="margin:0;color:#33352f;line-height:1.7;">
            Mientras tanto, si preferís una respuesta más inmediata, también podés escribirnos directamente por WhatsApp.
          </p>
          <div style="margin:28px 0 4px;">
            <a href="https://wa.me/34623912847" style="display:inline-block;background:#3f5b41;color:#f4f2ec;text-decoration:none;padding:12px 24px;border-radius:999px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;">Escribinos por WhatsApp</a>
          </div>
        `,
      }),
    });
  }

  /**
   * Invitación para que un socio dado de alta manualmente por un admin (ej.
   * en recepción, ver GymUsersService.createByAdmin) complete su acceso
   * eligiendo contraseña o vinculando Google. No depende de RESEND_API_KEY
   * para nada específico de Gym — usa el mismo remitente/config general.
   */
  async sendGymInviteEmail(data: GymInviteEmailData): Promise<boolean> {
    const acceptUrl = `${this.gymFrontendUrl}/invitacion/${encodeURIComponent(data.inviteToken)}`;

    // El log genérico de `send()` en modo dev (sin RESEND_API_KEY) solo
    // imprime el subject, no el link — acá sí hace falta el link a mano
    // para poder probar el flujo de accept-invite en local sin tener que ir
    // a buscar el inviteToken directo en Mongo.
    if (!this.resend) {
      this.logger.log(`[DEV] Invite link for ${data.email}: ${acceptUrl}`);
    }

    return this.send({
      to: data.email,
      subject: '¡Te invitaron a GymBro! Activá tu acceso',
      html: `
        <p>Hola ${escapeHtml(data.firstName)},</p>
        <p>${
          data.centerName ? `El equipo de <strong>${escapeHtml(data.centerName)}</strong>` : 'Tu gimnasio'
        } te dio de alta como socio en GymBro. Para poder entrar a la app, elegir tu contraseña (o vincular tu cuenta de Google) y ver tu carnet digital, activá tu acceso desde el siguiente enlace:</p>
        <p>
          <a href="${acceptUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;">Activar mi acceso</a>
        </p>
        <p style="color:#888;font-size:13px;">Si el botón no funciona, copiá y pegá este enlace en tu navegador:<br />${acceptUrl}</p>
        <p style="color:#888;font-size:13px;">Este enlace vence en unos días. Si no esperabas este correo, podés ignorarlo.</p>
      `,
    });
  }

  /**
   * Confirmación de alta para el socio que se autoregistró (email/contraseña
   * o Google, ver GymAuthService.registerWithEmail y .loginWithGoogle) — a
   * diferencia de sendGymInviteEmail, acá la cuenta ya está activa de
   * entrada (no hace falta token ni acción de activación), así que el
   * enlace lleva directo a la app.
   */
  async sendGymWelcomeEmail(data: GymWelcomeEmailData): Promise<boolean> {
    if (!this.resend) {
      this.logger.log(`[DEV] Welcome email would be sent to ${data.email} (app: ${this.gymFrontendUrl})`);
    }

    return this.send({
      to: data.email,
      subject: '¡Bienvenido/a a GymBro!',
      html: `
        <p>Hola ${escapeHtml(data.firstName)},</p>
        <p>Tu cuenta en GymBro ya está activa. Desde la app vas a poder ver tu carnet digital con QR, reservar clases, seguir tu progreso y estar al tanto de anuncios de tu gimnasio.</p>
        <p>
          <a href="${this.gymFrontendUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;">Entrar a GymBro</a>
        </p>
        <p style="color:#888;font-size:13px;">Es una app web instalable: abrí el enlace desde tu celular y elegí "Agregar a pantalla de inicio" (o "Instalar app") para tenerla como cualquier otra app, sin pasar por ninguna tienda de aplicaciones.</p>
        <p style="color:#888;font-size:13px;">Si el botón no funciona, copiá y pegá este enlace en tu navegador:<br />${this.gymFrontendUrl}</p>
      `,
    });
  }

  /**
   * Confirmación de pago acreditado (Stripe o Mercado Pago, ver
   * GymPaymentsService.markPaymentPaid) — se manda una sola vez por pago
   * gracias a la idempotencia del webhook, así que acá no hace falta
   * ninguna lógica extra de "no duplicar".
   */
  async sendGymPaymentConfirmationEmail(data: GymPaymentEmailData): Promise<boolean> {
    const formattedAmount = `${data.amount.toFixed(2)} ${data.currency.toUpperCase()}`;
    const formattedPeriodEnd = data.periodEnd.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    if (!this.resend) {
      this.logger.log(`[DEV] Payment confirmation email would be sent to ${data.email} (plan: ${data.planName}, ${formattedAmount})`);
    }

    return this.send({
      to: data.email,
      subject: '¡Pago confirmado! Tu membresía de GymBro está activa',
      html: `
        <p>Hola ${escapeHtml(data.firstName)},</p>
        <p>Recibimos tu pago y tu membresía ya está activa.</p>
        <p>
          <strong>Plan:</strong> ${escapeHtml(data.planName)}<br />
          <strong>Importe:</strong> ${formattedAmount}<br />
          <strong>Válida hasta:</strong> ${formattedPeriodEnd}
        </p>
        <p>
          <a href="${this.gymFrontendUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;">Ver mi carnet</a>
        </p>
        <p style="color:#888;font-size:13px;">Si el botón no funciona, copiá y pegá este enlace en tu navegador:<br />${this.gymFrontendUrl}</p>
      `,
    });
  }

  /**
   * Aviso a los superadmins (todos, se consultan por rol — ver
   * GymPaymentsService.notifySuperadminsOfManualPayment) cuando un admin o
   * superadmin registra un pago manual (efectivo/transferencia) desde la
   * ficha de un socio. El socio ya recibe su propia confirmación vía
   * sendGymPaymentConfirmationEmail (mismo markPaymentPaid, sin importar el
   * proveedor) — este mail es aparte, para que el resto del equipo tenga
   * trazabilidad de quién cobró qué sin tener que entrar a Mongo.
   */
  async sendGymManualPaymentRecordedEmail(data: GymManualPaymentAdminEmailData): Promise<boolean> {
    const formattedAmount = `${data.amount.toFixed(2)} ${data.currency.toUpperCase()}`;

    if (!this.resend) {
      this.logger.log(
        `[DEV] Manual payment admin notification would be sent to ${data.email} (${data.memberName}, ${data.planName}, ${formattedAmount}, cobrado por ${data.processedByName})`,
      );
    }

    return this.send({
      to: data.email,
      subject: `Pago manual registrado — ${data.memberName}`,
      html: `
        <p>Se registró un pago manual (efectivo/transferencia) en GymBro:</p>
        <p>
          <strong>Socio:</strong> ${escapeHtml(data.memberName)}<br />
          <strong>Plan:</strong> ${escapeHtml(data.planName)}<br />
          <strong>Importe:</strong> ${formattedAmount}<br />
          <strong>Registrado por:</strong> ${escapeHtml(data.processedByName)}
        </p>
        <p style="color:#888;font-size:13px;">Aviso automático — no hace falta ninguna acción, es solo para llevar trazabilidad de los pagos cobrados a mano.</p>
      `,
    });
  }

  /**
   * Aviso de que se liberó un lugar en una clase con lista de espera y el
   * socio pasó de 'waitlisted' a 'booked' (ver
   * GymClassesService.cancelBooking → GymNotificationsService.
   * notifyClassSpotAvailable). Se manda junto con el push (si está
   * configurado, ver gym-web-push.service.ts) — el email es el respaldo
   * para quien no tiene notificaciones push activadas en el navegador.
   */
  async sendGymClassSpotAvailableEmail(data: GymClassSpotAvailableEmailData): Promise<boolean> {
    const formattedDate = data.sessionDate.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    });

    if (!this.resend) {
      this.logger.log(`[DEV] Class spot available email would be sent to ${data.email} (${data.className}, ${formattedDate})`);
    }

    return this.send({
      to: data.email,
      subject: `¡Se liberó un lugar en "${data.className}"!`,
      html: `
        <p>Hola ${escapeHtml(data.firstName)},</p>
        <p>Buenas noticias: se liberó un lugar en <strong>${escapeHtml(data.className)}</strong> del <strong>${formattedDate}</strong> y ya quedaste confirmado/a (pasaste de la lista de espera a reservado).</p>
        <p>
          <a href="${this.gymFrontendUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;">Ver mis clases</a>
        </p>
        <p style="color:#888;font-size:13px;">Si ya no podés ir, cancelá tu reserva desde la app para liberar el lugar a otro socio.</p>
      `,
    });
  }

  /**
   * Envío masivo (uno por socio) al publicar un anuncio/promo — ver
   * GymNotificationsService.publishAnnouncement. Separado de
   * sendGymPaymentConfirmationEmail/etc. porque el contenido lo escribe un
   * admin (título + cuerpo libres), no un dato estructurado del dominio.
   */
  async sendGymAnnouncementEmail(data: GymAnnouncementEmailData): Promise<boolean> {
    if (!this.resend) {
      this.logger.log(`[DEV] Announcement email would be sent to ${data.email}: ${data.title}`);
    }

    return this.send({
      to: data.email,
      subject: `[GymBro] ${data.title}`,
      html: `
        <p>Hola ${escapeHtml(data.firstName)},</p>
        <p><strong>${escapeHtml(data.title)}</strong></p>
        ${data.body ? `<p>${escapeHtml(data.body).replace(/\n/g, '<br />')}</p>` : ''}
        <p>
          <a href="${this.gymFrontendUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;">Abrir GymBro</a>
        </p>
      `,
    });
  }

  /**
   * Recordatorio de "membresía próxima a vencer" — disparado por
   * GymRemindersService.sendExpiringSoonReminders (GitHub Action diaria, ver
   * gym/reminders/), no por una acción del socio. Mismo umbral
   * (EXPIRING_SOON_DAYS = 7 días) que el aviso visual del frontend
   * (MembresiaPage/HomePage), para que ambos canales salgan en sintonía.
   */
  async sendGymMembershipExpiringSoonEmail(data: GymMembershipExpiringSoonEmailData): Promise<boolean> {
    const formattedDate = data.membershipEndDate.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    const daysLabel = data.daysLeft === 0 ? 'hoy' : `en ${data.daysLeft} día${data.daysLeft === 1 ? '' : 's'} (${formattedDate})`;

    if (!this.resend) {
      this.logger.log(`[DEV] Membership expiring soon email would be sent to ${data.email} (vence ${daysLabel})`);
    }

    return this.send({
      to: data.email,
      subject: data.daysLeft === 0 ? 'Tu membresía de GymBro vence hoy' : `Tu membresía de GymBro vence ${daysLabel}`,
      html: `
        <p>Hola ${escapeHtml(data.firstName)},</p>
        <p>Te escribimos para avisarte que tu membresía vence <strong>${daysLabel}</strong>.</p>
        <p>Si querés seguir entrenando sin interrupciones, renová o revisá tu plan desde la app.</p>
        <p>
          <a href="${this.gymFrontendUrl}/membresia" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;">Ver mi membresía</a>
        </p>
        <p style="color:#888;font-size:13px;">Si preferís pausarla en vez de renovarla, también podés congelarla por 1 a 3 semanas desde la misma pantalla.</p>
      `,
    });
  }

  /**
   * Envuelve el contenido de un email de arquitectura en una plantilla con
   * identidad de marca (verde bosque, tipografía serif para títulos) —
   * pedido explícito de que estos correos sean más estéticos que los del
   * resto de los proyectos, que usan HTML plano.
   */
  private renderArquitecturaEmailShell(options: { preheader: string; title: string; bodyHtml: string }): string {
    return `
      <div style="background:#e9e5d8;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
        <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.preheader)}</span>
        <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;border-collapse:collapse;background:#fffdf8;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:#2f4630;padding:28px 32px;">
              <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:20px;letter-spacing:0.03em;color:#f4f2ec;">ArquitecturaBosque</p>
              <p style="margin:4px 0 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#b7c4b0;">Casas integradas al bosque</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:normal;color:#2f4630;">${options.title}</h1>
              ${options.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#f4f2ec;border-top:1px solid #e3ded0;">
              <p style="margin:0;font-size:12px;color:#7a8073;">ArquitecturaBosque · +34 623 912 847</p>
            </td>
          </tr>
        </table>
      </div>
    `;
  }

  private renderArquitecturaInfoRow(label: string, value: string): string {
    return `
      <p style="margin:0 0 10px;font-size:14px;color:#33352f;">
        <span style="display:inline-block;min-width:130px;color:#5c6b57;font-weight:bold;">${label}</span>${value}
      </p>
    `;
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
