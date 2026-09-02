import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Subscriber, SubscriberDocument } from './schemas/subscriber.schema.js';
import { SubscribeNewsletterDto } from './dto/subscribe-newsletter.dto.js';
import { EmailService } from '../email/email.service.js';

interface SubscribeContext {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AudifonosService {
  private readonly logger = new Logger(AudifonosService.name);

  constructor(
    @InjectModel(Subscriber.name) private readonly subscriberModel: Model<SubscriberDocument>,
    private readonly emailService: EmailService,
  ) {}

  async subscribe(dto: SubscribeNewsletterDto, context: SubscribeContext): Promise<void> {
    // Honeypot: bots fill every field, real visitors never see this one.
    // We pretend everything went fine without saving or emailing anything.
    if (dto.company) {
      this.logger.warn(`Honeypot triggered from IP ${context.ip ?? 'unknown'} — submission dropped.`);
      return;
    }

    const email = dto.email.trim().toLowerCase();

    // Idempotente: si ya estaba suscripto, no volvemos a mandar mails ni
    // tiramos error — simplemente respondemos como si acabara de suscribirse.
    const alreadySubscribed = await this.subscriberModel.exists({ email });
    if (alreadySubscribed) {
      this.logger.log(`Email ${email} ya estaba suscripto — no se reenvían correos.`);
      return;
    }

    const created = await this.subscriberModel.create({
      email,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    const [notificationSent, confirmationSent] = await Promise.all([
      this.emailService.sendAudifonosSubscriberNotification({ email }),
      this.emailService.sendAudifonosSubscriptionConfirmation({ email }),
    ]);

    created.notificationSent = notificationSent;
    created.confirmationSent = confirmationSent;
    await created.save();
  }
}
