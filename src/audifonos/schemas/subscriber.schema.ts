import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SubscriberDocument = HydratedDocument<Subscriber>;

// Guarda los emails suscriptos al newsletter de TechPRO (proyecto audifonos).
// Colección separada de 'contacts'/'airbnb_recommendations', pero en la
// misma base de datos que el resto del backend.
@Schema({ timestamps: true, collection: 'audifonos_subscribers' })
export class Subscriber {
  @Prop({ type: String, required: true, trim: true, lowercase: true, unique: true })
  email!: string;

  @Prop({ type: String })
  ip?: string;

  @Prop({ type: String })
  userAgent?: string;

  @Prop({ type: Boolean, default: false })
  notificationSent!: boolean;

  @Prop({ type: Boolean, default: false })
  confirmationSent!: boolean;
}

export const SubscriberSchema = SchemaFactory.createForClass(Subscriber);
