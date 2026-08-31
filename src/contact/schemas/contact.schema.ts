import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ContactDocument = HydratedDocument<Contact>;

@Schema({ timestamps: true, collection: 'contacts' })
export class Contact {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true, lowercase: true })
  email!: string;

  @Prop({ required: true, trim: true })
  subject!: string;

  @Prop({ required: true, trim: true })
  message!: string;

  @Prop()
  ip?: string;

  @Prop()
  userAgent?: string;

  @Prop({ default: false })
  autoReplySent!: boolean;

  @Prop({ default: false })
  notificationSent!: boolean;
}

export const ContactSchema = SchemaFactory.createForClass(Contact);
