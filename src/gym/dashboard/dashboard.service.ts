import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { assertCenterAccess } from '../auth/centers-access.util.js';
import type { GymRequestUser } from '../auth/gym-request-user.interface.js';
import { GymCentersService } from '../centers/centers.service.js';
import { sweepExpiredMemberships, sweepFrozenMemberships } from '../common/membership-expiration.util.js';
import { GYM_MEMBERSHIP_STATUSES, GymUser, type GymUserDocument } from '../schemas/gym-user.schema.js';
import { GymCheckIn, type GymCheckInDocument } from '../schemas/gym-checkin.schema.js';
import {
  GYM_MEMBERSHIP_EVENT_CATEGORIES,
  GymMembershipEvent,
  type GymMembershipEventDocument,
} from '../schemas/gym-membership-event.schema.js';

// Franjas etarias fijas para el reparto de socios por edad (ver PLANNING.md
// sección 4, "Dashboard*"). No son configurables por ahora — si en algún
// momento hace falta ajustarlas, es el único lugar a tocar.
const AGE_BRACKETS = [
  { label: '<18', min: 0, max: 17 },
  { label: '18-25', min: 18, max: 25 },
  { label: '26-35', min: 26, max: 35 },
  { label: '36-45', min: 36, max: 45 },
  { label: '46-55', min: 46, max: 55 },
  { label: '56-65', min: 56, max: 65 },
  { label: '66+', min: 66, max: Number.POSITIVE_INFINITY },
] as const;

export interface GymDashboardMetrics {
  // 'all' = superadmin viendo todos los centros a la vez (sin filtrar).
  centerIds: string[] | 'all';
  totalActiveMembers: number;
  membersByStatus: Record<string, number>;
  // Solo cuenta socios con birthDate cargada — no todos los socios la tienen.
  ageBrackets: Record<string, number>;
  visitFrequency: {
    periodDays: number;
    totalCheckIns: number;
    uniqueVisitors: number;
    averageVisitsPerActiveMember: number;
  };
  membershipEvents: {
    month: string; // YYYY-MM
    byCategory: Record<string, number>;
    totalAltas: number;
    totalBajas: number; // baja_voluntaria + baja_impago sumadas
  };
}

// Cruza GymUser + GymCheckIn + GymMembershipEvent para las métricas del
// dashboard admin (ver PLANNING.md sección 4). Todo lo que devuelve ya viene
// acotado por centro vía resolveCenterIds — el controller no filtra nada por
// su cuenta, así no hay riesgo de que un endpoint nuevo se olvide del scoping.
@Injectable()
export class GymDashboardService {
  constructor(
    @InjectModel(GymUser.name) private readonly userModel: Model<GymUserDocument>,
    @InjectModel(GymCheckIn.name) private readonly checkInModel: Model<GymCheckInDocument>,
    @InjectModel(GymMembershipEvent.name) private readonly eventModel: Model<GymMembershipEventDocument>,
    private readonly centersService: GymCentersService,
  ) {}

  async getMetrics(
    admin: GymRequestUser,
    options: { centerId?: string; month?: string; periodDays?: number },
  ): Promise<GymDashboardMetrics> {
    const centerIds = await this.resolveCenterIds(admin, options.centerId);
    const memberFilter: Record<string, unknown> = centerIds ? { centerId: { $in: centerIds } } : {};

    // Vencimiento perezoso (Fase 2): antes de contar "socios activos" hay
    // que asegurarse de que nadie que dejó de pagar hace tiempo y no volvió
    // a pisar el gimnasio (por eso el chequeo de checkins.service.ts nunca
    // se disparó para él) siga contando como activo acá.
    await sweepFrozenMemberships(this.userModel, this.eventModel, memberFilter);
    await sweepExpiredMemberships(this.userModel, this.eventModel, memberFilter);

    const [membersByStatus, ageBrackets, visitFrequency, membershipEvents] = await Promise.all([
      this.getMembersByStatus(memberFilter),
      this.getAgeBrackets(memberFilter),
      this.getVisitFrequency(centerIds, options.periodDays ?? 30),
      this.getMembershipEvents(memberFilter, centerIds, options.month),
    ]);

    return {
      centerIds: centerIds ? centerIds.map((id) => id.toString()) : 'all',
      totalActiveMembers: membersByStatus.active ?? 0,
      membersByStatus,
      ageBrackets,
      visitFrequency,
      membershipEvents,
    };
  }

  // superadmin sin `centerId` en la query ve todo (undefined = sin filtro,
  // suma de todos los centros). admin sin `centerId` ve la suma de sus
  // propios centros (managedCenterIds) — si no administra ninguno, ve ceros
  // en vez de un error, es un estado válido. Si cualquiera de los dos pasa un
  // `centerId` puntual, se valida que exista y (si es admin) que lo
  // administre, y el resto de las métricas se acotan a ese único centro.
  private async resolveCenterIds(
    admin: GymRequestUser,
    requestedCenterId: string | undefined,
  ): Promise<Types.ObjectId[] | undefined> {
    if (requestedCenterId) {
      if (!Types.ObjectId.isValid(requestedCenterId)) {
        throw new BadRequestException('centerId must be a valid id.');
      }
      const centerId = new Types.ObjectId(requestedCenterId);
      await this.centersService.assertExists(centerId);
      assertCenterAccess(admin, centerId);
      return [centerId];
    }

    if (admin.role === 'superadmin') {
      return undefined;
    }

    return admin.managedCenterIds;
  }

