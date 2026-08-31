import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Contact, ContactDocument } from './schemas/contact.schema.js';
import { CreateContactDto } from './dto/create-contact.dto.js';
import { EmailService } from '../email/email.service.js';

interface SubmitContactContext {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    @InjectModel(Contact.name) private readonly contactModel: Model<ContactDocument>,
    private readonly emailService: EmailService,
  ) {}

  async submit(dto: CreateContactDto, context: SubmitContactContext): Promise<void> {
    // Honeypot: bots fill every field, real users never see this one.
    // We pretend everything went fine without saving or emailing anything.
    if (dto.company) {
      this.logger.warn(`Honeypot triggered from IP ${context.ip ?? 'unknown'} — submission dropped.`);
      return;
    }

    const created = await this.contactModel.create({
      name: dto.name,
      email: dto.email,
      subject: dto.subject,
      message: dto.message,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    const [notificationSent, autoReplySent] = await Promise.all([
      this.emailService.sendOwnerNotification(dto),
      this.emailService.sendSenderAutoReply(dto),
    ]);

    created.notificationSent = notificationSent;
    created.autoReplySent = autoReplySent;
    await created.save();
  }
}
