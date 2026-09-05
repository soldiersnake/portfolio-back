import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ArquitecturaContactDocument = HydratedDocument<ArquitecturaContact>;

@Schema({ timestamps: true, collection: 'arquitectura_contacts' })
export class ArquitecturaContact {
  @Prop({ type: String, required: true, trim: true })
  nombre!: string;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  email!: string;

  @Prop({ type: String, required: true, trim: true })
  mensaje!: string;

  @Prop({ type: String, trim: true })
  telefono?: string;

  // Nombre del modelo consultado (ej. "Modelo Premier"). Ausente si la
  // consulta vino del formulario general de contacto, no de una página de
  // detalle de modelo.
  @Prop({ type: String, trim: true })
  modelo?: string;

  @Prop({ type: String })
  ip?: string;

  @Prop({ type: String })
  userAgent?: string;

  @Prop({ type: Boolean, default: false })
  notificationSent!: boolean;

  @Prop({ type: Boolean, default: false })
  autoReplySent!: boolean;
}

export const ArquitecturaContactSchema = SchemaFactory.createForClass(ArquitecturaContact);
