import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type GymAnnouncementDocument = HydratedDocument<GymAnnouncement>;

export const GYM_ANNOUNCEMENT_TYPES = ['info', 'promo'] as const;
export type GymAnnouncementType = (typeof GYM_ANNOUNCEMENT_TYPES)[number];

// Unifica anuncios informativos y promociones — un solo modelo, el campo
// `type` distingue el caso. Push + popup + email (Fase 3) reutilizan este
// mismo documento, ver notifyPush/notifyEmail.
@Schema({ timestamps: true, collection: 'gym_announcements' })
export class GymAnnouncement {
  @Prop({ type: String, required: true, trim: true })
  title!: string;

  @Prop({ type: String, trim: true })
  body?: string;

  @Prop({ type: String })
  imageUrl?: string;

  @Prop({ type: String, required: true, enum: GYM_ANNOUNCEMENT_TYPES })
  type!: GymAnnouncementType;

  // Solo aplica si type = 'promo'.
  @Prop({ type: Number, min: 0 })
  promoPrice?: number;

  // Cuántos días abarca la promo (ej. 30 para "1 mes").
  @Prop({ type: Number, min: 1 })
  promoDurationDays?: number;

  @Prop({ type: Date, required: true, default: Date.now })
  publishAt!: Date;

  @Prop({ type: Date })
  expiresAt?: Date;

  @Prop({ type: Boolean, default: false })
  notifyPush!: boolean;

  @Prop({ type: Boolean, default: false })
  notifyEmail!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'GymUser', required: true })
  createdBy!: Types.ObjectId;
}

export const GymAnnouncementSchema = SchemaFactory.createForClass(GymAnnouncement);
