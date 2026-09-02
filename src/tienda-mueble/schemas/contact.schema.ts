import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TiendaMuebleContactDocument = HydratedDocument<TiendaMuebleContact>;

// El formulario original (contacto.html) tiene bastantes más campos que el
// de /contact del portfolio (teléfono, país, tipo cliente/proveedor,
// categoría de interés), así que este va con su propio schema en vez de
// reutilizar el de ContactModule.
@Schema({ timestamps: true, collection: 'tienda_mueble_contacts' })
export class TiendaMuebleContact {
  @Prop({ type: String, required: true, trim: true })
  nombre!: string;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  email!: string;

  @Prop({ type: String, required: true, trim: true })
  asunto!: string;

  @Prop({ type: String, required: true, trim: true })
  mensaje!: string;

  @Prop({ type: String, trim: true })
  telefono?: string;

  @Prop({ type: String, trim: true })
  pais?: string;

  @Prop({ type: String, trim: true })
  tipo?: string;

  @Prop({ type: String, trim: true })
  categoria?: string;

  @Prop({ type: String })
  ip?: string;

  @Prop({ type: String })
  userAgent?: string;

  @Prop({ type: Boolean, default: false })
  notificationSent!: boolean;

  @Prop({ type: Boolean, default: false })
  autoReplySent!: boolean;
}

export const TiendaMuebleContactSchema = SchemaFactory.createForClass(TiendaMuebleContact);
