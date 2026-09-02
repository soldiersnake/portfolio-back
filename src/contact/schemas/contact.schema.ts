import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ContactDocument = HydratedDocument<Contact>;

@Schema({ timestamps: true, collection: 'contacts' })
export class Contact {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  email!: string;

  @Prop({ type: String, required: true, trim: true })
  subject!: string;

  @Prop({ type: String, required: true, trim: true })
  message!: string;

  @Prop({ type: String })
  ip?: string;

  @Prop({ type: String })
  userAgent?: string;

  @Prop({ type: Boolean, default: false })
  autoReplySent!: boolean;

  @Prop({ type: Boolean, default: false })
  notificationSent!: boolean;
}

export const ContactSchema = SchemaFactory.createForClass(Contact);
