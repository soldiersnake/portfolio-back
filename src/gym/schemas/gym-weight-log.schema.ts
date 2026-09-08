import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type GymWeightLogDocument = HydratedDocument<GymWeightLog>;

// Historial de peso, no solo el valor actual (GymUser.currentWeight es un
// denormalizado del último valor) — permite graficar progreso en el perfil.
@Schema({ timestamps: true, collection: 'gym_weight_logs' })
export class GymWeightLog {
  @Prop({ type: Types.ObjectId, ref: 'GymUser', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0 })
  weight!: number;

  @Prop({ type: Date, required: true, default: Date.now })
  recordedAt!: Date;

  @Prop({ type: String, trim: true })
  note?: string;
}

export const GymWeightLogSchema = SchemaFactory.createForClass(GymWeightLog);