  private async getMembersByStatus(memberFilter: Record<string, unknown>): Promise<Record<string, number>> {
    const counts = await Promise.all(
      GYM_MEMBERSHIP_STATUSES.map((status) =>
        this.userModel.countDocuments({ ...memberFilter, membershipStatus: status }),
      ),
    );
    return Object.fromEntries(GYM_MEMBERSHIP_STATUSES.map((status, index) => [status, counts[index]]));
  }

  // Se computa en memoria en vez de con un pipeline de agregación: la
  // cantidad de socios de un gimnasio de barrio no justifica la complejidad
  // de $bucket/$dateDiff, y así queda consistente con el resto de services de
  // este módulo (ninguno usa aggregate() todavía).
  private async getAgeBrackets(memberFilter: Record<string, unknown>): Promise<Record<string, number>> {
    const members = await this.userModel
      .find({ ...memberFilter, birthDate: { $exists: true, $ne: null } })
      .select('birthDate')
      .lean();

    const buckets = Object.fromEntries(AGE_BRACKETS.map((bracket) => [bracket.label, 0])) as Record<string, number>;
    const now = Date.now();

    for (const member of members) {
      const birthDate = member.birthDate as Date;
      const ageYears = Math.floor((now - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      const bracket = AGE_BRACKETS.find((b) => ageYears >= b.min && ageYears <= b.max);
      if (bracket) {
        buckets[bracket.label] += 1;
      }
    }

    return buckets;
  }

  private async getVisitFrequency(
    centerIds: Types.ObjectId[] | undefined,
    periodDays: number,
  ): Promise<GymDashboardMetrics['visitFrequency']> {
    if (!Number.isInteger(periodDays) || periodDays <= 0) {
      throw new BadRequestException('periodDays must be a positive integer.');
    }

    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
    const checkInFilter = {
      checkedInAt: { $gte: since },
      ...(centerIds ? { centerId: { $in: centerIds } } : {}),
    };

    const [totalCheckIns, distinctVisitors, totalActiveMembers] = await Promise.all([
      this.checkInModel.countDocuments(checkInFilter),
      this.checkInModel.distinct('userId', checkInFilter),
      this.userModel.countDocuments({
        membershipStatus: 'active',
        ...(centerIds ? { centerId: { $in: centerIds } } : {}),
      }),
    ]);

    return {
      periodDays,
      totalCheckIns,
      uniqueVisitors: distinctVisitors.length,
      averageVisitsPerActiveMember:
        totalActiveMembers > 0 ? Number((totalCheckIns / totalActiveMembers).toFixed(2)) : 0,
    };
  }

  private async getMembershipEvents(
    memberFilter: Record<string, unknown>,
    centerIds: Types.ObjectId[] | undefined,
    monthRaw: string | undefined,
  ): Promise<GymDashboardMetrics['membershipEvents']> {
    const { start, end, label } = this.resolveMonthRange(monthRaw);

    // GymMembershipEvent no tiene centerId propio (ver PLANNING.md sección
    // 2.9) — para acotar por centro hay que resolver primero qué socios
    // pertenecen a esos centros y filtrar los eventos por userId.
    let userIdFilter: Types.ObjectId[] | undefined;
    if (centerIds) {
      userIdFilter = (await this.userModel.find(memberFilter).distinct('_id')) as unknown as Types.ObjectId[];
    }

    const baseFilter = {
      changedAt: { $gte: start, $lt: end },
      ...(userIdFilter ? { userId: { $in: userIdFilter } } : {}),
    };

    const counts = await Promise.all(
      GYM_MEMBERSHIP_EVENT_CATEGORIES.map((category) => this.eventModel.countDocuments({ ...baseFilter, category })),
    );
    const byCategory = Object.fromEntries(
      GYM_MEMBERSHIP_EVENT_CATEGORIES.map((category, index) => [category, counts[index]]),
    ) as Record<string, number>;

    return {
      month: label,
      byCategory,
      totalAltas: byCategory.alta ?? 0,
      totalBajas: (byCategory.baja_voluntaria ?? 0) + (byCategory.baja_impago ?? 0),
    };
  }

  // Acepta "YYYY-MM"; sin valor, usa el mes calendario actual (UTC).
  private resolveMonthRange(monthRaw: string | undefined): { start: Date; end: Date; label: string } {
    const now = new Date();
    let year = now.getUTCFullYear();
    let month = now.getUTCMonth(); // 0-indexed

    if (monthRaw) {
      const match = /^(\d{4})-(\d{2})$/.exec(monthRaw);
      if (!match) {
        throw new BadRequestException('month must be in YYYY-MM format.');
      }
      year = Number(match[1]);
      month = Number(match[2]) - 1;
      if (month < 0 || month > 11) {
        throw new BadRequestException('month must be in YYYY-MM format.');
      }
    }

    const start = new Date(Date.UTC(year, month, 1));
    const end = new Date(Date.UTC(year, month + 1, 1));
    const label = `${year}-${String(month + 1).padStart(2, '0')}`;
    return { start, end, label };
  }
}
