import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type GymClassDocument = HydratedDocument<GymClass>;

@Schema({ _id: false })
export class GymClassSchedule {
  // 0 = domingo ... 6 = sábado.
  @Prop({ type: Number, required: true, min: 0, max: 6 })
  day!: number;

  @Prop({ type: String, required: true })
  startTime!: string;

  @Prop({ type: String, required: true })
  endTime!: string;
}

// Definición + horario recurrente de una clase (ej. "Spinning", "Aquagym").
// La reserva de un turno puntual vive en GymClassBooking. El cupo y la
// lista de espera se implementan en Fase 3 (ver PLANNING.md Roadmap).
@Schema({ timestamps: true, collection: 'gym_classes' })
export class GymClass {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: Types.ObjectId, ref: 'GymCenter', required: true })
  centerId!: Types.ObjectId;

  @Prop({ type: String, trim: true })
  instructorName?: string;

  @Prop({ type: Number, required: true, min: 1 })
  capacity!: number;

  @Prop({ type: GymClassSchedule, required: true })
  schedule!: GymClassSchedule;

  // Ej. solo planes con pileta pueden reservar "Aquagym" — se valida contra
  // GymMembershipPlan.includesPool / includesSpa del socio.
  @Prop({ type: String })
  requiresPlanFeature?: string;

  @Prop({ type: Boolean, default: true })
  isActive!: boolean;

  // Foto ilustrativa de la clase (ej. una spinning bike, la pileta para
  // Aquagym), subida vía POST :id/photo — ver GymImageKitService.uploadClassImage
  // y GymClassesService.updateClassImage. Opcional: sin foto, el frontend
  // muestra un ícono genérico según el nombre de la clase.
  @Prop({ type: String })
  imageUrl?: string;
}

export const GymClassSchema = SchemaFactory.createForClass(GymClass);
