import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type GymPaymentSettingsDocument = HydratedDocument<GymPaymentSettings>;

// Colección singleton (un solo documento, ver GymPaymentsService.getSettings)
// para políticas de negocio sobre pagos que un superadmin puede cambiar en
// caliente — a diferencia de stripeEnabled/mercadopagoEnabled
// (GYM_STRIPE_ENABLED/GYM_MERCADOPAGO_ENABLED), que son env vars y requieren
// redeploy, este flag vive en Mongo porque es una decisión de negocio del
// gimnasio, no de infraestructura.
@Schema({ timestamps: true, collection: 'gym_payment_settings' })
export class GymPaymentSettings {
  // Si un admin (no superadmin) puede registrar pagos manuales (efectivo,
  // transferencia, etc.) desde la ficha de un socio. Algunos gimnasios no
  // quieren que la recepción maneje efectivo — lo decide el superadmin.
  // Un superadmin siempre puede registrar pagos manuales,
  // independientemente de este flag.
  @Prop({ type: Boolean, default: true })
  allowAdminManualPayments!: boolean;
}

export const GymPaymentSettingsSchema = SchemaFactory.createForClass(GymPaymentSettings);
