import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type GymUserDocument = HydratedDocument<GymUser>;

// `recepcion`: rol intermedio pensado para personal de recepción que solo
// necesita registrar accesos (escaneo de QR o búsqueda manual, ver
// GymCheckInsController) — sin acceso al resto del panel admin
// (configuración, pagos, fichas completas de socios, etc.). Se comporta como
// `admin` a los efectos de scoping por centro (managedCenterIds,
// assertCenterAccess) pero con muchos menos permisos (ver RolesGuard en cada
// controller para el detalle de qué rutas lo incluyen).
export const GYM_ROLES = ['member', 'admin', 'superadmin', 'recepcion'] as const;
export type GymRole = (typeof GYM_ROLES)[number];

export const GYM_GOALS = ['perder_peso', 'ganar_masa', 'mantenimiento', 'rendimiento', 'otro'] as const;
export type GymGoal = (typeof GYM_GOALS)[number];

// `staff`: membresía sin cargo, otorgada (y revocable) exclusivamente por un
// superadmin — pensada para admins/recepción que también entrenan pero no
// tienen por qué pagar. Se comporta como `active` a todos los efectos de
// acceso (checkins, reserva de clases) pero nunca vence sola (no entra en
// EXPIRABLE_STATUSES de membership-expiration.util.ts) y no se puede setear
// ni quitar salvo por un superadmin (ver MembershipsService.updateMemberStatus).
export const GYM_MEMBERSHIP_STATUSES = ['active', 'expired', 'frozen', 'pending_payment', 'cancelled', 'staff'] as const;
export type GymMembershipStatus = (typeof GYM_MEMBERSHIP_STATUSES)[number];

export const GYM_PAYMENT_METHODS = ['stripe', 'mercadopago', 'manual'] as const;
export type GymPaymentMethod = (typeof GYM_PAYMENT_METHODS)[number];

// De dónde vino el alta: autoregistro desde la app, o cargado a mano por un
// admin/recepción (ver GymUsersService.createByAdmin). No afecta permisos,
// es solo trazabilidad — ver PLANNING.md sección 2.1 y 3.
export const GYM_REGISTRATION_SOURCES = ['self', 'admin'] as const;
export type GymRegistrationSource = (typeof GYM_REGISTRATION_SOURCES)[number];

// `pending_invite`: el admin creó la cuenta pero el socio todavía no fijó
// contraseña ni vinculó Google — igual puede usar su QR para entrar al
// gimnasio (ver `qrCodeToken`), solo no puede loguearse en la app todavía.
export const GYM_ACCOUNT_STATUSES = ['pending_invite', 'active'] as const;
export type GymAccountStatus = (typeof GYM_ACCOUNT_STATUSES)[number];

@Schema()
export class GymEmergencyContact {
  @Prop({ type: String, trim: true })
  name?: string;

  @Prop({ type: String, trim: true })
  phone?: string;
}

@Schema({ _id: false })
export class GymPushSubscription {
  @Prop({ type: String, required: true })
  endpoint!: string;

  @Prop({ type: Object, required: true })
  keys!: { p256dh: string; auth: string };
}

// Auth + perfil del socio en una sola colección; el rol determina permisos.
// A diferencia del auth stateless de tienda-mueble (un solo admin
// hardcodeado por email, sin tabla de usuarios), acá hace falta persistir
// usuarios reales porque puede haber muchos socios y varios admins.
@Schema({ timestamps: true, collection: 'gym_users' })
export class GymUser {
  @Prop({ type: String, required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  // Opcional: puede no existir si el usuario solo entra con Google/Apple.
  @Prop({ type: String, select: false })
  passwordHash?: string;

  @Prop({ type: String })
  googleId?: string;

  // Reservado desde ya — no se completa hasta implementar Sign in with
  // Apple (Mariano todavía no tiene cuenta de Apple Developer). Ver
  // PLANNING.md sección 3, "Sobre Apple Sign In".
  @Prop({ type: String })
  appleId?: string;

  @Prop({ type: String, enum: GYM_ROLES, default: 'member', required: true })
  role!: GymRole;

  // Solo aplica si role = 'admin'. Se ignora para 'superadmin' (acceso
  // global) y 'member'. Enforced por un guard de scoping cuando exista el
  // módulo de centers (ver PLANNING.md sección 3).
  @Prop({ type: [Types.ObjectId], ref: 'GymCenter', default: [] })
  managedCenterIds!: Types.ObjectId[];

  // Token opaco (no el _id, para no exponerlo) codificado en el QR del
  // carnet digital. Se genera en el alta (autoregistro o manual) sin
  // depender de que el socio complete el login en la app.
  @Prop({ type: String, required: true, unique: true })
  qrCodeToken!: string;

  @Prop({ type: String, required: true, enum: GYM_REGISTRATION_SOURCES, default: 'self' })
  registrationSource!: GymRegistrationSource;

  // Admin que hizo el alta manual — vacío si registrationSource = 'self'.
  @Prop({ type: Types.ObjectId, ref: 'GymUser' })
  createdByUserId?: Types.ObjectId;

  @Prop({ type: String, required: true, enum: GYM_ACCOUNT_STATUSES, default: 'active' })
  accountStatus!: GymAccountStatus;

  // Solo se usan mientras accountStatus = 'pending_invite'.
  @Prop({ type: String, select: false })
  inviteToken?: string;

  @Prop({ type: Date, select: false })
  inviteTokenExpiresAt?: Date;

  @Prop({ type: Date })
  invitedAt?: Date;

  @Prop({ type: Date })
  inviteAcceptedAt?: Date;

  @Prop({ type: String, required: true, trim: true })
  firstName!: string;

  @Prop({ type: String, required: true, trim: true })
  lastName!: string;

  @Prop({ type: String })
  photoUrl?: string;

  @Prop({ type: Date })
  birthDate?: Date;

  @Prop({ type: String, trim: true })
  phone?: string;

  @Prop({ type: GymEmergencyContact })
  emergencyContact?: GymEmergencyContact;

  @Prop({ type: Number, min: 0 })
  height?: number;

  // Último valor conocido, denormalizado para lecturas rápidas de perfil —
  // el historial completo vive en GymWeightLog.
  @Prop({ type: Number, min: 0 })
  currentWeight?: number;

  @Prop({ type: String, enum: GYM_GOALS })
  goal?: GymGoal;

  @Prop({ type: Types.ObjectId, ref: 'GymMembershipPlan' })
  membershipPlanId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'GymCenter' })
  centerId?: Types.ObjectId;

