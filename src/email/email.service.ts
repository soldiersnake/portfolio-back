import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

interface ContactEmailData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly fromAddress: string;
  private readonly receiverEmail: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.fromAddress = this.config.get<string>('CONTACT_FROM_EMAIL') ?? 'onboarding@resend.dev';
    this.receiverEmail = this.config.get<string>('CONTACT_RECEIVER_EMAIL') ?? '';

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
