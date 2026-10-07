import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GymUser, type GymUserDocument } from '../schemas/gym-user.schema.js';
import { GymNotificationsService } from '../notifications/notifications.service.js';
import { GYM_DB_CONNECTION } from '../gym-db.constants.js';

// Mismo umbral que el aviso visual del frontend (ver EXPIRING_SOON_DAYS en
// MembresiaPage.tsx/HomePage.tsx) — si se cambia acá, cambiarlo también ahí
// para que el mail/push y el aviso en la app salgan en sintonía.
export const EXPIRING_SOON_DAYS = 7;

// No se manda de nuevo dentro de esta ventana aunque el workflow se dispare
// más de una vez el mismo día (reintento manual, doble trigger) — ver
// lastExpirationReminderSentAt en gym-user.schema.ts.
const REMINDER_COOLDOWN_HOURS = 20;

export interface GymExpiringSoonReminderResult {
  checked: number;
  notified: number;
  failed: number;
}

// Disparado por GymRemindersController (GitHub Action diaria, sin cron
// nativo — ver membership-expiration.util.ts para el resto del proyecto,
// que resuelve todo por "chequeo perezoso" en vez de jobs programados; este
// es el único caso que sí necesita un disparo externo porque no hay ningún
// endpoint que un socio golpee todos los días y que sirva de gancho).
@Injectable()
export class GymRemindersService {
  private readonly logger = new Logger(GymRemindersService.name);

  constructor(
    @InjectModel(GymUser.name, GYM_DB_CONNECTION) private readonly userModel: Model<GymUserDocument>,
    private readonly notificationsService: GymNotificationsService,
  ) {}

  async sendExpiringSoonReminders(): Promise<GymExpiringSoonReminderResult> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000);
    const cooldownCutoff = new Date(now.getTime() - REMINDER_COOLDOWN_HOURS * 60 * 60 * 1000);

    const members = await this.userModel.find({
      membershipStatus: 'active',
      membershipEndDate: { $gte: now, $lte: windowEnd },
      $or: [{ lastExpirationReminderSentAt: { $exists: false } }, { lastExpirationReminderSentAt: { $lt: cooldownCutoff } }],
    });

    let notified = 0;
    let failed = 0;

    for (const member of members) {
      const daysLeft = Math.ceil((member.membershipEndDate!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      try {
        const sent = await this.notificationsService.notifyMembershipExpiringSoon(
          member,
          daysLeft,
          member.membershipEndDate!,
        );
        // Se marca como "recordado" aunque el email haya fallado (p.ej. Resend
        // caído) para no reintentar en loop dentro de la misma ventana de
        // cooldown — el próximo día, si sigue en la ventana de 7 días, se
        // vuelve a intentar solo.
        member.lastExpirationReminderSentAt = now;
        await member.save();
        if (sent) {
          notified += 1;
        } else {
          failed += 1;
        }
      } catch (error) {
        this.logger.error(`No se pudo mandar el recordatorio de vencimiento a ${member.email}`, error as Error);
        failed += 1;
      }
    }

    return { checked: members.length, notified, failed };
  }
}
