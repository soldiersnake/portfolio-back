import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type GymMembershipPlanDocument = HydratedDocument<GymMembershipPlan>;

export const GYM_BILLING_CYCLES = ['mensual', 'trimestral', 'anual'] as const;
export type GymBillingCycle = (typeof GYM_BILLING_CYCLES)[number];

@Schema({ timestamps: true, collection: 'gym_membership_plans' })
export class GymMembershipPlan {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, trim: true })
  description?: string;

  @Prop({ type: Number, required: true, min: 0 })
  price!: number;

  @Prop({ type: String, required: true, default: 'EUR' })
  currency!: string;

  @Prop({ type: String, required: true, enum: GYM_BILLING_CYCLES })
  billingCycle!: GymBillingCycle;

  @Prop({ type: Boolean, default: false })
  includesPool!: boolean;

  @Prop({ type: Boolean, default: false })
  includesSpa!: boolean;

  // null = ilimitado.
  @Prop({ type: Number, default: null })
  classCreditsPerMonth!: number | null;

  @Prop({ type: [Types.ObjectId], ref: 'GymCenter', default: [] })
  centerIds!: Types.ObjectId[];

  @Prop({ type: Boolean, default: true })
  isActive!: boolean;
}

export const GymMembershipPlanSchema = SchemaFactory.createForClass(GymMembershipPlan);
