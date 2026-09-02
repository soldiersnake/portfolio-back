import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TiendaMuebleContact, TiendaMuebleContactDocument } from '../schemas/contact.schema.js';
import { CreateTiendaMuebleContactDto } from '../dto/create-contact.dto.js';
import { EmailService } from '../../email/email.service.js';

interface SubmitContactContext {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class TiendaMuebleContactService {
  private readonly logger = new Logger(TiendaMuebleContactService.name);

  constructor(
    @InjectModel(TiendaMuebleContact.name) private readonly contactModel: Model<TiendaMuebleContactDocument>,
    private readonly emailService: EmailService,
  ) {}

  async submit(dto: CreateTiendaMuebleContactDto, context: SubmitContactContext): Promise<void> {
    if (dto.company) {
      this.logger.warn(`Honeypot triggered from IP ${context.ip ?? 'unknown'} — submission dropped.`);
      return;
    }

    const created = await this.contactModel.create({
      nombre: dto.nombre,
      email: dto.email,
      asunto: dto.asunto,
      mensaje: dto.mensaje,
      telefono: dto.telefono,
      pais: dto.pais,
      tipo: dto.tipo,
      categoria: dto.categoria,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    const [notificationSent, autoReplySent] = await Promise.all([
      this.emailService.sendTiendaMuebleOwnerNotification(dto),
      this.emailService.sendTiendaMuebleSenderAutoReply(dto),
    ]);

    created.notificationSent = notificationSent;
    created.autoReplySent = autoReplySent;
    await created.save();
  }
}
