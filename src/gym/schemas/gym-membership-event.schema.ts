import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { GYM_MEMBERSHIP_STATUSES, type GymMembershipStatus } from './gym-user.schema.js';

export type GymMembershipEventDocument = HydratedDocument<GymMembershipEvent>;

// `category` es lo que alimenta las métricas del dashboard admin:
// baja_voluntaria cuando el socio pide cancelar explícitamente, baja_impago
// cuando la membresía se vence porque no se renovó el pago (se puede
// disparar automático desde payments cuando pasa membershipEndDate sin un
// pago nuevo, ya en Fase 2). Así el dashboard puede mostrar "3 bajas este
// mes: 1 voluntaria, 2 por impago" en vez de un número único — ver
// PLANNING.md sección 2.9.
export const GYM_MEMBERSHIP_EVENT_CATEGORIES = [
  'alta',
  'baja_voluntaria',
  'baja_impago',
  'congelamiento',
  'reactivacion',
  'otro',
] as const;
export type GymMembershipEventCategory = (typeof GYM_MEMBERSHIP_EVENT_CATEGORIES)[number];

// Auditoría de cambios de estado de membresía, para poder calcular altas y
// bajas por mes sin tener que recorrer todo el historial de pagos.
@Schema({ timestamps: true, collection: 'gym_membership_events' })
export class GymMembershipEvent {
  @Prop({ type: Types.ObjectId, ref: 'GymUser', required: true })
  userId!: Types.ObjectId;

  // null = alta nueva (no había estado previo).
  @Prop({ type: String, enum: GYM_MEMBERSHIP_STATUSES, default: null })
  previousStatus!: GymMembershipStatus | null;

  @Prop({ type: String, required: true, enum: GYM_MEMBERSHIP_STATUSES })
  newStatus!: GymMembershipStatus;

  @Prop({ type: String, required: true, enum: GYM_MEMBERSHIP_EVENT_CATEGORIES })
  category!: GymMembershipEventCategory;

  @Prop({ type: Date, required: true, default: Date.now })
  changedAt!: Date;

  @Prop({ type: String, trim: true })
  reason?: string;
}

export const GymMembershipEventSchema = SchemaFactory.createForClass(GymMembershipEvent);