  @Prop({ type: String, enum: GYM_MEMBERSHIP_STATUSES, default: 'pending_payment', required: true })
  membershipStatus!: GymMembershipStatus;

  @Prop({ type: Date })
  membershipStartDate?: Date;

  @Prop({ type: Date })
  membershipEndDate?: Date;

  // Congelamiento self-service (Fase 4, ver GymMembershipsService.freezeOwnMembership):
  // solo se completa mientras membershipStatus = 'frozen'. Al congelar se
  // extiende membershipEndDate por la misma cantidad de semanas, así el
  // tiempo congelado no cuenta como parte del período pago. freezeEndsAt es
  // lo que dispara la reactivación perezosa (mismo patrón que el vencimiento
  // automático, ver common/membership-expiration.util.ts) — no hay cron, se
  // recalcula en los mismos puntos de interacción (check-in, perfil propio,
  // dashboard).
  @Prop({ type: Date })
  freezeEndsAt?: Date;

  // Marca de idempotencia del recordatorio de "próximo a vencer" (ver
  // GymRemindersService.sendExpiringSoonReminders, disparado por la GitHub
  // Action diaria) — sin esto, si el workflow corre más de una vez el mismo
  // día (reintento manual, doble trigger) el socio recibiría el mismo mail
  // repetido. Se resetea solo indirectamente: al renovar/pagar la
  // membershipEndDate se corre para adelante y el socio vuelve a estar fuera
  // de la ventana de EXPIRING_SOON_DAYS hasta la próxima vez que se acerque.
  @Prop({ type: Date })
  lastExpirationReminderSentAt?: Date;

  // Última vez que el socio cambió a un plan distinto del que tenía (no se
  // toca al renovar el mismo plan). Solo lo actualiza un cambio de plan
  // real dentro de GymPaymentsService.markPaymentPaid, sin importar quién
  // disparó el pago — pero el límite de "una vez por mes" que lo usa solo
  // se valida en el checkout propio del socio (resolvePlanForCheckout), no
  // cuando lo carga un admin (ver recordManualPayment).
  @Prop({ type: Date })
  lastPlanChangeAt?: Date;

  @Prop({ type: String, enum: GYM_PAYMENT_METHODS })
  preferredPaymentMethod?: GymPaymentMethod;

  @Prop({ type: [GymPushSubscription], default: [] })
  pushSubscriptions!: GymPushSubscription[];

  // Soft-delete de cuenta.
  @Prop({ type: Boolean, default: true })
  isActive!: boolean;

  // Trazabilidad de "sistema de referidos" (Fase 4, ver PLANNING.md sección
  // 5): quién compartió el link de invitación que trajo a este socio. Solo
  // se completa en autoregistro (registrationSource = 'self') vía
  // /gym/auth/register?ref=<userId> o el flujo de Google equivalente — un
  // alta manual por admin no pasa por acá. No implica ninguna recompensa
  // todavía, es solo el dato base para poder sumarla más adelante sin
  // tener que migrar nada retroactivamente.
  @Prop({ type: Types.ObjectId, ref: 'GymUser' })
  referredByUserId?: Types.ObjectId;
}

export const GymUserSchema = SchemaFactory.createForClass(GymUser);
