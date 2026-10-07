import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EmailService } from '../../email/email.service.js';
import type { GymRequestUser } from '../auth/gym-request-user.interface.js';
import { GymAnnouncement, type GymAnnouncementDocument } from '../schemas/gym-announcement.schema.js';
import { type GymClassDocument } from '../schemas/gym-class.schema.js';
import { type GymClassBookingDocument } from '../schemas/gym-class-booking.schema.js';
import { GymUser, type GymUserDocument } from '../schemas/gym-user.schema.js';
import { GymWebPushService, type GymPushPayload } from './gym-web-push.service.js';
import type { SubscribeGymPushDto } from './dto/subscribe-push.dto.js';
import type { UnsubscribeGymPushDto } from './dto/unsubscribe-push.dto.js';
import { GYM_DB_CONNECTION } from '../gym-db.constants.js';

export interface GymAnnouncementPublishResult {
  notifiedPush: number;
  notifiedEmail: number;
}

@Injectable()
export class GymNotificationsService {
  private readonly logger = new Logger(GymNotificationsService.name);

  constructor(
    @InjectModel(GymUser.name, GYM_DB_CONNECTION) private readonly userModel: Model<GymUserDocument>,
    @InjectModel(GymAnnouncement.name, GYM_DB_CONNECTION) private readonly announcementModel: Model<GymAnnouncementDocument>,
    private readonly webPushService: GymWebPushService,
    private readonly emailService: EmailService,
  ) {}

  // Expuesto al frontend para que el service worker pueda suscribirse
  // (pushManager.subscribe({ applicationServerKey: ... })) — null si el
  // servidor no tiene VAPID configurado, así el botón de activar
  // notificaciones simplemente no se muestra (mismo criterio que
  // stripeEnabled/mercadopagoEnabled en payments).
  getVapidPublicKey(): string | null {
    return this.webPushService.isConfigured ? (this.webPushService.publicKey ?? null) : null;
  }

  // Idempotente por endpoint: si el navegador vuelve a mandar la misma
  // suscripción (ej. tras refrescar la página) no se duplica.
  async subscribe(user: GymRequestUser, dto: SubscribeGymPushDto): Promise<void> {
    await this.userModel.updateOne({ _id: user.id }, { $pull: { pushSubscriptions: { endpoint: dto.endpoint } } });
    await this.userModel.updateOne(
      { _id: user.id },
      { $push: { pushSubscriptions: { endpoint: dto.endpoint, keys: dto.keys } } },
    );
  }

  async unsubscribe(user: GymRequestUser, dto: UnsubscribeGymPushDto): Promise<void> {
    await this.userModel.updateOne({ _id: user.id }, { $pull: { pushSubscriptions: { endpoint: dto.endpoint } } });
  }

  // Llamado desde GymClassesService.cancelBooking cuando se libera un cupo
  // y se promueve al primero de la lista de espera — booking.userId tiene
  // que venir populado con al menos firstName/lastName/email/
  // pushSubscriptions (ver el .populate() en el call site).
  async notifyClassSpotAvailable(booking: GymClassBookingDocument, gymClass: GymClassDocument): Promise<void> {
    const member = booking.userId as unknown as GymUserDocument;
    if (!member || typeof member !== 'object' || !('email' in member)) {
      this.logger.warn('notifyClassSpotAvailable: booking.userId no vino populado, se omite la notificación.');
      return;
    }

    const sessionDateLabel = booking.sessionDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'long' });

    await this.sendPushToMember(member, {
      title: '¡Se liberó un lugar!',
      body: `Ya tenés tu lugar confirmado en "${gymClass.name}" del ${sessionDateLabel}.`,
    });

    const sent = await this.emailService.sendGymClassSpotAvailableEmail({
      email: member.email,
      firstName: member.firstName,
      className: gymClass.name,
      sessionDate: booking.sessionDate,
    });
    if (!sent) {
      this.logger.warn(
        `No se pudo mandar el email de "lugar liberado" a ${member.email} (el push, si estaba configurado, se intentó igual).`,
      );
    }
  }

  // Disparo explícito de un admin/superadmin para un anuncio ya creado (ver
  // GymAnnouncementsService.create) — push + email a todos los socios
  // activos, y recién ahí se marcan notifyPush/notifyEmail en el documento
  // (hasta este momento arrancan en false, ver announcements.service.ts).
  async publishAnnouncement(announcementId: string): Promise<GymAnnouncementPublishResult> {
    const announcement = await this.announcementModel.findById(announcementId);
    if (!announcement) {
      throw new NotFoundException('Announcement not found.');
    }

    // Los anuncios son globales, sin centerId (ver PLANNING.md sección 2.6),
    // así que no hay scoping por centro acá: van a todos los socios activos.
    // Para el tamaño de un gimnasio de barrio un loop simple alcanza; no hay
    // cron/queue en este backend (ver membership-expiration.util.ts), así
    // que esto se resuelve sincrónicamente dentro del request del admin.
    const members = await this.userModel.find({ isActive: true, role: 'member' });

    let notifiedPush = 0;
    let notifiedEmail = 0;

    for (const member of members) {
      notifiedPush += await this.sendPushToMember(member, {
        title: announcement.title,
        body: announcement.body ?? '',
      });

      const sent = await this.emailService.sendGymAnnouncementEmail({
        email: member.email,
        firstName: member.firstName,
        title: announcement.title,
        body: announcement.body,
      });
      if (sent) notifiedEmail += 1;
    }

    announcement.notifyPush = true;
    announcement.notifyEmail = true;
    await announcement.save();

    return { notifiedPush, notifiedEmail };
  }

  // Llamado desde GymRemindersService.sendExpiringSoonReminders (GitHub
  // Action diaria, ver gym/reminders/) — push + email al socio, mismo patrón
  // que notifyClassSpotAvailable (push es "mejor esfuerzo", el email es el
  // canal que siempre se intenta, con o sin push configurado/suscrito).
  async notifyMembershipExpiringSoon(member: GymUserDocument, daysLeft: number, membershipEndDate: Date): Promise<boolean> {
    await this.sendPushToMember(member, {
      title: daysLeft === 0 ? 'Tu membresía vence hoy' : `Tu membresía vence en ${daysLeft} día${daysLeft === 1 ? '' : 's'}`,
      body: 'Tocá para revisar tu plan o congelarla si lo necesitás.',
    });

    return this.emailService.sendGymMembershipExpiringSoonEmail({
      email: member.email,
      firstName: member.firstName,
      daysLeft,
      membershipEndDate,
    });
  }

  // Manda el push a todas las suscripciones (multi-dispositivo) de un
  // socio, y limpia en el momento las que el navegador reporta como
  // vencidas/inválidas (404/410) — ver GymWebPushService.send.
  private async sendPushToMember(member: GymUserDocument, payload: GymPushPayload): Promise<number> {
    if (!this.webPushService.isConfigured || member.pushSubscriptions.length === 0) {
      return 0;
    }

    let sentCount = 0;
    for (const subscription of member.pushSubscriptions) {
      const result = await this.webPushService.send(subscription, payload);
      if (result.ok) {
        sentCount += 1;
      }
      if (result.shouldRemove) {
        await this.userModel.updateOne(
          { _id: member._id },
          { $pull: { pushSubscriptions: { endpoint: subscription.endpoint } } },
        );
      }
    }
    return sentCount;
  }
}
