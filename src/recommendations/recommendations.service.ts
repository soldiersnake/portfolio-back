import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Recommendation, RecommendationDocument } from './schemas/recommendation.schema.js';
import { CreateRecommendationDto } from './dto/create-recommendation.dto.js';
import { EmailService } from '../email/email.service.js';

interface SubmitRecommendationContext {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    @InjectModel(Recommendation.name) private readonly recommendationModel: Model<RecommendationDocument>,
    private readonly emailService: EmailService,
  ) {}

  async submit(dto: CreateRecommendationDto, context: SubmitRecommendationContext): Promise<void> {
    // Honeypot: bots fill every field, real guests never see this one.
    // We pretend everything went fine without saving or emailing anything.
    if (dto.company) {
      this.logger.warn(`Honeypot triggered from IP ${context.ip ?? 'unknown'} — submission dropped.`);
      return;
    }

    const created = await this.recommendationModel.create({
      name: dto.name,
      email: dto.email,
      message: dto.message,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    // Privado: solo se notifica a Mariano por correo, no hay respuesta
    // automática al huésped ni visibilidad pública de las recomendaciones.
    created.notificationSent = await this.emailService.sendRecommendationNotification(dto);
    await created.save();
  }
}
