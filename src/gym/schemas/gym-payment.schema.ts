import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { GYM_PAYMENT_METHODS, type GymPaymentMethod } from './gym-user.schema.js';

export type GymPaymentDocument = HydratedDocument<GymPayment>;

export const GYM_PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'] as const;
export type GymPaymentStatus = (typeof GYM_PAYMENT_STATUSES)[number];

// Activación de Stripe/Mercado Pago vía flags de entorno (GYM_STRIPE_ENABLED,
// GYM_MERCADOPAGO_ENABLED), mismo patrón ya validado en tienda-mueble. La
// integración real de ambos proveedores es Fase 2 (ver PLANNING.md Roadmap)
// — este schema ya queda listo para que 'manual' conviva con ellos.
@Schema({ timestamps: true, collection: 'gym_payments' })
export class GymPayment {
  @Prop({ type: Types.ObjectId, ref: 'GymUser', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'GymMembershipPlan', required: true })
  membershipPlanId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: GYM_PAYMENT_METHODS })
  provider!: GymPaymentMethod;

  @Prop({ type: String })
  providerPaymentId?: string;

  @Prop({ type: Number, required: true, min: 0 })
  amount!: number;

  @Prop({ type: String, required: true, default: 'EUR' })
  currency!: string;

  @Prop({ type: String, required: true, enum: GYM_PAYMENT_STATUSES, default: 'pending' })
  status!: GymPaymentStatus;

  @Prop({ type: Date })
  periodStart?: Date;

  @Prop({ type: Date })
  periodEnd?: Date;

  // Solo se setea cuando provider = 'manual' (ver
  // GymPaymentsService.recordManualPayment) — qué admin/superadmin cobró el
  // pago en efectivo/transferencia. Sirve tanto para el comprobante ("cobrado
  // por X") como para notificar a los superadmins por email. No aplica a
  // Stripe/Mercado Pago: ahí el pago lo hace el propio socio.
  @Prop({ type: Types.ObjectId, ref: 'GymUser' })
  processedByUserId?: Types.ObjectId;
}

export const GymPaymentSchema = SchemaFactory.createForClass(GymPayment);
