import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ArquitecturaContact, ArquitecturaContactDocument } from '../schemas/contact.schema.js';
import { CreateArquitecturaContactDto } from '../dto/create-contact.dto.js';
import { EmailService } from '../../email/email.service.js';

interface SubmitContactContext {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class ArquitecturaContactService {
  private readonly logger = new Logger(ArquitecturaContactService.name);

  constructor(
    @InjectModel(ArquitecturaContact.name) private readonly contactModel: Model<ArquitecturaContactDocument>,
    private readonly emailService: EmailService,
  ) {}

  async submit(dto: CreateArquitecturaContactDto, context: SubmitContactContext): Promise<void> {
    // Honeypot: bots fill every field, real users never see this one.
    // We pretend everything went fine without saving or emailing anything.
    if (dto.company) {
      this.logger.warn(`Honeypot triggered from IP ${context.ip ?? 'unknown'} — submission dropped.`);
      return;
    }

    const created = await this.contactModel.create({
      nombre: dto.nombre,
      email: dto.email,
      mensaje: dto.mensaje,
      telefono: dto.telefono,
      modelo: dto.modelo,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    const [notificationSent, autoReplySent] = await Promise.all([
      this.emailService.sendArquitecturaOwnerNotification(dto),
      this.emailService.sendArquitecturaSenderAutoReply(dto),
    ]);

    created.notificationSent = notificationSent;
    created.autoReplySent = autoReplySent;
    await created.save();
  }
}
