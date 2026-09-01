import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RecommendationDocument = HydratedDocument<Recommendation>;

// Guarda las recomendaciones que dejan los huéspedes del piso de Airbnb.
// Colección separada de 'contacts' (portfolio), pero en la misma base de datos.
@Schema({ timestamps: true, collection: 'airbnb_recommendations' })
export class Recommendation {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true, lowercase: true })
  email!: string;

  @Prop({ required: true, trim: true })
  message!: string;

  @Prop()
  ip?: string;

  @Prop()
  userAgent?: string;

  @Prop({ default: false })
  notificationSent!: boolean;
}

export const RecommendationSchema = SchemaFactory.createForClass(Recommendation);
