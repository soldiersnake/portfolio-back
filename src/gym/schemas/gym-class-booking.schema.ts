import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type GymClassBookingDocument = HydratedDocument<GymClassBooking>;

export const GYM_CLASS_BOOKING_STATUSES = ['booked', 'waitlisted', 'cancelled', 'attended'] as const;
export type GymClassBookingStatus = (typeof GYM_CLASS_BOOKING_STATUSES)[number];

@Schema({ timestamps: true, collection: 'gym_class_bookings' })
export class GymClassBooking {
  @Prop({ type: Types.ObjectId, ref: 'GymClass', required: true })
  classId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'GymUser', required: true })
  userId!: Types.ObjectId;

  // Fecha concreta de la clase reservada (GymClass define el horario
  // recurrente, esto es una ocurrencia puntual de ese horario).
  @Prop({ type: Date, required: true })
  sessionDate!: Date;

  @Prop({ type: String, required: true, enum: GYM_CLASS_BOOKING_STATUSES, default: 'booked' })
  status!: GymClassBookingStatus;
}

export const GymClassBookingSchema = SchemaFactory.createForClass(GymClassBooking);
