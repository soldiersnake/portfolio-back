import type { Model } from 'mongoose';
import type { GymMembershipEventDocument } from '../schemas/gym-membership-event.schema.js';
import type { GymMembershipStatus, GymUserDocument } from '../schemas/gym-user.schema.js';

// Estados desde los que una membresía puede "vencerse sola" si pasa
// membershipEndDate sin un pago nuevo. `frozen`/`cancelled` no vencen por
// esta vía: un socio congelado o ya dado de baja no vuelve a `expired`
// automáticamente, eso requiere una acción explícita de un admin.
const EXPIRABLE_STATUSES: GymMembershipStatus[] = ['active', 'pending_payment'];

// Vencimiento automático de membresías (Fase 2, ver PLANNING.md sección 2.9
// y 5: "cálculo automático de vencimiento a partir del pago"). Decisión de
// diseño: en vez de un cron job (@nestjs/schedule), que dependería de que el
// server esté despierto — el backend compartido en Render duerme sin
// tráfico, ver memoria reference_web_infra — el vencimiento se recalcula de
// forma perezosa en los dos lugares donde importa que el dato esté al día:
// GymCheckInsService (antes de decidir accessGranted) y GymDashboardService
// (antes de contar socios por estado). Si en el futuro se necesita que el
// estado cambie sin que nadie interactúe con la app, ahí sí conviene sumar
// un cron real.
export async function expireMembershipIfNeeded(
  eventModel: Model<GymMembershipEventDocument>,
  member: GymUserDocument,
): Promise<GymUserDocument> {
  if (!isPastDue(member)) {
    return member;
  }

  const previousStatus = member.membershipStatus;
  member.membershipStatus = 'expired';
  await member.save();

  await eventModel.create({
    userId: member._id,
    previousStatus,
    newStatus: 'expired',
    category: 'baja_impago',
    reason: 'Vencimiento automático: la membresía venció sin un pago nuevo (membershipEndDate superada).',
  });

  return member;
}

// Versión en lote, usada por el dashboard para que "socios activos" no
// incluya gente que dejó de pagar hace tiempo y simplemente no volvió a
// pisar el gimnasio (así nunca disparó el chequeo perezoso de check-ins).
export async function sweepExpiredMemberships(
  userModel: Model<GymUserDocument>,
  eventModel: Model<GymMembershipEventDocument>,
  filter: Record<string, unknown> = {},
): Promise<number> {
  const stale = await userModel.find({
    ...filter,
    membershipStatus: { $in: EXPIRABLE_STATUSES },
    membershipEndDate: { $lt: new Date() },
  });

  for (const member of stale) {
    await expireMembershipIfNeeded(eventModel, member);
  }

  return stale.length;
}

function isPastDue(member: GymUserDocument): boolean {
  return (
    EXPIRABLE_STATUSES.includes(member.membershipStatus) &&
    Boolean(member.membershipEndDate) &&
    (member.membershipEndDate as Date).getTime() < Date.now()
  );
}

// Reactivación automática al terminar un congelamiento self-service (ver
// GymMembershipsService.freezeOwnMembership). Mismo criterio de "chequeo
// perezoso" que expireMembershipIfNeeded: sin cron, se recalcula en los
// mismos puntos de interacción (check-ins, perfil propio, dashboard) — y
// SIEMPRE antes de expireMembershipIfNeeded en cada uno de esos lugares, para
// que un socio recién reactivado pueda, en el mismo request, terminar
// venciendo si membershipEndDate quedó igual en el pasado (caso raro, pero
// posible si el freeze se hizo con la fecha ya vencida a mano en Mongo).
export async function reactivateFrozenMembershipIfNeeded(
  eventModel: Model<GymMembershipEventDocument>,
  member: GymUserDocument,
): Promise<GymUserDocument> {
  if (member.membershipStatus !== 'frozen' || !member.freezeEndsAt || member.freezeEndsAt.getTime() > Date.now()) {
    return member;
  }

  member.membershipStatus = 'active';
  member.freezeEndsAt = undefined;
  await member.save();

  await eventModel.create({
    userId: member._id,
    previousStatus: 'frozen',
    newStatus: 'active',
    category: 'reactivacion',
    reason: 'Fin del congelamiento: reactivación automática.',
  });

  return member;
}

// Versión en lote para el dashboard — mismo motivo que sweepExpiredMemberships:
// si un socio congelado no vuelve a pisar el gimnasio ni abre "Mi membresía"
// después de que termina su congelamiento, "socios activos" no debería
// seguir excluyéndolo indefinidamente.
export async function sweepFrozenMemberships(
  userModel: Model<GymUserDocument>,
  eventModel: Model<GymMembershipEventDocument>,
  filter: Record<string, unknown> = {},
): Promise<number> {
  const stale = await userModel.find({
    ...filter,
    membershipStatus: 'frozen',
    freezeEndsAt: { $lt: new Date() },
  });

  for (const member of stale) {
    await reactivateFrozenMembershipIfNeeded(eventModel, member);
  }

  return stale.length;
}
