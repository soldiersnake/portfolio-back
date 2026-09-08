import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { GYM_MEMBERSHIP_STATUSES, type GymMembershipStatus } from './gym-user.schema.js';

export type GymCheckInDocument = HydratedDocument<GymCheckIn>;

// qr_scan_app: admin/recepción escanea el QR del socio con la cámara del
// celu/tablet, dentro de la propia app (sin hardware). manual: el admin
// carga el ingreso a mano. turnstile: reservado para una integración futura
// con un molinete/lector físico real (depende del equipo que se compre, no
// se modela en detalle todavía — ver PLANNING.md sección 3).
export const GYM_CHECKIN_METHODS = ['qr_scan_app', 'manual', 'turnstile'] as const;
export type GymCheckInMethod = (typeof GYM_CHECKIN_METHODS)[number];

// Registro de accesos al centro — es la base tanto del control de acceso
// (QR) como de la métrica de "frecuencia de visita" del dashboard admin.
@Schema({ timestamps: true, collection: 'gym_checkins' })
export class GymCheckIn {
  @Prop({ type: Types.ObjectId, ref: 'GymUser', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'GymCenter', required: true })
  centerId!: Types.ObjectId;

  @Prop({ type: Date, required: true, default: Date.now })
  checkedInAt!: Date;

  @Prop({ type: String, required: true, enum: GYM_CHECKIN_METHODS })
  method!: GymCheckInMethod;

  // Admin/recepción que hizo el escaneo o la carga manual — vacío si algún
  // día es 'turnstile' automático.
  @Prop({ type: Types.ObjectId, ref: 'GymUser' })
  scannedByUserId?: Types.ObjectId;

  // Snapshot del estado de membresía en el momento del check-in (no se
  // recalcula después, para que el historial no cambie retroactivamente).
  @Prop({ type: String, required: true, enum: GYM_MEMBERSHIP_STATUSES })
  membershipStatusAtCheckIn!: GymMembershipStatus;

  // Si se permitió el ingreso o no (ej. false si la membresía estaba
  // vencida al momento del escaneo).
  @Prop({ type: Boolean, required: true })
  accessGranted!: boolean;
}

export const GymCheckInSchema = SchemaFactory.createForClass(GymCheckIn);
