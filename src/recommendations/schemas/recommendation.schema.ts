import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RecommendationDocument = HydratedDocument<Recommendation>;

// Guarda las recomendaciones que dejan los huéspedes del piso de Airbnb.
// Colección separada de 'contacts' (portfolio), pero en la misma base de datos.
@Schema({ timestamps: true, collection: 'airbnb_recommendations' })
export class Recommendation {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  email!: string;

  @Prop({ type: String, required: true, trim: true })
  message!: string;

  @Prop({ type: String })
  ip?: string;

  @Prop({ type: String })
  userAgent?: string;

  @Prop({ type: Boolean, default: false })
  notificationSent!: boolean;
}

export const RecommendationSchema = SchemaFactory.createForClass(Recommendation);
