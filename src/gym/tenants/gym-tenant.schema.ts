import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type GymTenantDocument = HydratedDocument<GymTenant>;

export const GYM_TENANT_STATUSES = ['trial', 'active', 'suspended', 'cancelled'] as const;
export type GymTenantStatus = (typeof GYM_TENANT_STATUSES)[number];

@Schema({ _id: false })
export class GymTenantBranding {
  // Colores en hex (#RRGGBB). Si faltan, el frontend usa los de GymBro.
  @Prop({ type: String })
  primaryColor?: string;

  @Prop({ type: String })
  secondaryColor?: string;

  @Prop({ type: String })
  logoUrl?: string;

  @Prop({ type: String })
  faviconUrl?: string;
}

@Schema({ _id: false })
export class GymTenantLegal {
  // Responsable del tratamiento (el gimnasio, no la plataforma) — se muestra
  // en la política de privacidad del socio. Ver Fase C del roadmap.
  @Prop({ type: String })
  controllerName?: string;

  @Prop({ type: String })
  controllerTaxId?: string;

  @Prop({ type: String })
  controllerEmail?: string;

  // Versión vigente de la política/términos. Subirla obliga a todos los
  // socios a volver a aceptar en el próximo login.
  @Prop({ type: String, default: '1' })
  privacyPolicyVersion!: string;

  @Prop({ type: String })
  privacyPolicyText?: string;

  @Prop({ type: String })
  termsText?: string;
}

@Schema({ _id: false })
export class GymTenantStripe {
  // ID de la cuenta conectada de Stripe Connect del gimnasio (acct_...).
  // No es un secreto: con esto la plataforma crea cobros *sobre* la cuenta
  // del gimnasio (header Stripe-Account). Ver Fase B del roadmap.
  @Prop({ type: String })
  accountId?: string;

  @Prop({ type: Boolean, default: false })
  chargesEnabled!: boolean;

  @Prop({ type: Boolean, default: false })
  detailsSubmitted!: boolean;

  // 'test' | 'live' — las cuentas conectadas de test no pasan a live; al
  // salir a producción cada gimnasio repite el onboarding.
  @Prop({ type: String, enum: ['test', 'live'] })
  mode?: 'test' | 'live';
}

// Directorio de gimnasios de la plataforma (base `gymbro_platform`). Un
// documento por gimnasio; sus datos operativos viven en la base `dbName`.
@Schema({ timestamps: true, collection: 'tenants' })
export class GymTenant {
  // Subdominio: okinawa → okinawa.gymbro.es. Solo minúsculas, números y guiones.
  @Prop({ type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9-]{2,40}$/ })
  slug!: string;

  @Prop({ type: String, required: true, trim: true })
  name!: string;

  // Nombre de la base de datos del gimnasio en el cluster (por defecto = slug).
  @Prop({ type: String, required: true, unique: true, trim: true, match: /^[a-zA-Z0-9_-]{2,40}$/ })
  dbName!: string;

  @Prop({ type: String, enum: GYM_TENANT_STATUSES, default: 'trial', required: true })
  status!: GymTenantStatus;

  @Prop({ type: Date })
  trialEndsAt?: Date;

  @Prop({ type: GymTenantBranding, default: {} })
  branding!: GymTenantBranding;

  @Prop({ type: GymTenantLegal, default: {} })
  legal!: GymTenantLegal;

  @Prop({ type: GymTenantStripe, default: {} })
  stripe!: GymTenantStripe;
}

export const GymTenantSchema = SchemaFactory.createForClass(GymTenant);
