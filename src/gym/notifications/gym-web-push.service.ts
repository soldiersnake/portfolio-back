import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import type { GymPushSubscription } from '../schemas/gym-user.schema.js';

export interface GymPushPayload {
  title: string;
  body: string;
  url?: string;
}

export interface GymPushResult {
  ok: boolean;
  // true cuando el navegador devolvió 404/410 (suscripción vencida o el
  // usuario desinstaló/revocó permisos) — en ese caso hay que sacarla de
  // GymUser.pushSubscriptions, reintentar no tiene sentido.
  shouldRemove: boolean;
}

// Primer uso de Web Push en todo el backend compartido (el resto de los
// proyectos no lo necesitaba) — es su propio módulo (no vive dentro de
// email/) porque no manda mail, y porque las claves VAPID son un concepto
// aparte de Resend. Igual que Stripe/MercadoPago (ver gym-stripe.service.ts):
// "configurado" requiere las dos claves VAPID presentes, sin flag *_ENABLED
// aparte — a diferencia de los pagos, no hay ningún motivo para tener push
// configurado pero apagado a propósito.
@Injectable()
export class GymWebPushService {
  private readonly logger = new Logger(GymWebPushService.name);
  private readonly vapidPublicKey?: string;
  private configured = false;

  constructor(private readonly config: ConfigService) {
    this.vapidPublicKey = this.config.get<string>('GYM_VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('GYM_VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('GYM_VAPID_SUBJECT') ?? 'mailto:mariano.maciasgandulfo@gmail.com';

    if (this.vapidPublicKey && privateKey) {
      webpush.setVapidDetails(subject, this.vapidPublicKey, privateKey);
      this.configured = true;
    } else {
      this.logger.warn(
        'GYM_VAPID_PUBLIC_KEY/GYM_VAPID_PRIVATE_KEY no están seteadas — las notificaciones push de GymBro quedan deshabilitadas (el email sigue funcionando igual).',
      );
    }
  }

  get isConfigured(): boolean {
    return this.configured;
  }

  get publicKey(): string | undefined {
    return this.vapidPublicKey;
  }

  async send(subscription: GymPushSubscription, payload: GymPushPayload): Promise<GymPushResult> {
    if (!this.configured) {
      return { ok: false, shouldRemove: false };
    }

    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: subscription.keys },
        JSON.stringify(payload),
      );
      return { ok: true, shouldRemove: false };
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        this.logger.log(`Push subscription vencida/inválida (endpoint ${subscription.endpoint.slice(-16)}) — se va a limpiar.`);
        return { ok: false, shouldRemove: true };
      }
      this.logger.error('Error enviando push notification.', error as Error);
      return { ok: false, shouldRemove: false };
    }
  }
}
