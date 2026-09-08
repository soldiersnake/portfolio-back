import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type GymCenterDocument = HydratedDocument<GymCenter>;

export const GYM_CENTER_AMENITIES = ['pileta', 'spa', 'estacionamiento', 'lockers'] as const;
export type GymCenterAmenity = (typeof GYM_CENTER_AMENITIES)[number];

@Schema({ _id: false })
export class GymCenterScheduleSlot {
  // 0 = domingo ... 6 = sábado (igual que Date#getDay()).
  @Prop({ type: Number, required: true, min: 0, max: 6 })
  day!: number;

  @Prop({ type: String, required: true })
  openTime!: string;

  @Prop({ type: String, required: true })
  closeTime!: string;
}

// Para el MVP se arranca con 3 centros hardcodeados (seed script) en vez de
// construir ya la pantalla de gestión de sedes — el modelo ya soporta N
// centros, así que más adelante alcanza con habilitar el CRUD (solo
// superadmin) sin tocar el resto del esquema. Ver PLANNING.md sección 2.3.
@Schema({ timestamps: true, collection: 'gym_centers' })
export class GymCenter {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, trim: true })
  address?: string;

  @Prop({ type: String, trim: true })
  city?: string;

  @Prop({ type: String, trim: true })
  phone?: string;

  @Prop({ type: String, trim: true, lowercase: true })
  email?: string;

  @Prop({ type: [GymCenterScheduleSlot], default: [] })
  schedule!: GymCenterScheduleSlot[];

  @Prop({ type: [String], enum: GYM_CENTER_AMENITIES, default: [] })
  amenities!: GymCenterAmenity[];

  @Prop({ type: [String], default: [] })
  photos!: string[];

  // Link de Google Maps (ej. "compartir ubicación" desde la app de Maps) para
  // que el socio pueda ubicar la sede con un tap — no se valida formato acá
  // a propósito (el admin puede pegar tanto un link corto goo.gl/maps como
  // uno largo con coordenadas, ambos funcionan igual como <a href>).
  @Prop({ type: String, trim: true })
  googleMapsUrl?: string;

  @Prop({ type: Boolean, default: true })
  isActive!: boolean;
}

export const GymCenterSchema = SchemaFactory.createForClass(GymCenter);
