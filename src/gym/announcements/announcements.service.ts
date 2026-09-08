import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { GymRequestUser } from '../auth/gym-request-user.interface.js';
import { GymAnnouncement, type GymAnnouncementDocument } from '../schemas/gym-announcement.schema.js';
import type { CreateGymAnnouncementDto } from './dto/create-announcement.dto.js';
import type { UpdateGymAnnouncementDto } from './dto/update-announcement.dto.js';

export interface GymAnnouncementSummary {
  id: string;
  title: string;
  body?: string;
  imageUrl?: string;
  type: string;
  promoPrice?: number;
  promoDurationDays?: number;
  publishAt: Date;
  expiresAt?: Date;
  notifyPush: boolean;
  notifyEmail: boolean;
  createdBy: string;
}

@Injectable()
export class GymAnnouncementsService {
  constructor(@InjectModel(GymAnnouncement.name) private readonly announcementModel: Model<GymAnnouncementDocument>) {}

  // Lo que ve el socio: ya publicado (publishAt <= ahora) y no vencido
  // (expiresAt vacío o en el futuro). No hay CentersScope acá — el schema no
  // tiene centerId, los anuncios son globales para toda la app (ver
  // PLANNING.md sección 4, sin asterisco de scoping).
  async listVisible(): Promise<GymAnnouncementSummary[]> {
    const now = new Date();
    const announcements = await this.announcementModel
      .find({
        publishAt: { $lte: now },
        $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gte: now } }],
      })
      .sort({ publishAt: -1 });
    return announcements.map((announcement) => this.toSummary(announcement));
  }

  // Listado completo para el panel admin (incluye futuros y vencidos).
  async listAll(): Promise<GymAnnouncementSummary[]> {
    const announcements = await this.announcementModel.find().sort({ publishAt: -1 });
    return announcements.map((announcement) => this.toSummary(announcement));
  }

  async findById(id: string): Promise<GymAnnouncementSummary> {
    const announcement = await this.announcementModel.findById(id);
    if (!announcement) {
      throw new NotFoundException('Announcement not found.');
    }
    return this.toSummary(announcement);
  }

  async create(admin: GymRequestUser, dto: CreateGymAnnouncementDto): Promise<GymAnnouncementSummary> {
    const created = await this.announcementModel.create({
      title: dto.title,
      body: dto.body,
      imageUrl: dto.imageUrl,
      type: dto.type,
      promoPrice: dto.promoPrice,
      promoDurationDays: dto.promoDurationDays,
      publishAt: dto.publishAt ? new Date(dto.publishAt) : new Date(),
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      // Arrancan en false a propósito: el disparo real de push/email es una
      // acción separada y explícita del admin (POST
      // /gym/notifications/announcements/:id/publish, ver
      // GymNotificationsService.publishAnnouncement, Fase 3) — así puede
      // revisar/editar el anuncio antes de notificar a todos los socios.
      notifyPush: false,
      notifyEmail: false,
      createdBy: admin.id,
    });

    return this.toSummary(created);
  }

  async update(id: string, dto: UpdateGymAnnouncementDto): Promise<GymAnnouncementSummary> {
    const announcement = await this.announcementModel.findById(id);
    if (!announcement) {
      throw new NotFoundException('Announcement not found.');
    }

    if (dto.title !== undefined) announcement.title = dto.title;
    if (dto.body !== undefined) announcement.body = dto.body;
    if (dto.imageUrl !== undefined) announcement.imageUrl = dto.imageUrl;
    if (dto.type !== undefined) announcement.type = dto.type;
    if (dto.promoPrice !== undefined) announcement.promoPrice = dto.promoPrice;
    if (dto.promoDurationDays !== undefined) announcement.promoDurationDays = dto.promoDurationDays;
    if (dto.publishAt !== undefined) announcement.publishAt = new Date(dto.publishAt);
    if (dto.expiresAt !== undefined) announcement.expiresAt = new Date(dto.expiresAt);

    await announcement.save();
    return this.toSummary(announcement);
  }

  async remove(id: string): Promise<void> {
    const result = await this.announcementModel.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Announcement not found.');
    }
  }

  private toSummary(announcement: GymAnnouncementDocument): GymAnnouncementSummary {
    return {
      id: announcement._id.toString(),
      title: announcement.title,
      body: announcement.body,
      imageUrl: announcement.imageUrl,
      type: announcement.type,
      promoPrice: announcement.promoPrice,
      promoDurationDays: announcement.promoDurationDays,
      publishAt: announcement.publishAt,
      expiresAt: announcement.expiresAt,
      notifyPush: announcement.notifyPush,
      notifyEmail: announcement.notifyEmail,
      createdBy: announcement.createdBy.toString(),
    };
  }
}
