import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { assertCenterAccess } from '../auth/centers-access.util.js';
import type { GymRequestUser } from '../auth/gym-request-user.interface.js';
import { GymCentersService } from '../centers/centers.service.js';
import { reactivateFrozenMembershipIfNeeded } from '../common/membership-expiration.util.js';
import {
  GymMembershipEvent,
  type GymMembershipEventDocument,
} from '../schemas/gym-membership-event.schema.js';
import { GymMembershipPlan, type GymMembershipPlanDocument } from '../schemas/gym-membership-plan.schema.js';
import { GymUser, type GymUserDocument } from '../schemas/gym-user.schema.js';
import type { CreateGymMembershipPlanDto } from './dto/create-plan.dto.js';
import type { UpdateGymMembershipPlanDto } from './dto/update-plan.dto.js';
import type { UpdateGymMembershipStatusDto } from './dto/update-membership-status.dto.js';
import type { FreezeGymMembershipDto } from './dto/freeze-membership.dto.js';
import { GYM_DB_CONNECTION } from '../gym-db.constants.js';

export interface GymMembershipPlanSummary {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  billingCycle: string;
  includesPool: boolean;
  includesSpa: boolean;
  classCreditsPerMonth: number | null;
  centerIds: string[];
  isActive: boolean;
}

@Injectable()
export class GymMembershipsService {
  constructor(
    @InjectModel(GymMembershipPlan.name, GYM_DB_CONNECTION) private readonly planModel: Model<GymMembershipPlanDocument>,
    @InjectModel(GymUser.name, GYM_DB_CONNECTION) private readonly userModel: Model<GymUserDocument>,
    @InjectModel(GymMembershipEvent.name, GYM_DB_CONNECTION) private readonly eventModel: Model<GymMembershipEventDocument>,
    private readonly centersService: GymCentersService,
  ) {}

  // Listado público (dentro de la app) de planes activos — el socio los ve
  // al elegir/cambiar de plan. Sin filtro por admin: cualquier socio
  // autenticado ve todos los planes activos, independientemente de qué
  // centros abarquen (el frontend puede filtrar por su propio centerId).
  async listActivePlans(): Promise<GymMembershipPlanSummary[]> {
    const plans = await this.planModel.find({ isActive: true }).sort({ price: 1 });
    return plans.map((plan) => this.toPlanSummary(plan));
  }

  async findPlanById(id: string): Promise<GymMembershipPlanSummary> {
    const plan = await this.planModel.findById(id);
    if (!plan) {
      throw new NotFoundException('Membership plan not found.');
    }
    return this.toPlanSummary(plan);
  }

  // "Gestión de planes" completa (admin/superadmin, ver controller) — a
  // diferencia de listActivePlans, acá SÍ entran los planes desactivados,
  // para que un admin pueda encontrarlos y reactivarlos (PATCH isActive:
  // true) en vez de perderlos para siempre apenas se desactivan. Ver
  // PLANNING.md sección 5, limitación documentada de Fase 3.
  async listAllPlans(): Promise<GymMembershipPlanSummary[]> {
    const plans = await this.planModel.find().sort({ isActive: -1, price: 1 });
    return plans.map((plan) => this.toPlanSummary(plan));
  }

  // superadmin puede crear planes globales (centerIds vacío = aplica a
  // todos) o acotados a centros puntuales. admin SIEMPRE tiene que acotar el
  // plan a uno o más de sus propios centros — no puede crear un plan "para
  // todos los centros" (eso queda reservado a superadmin).
  async createPlan(admin: GymRequestUser, dto: CreateGymMembershipPlanDto): Promise<GymMembershipPlanSummary> {
    const centerIds = await this.resolveAndAuthorizeCenterIds(admin, dto.centerIds);

    const created = await this.planModel.create({
      name: dto.name,
      description: dto.description,
      price: dto.price,
      currency: dto.currency ?? 'EUR',
      billingCycle: dto.billingCycle,
      includesPool: dto.includesPool ?? false,
      includesSpa: dto.includesSpa ?? false,
      classCreditsPerMonth: dto.classCreditsPerMonth ?? null,
      centerIds,
    });

    return this.toPlanSummary(created);
  }

  async updatePlan(
    admin: GymRequestUser,
    id: string,
    dto: UpdateGymMembershipPlanDto,
  ): Promise<GymMembershipPlanSummary> {
    const plan = await this.planModel.findById(id);
    if (!plan) {
      throw new NotFoundException('Membership plan not found.');
    }

    // Un admin solo puede tocar planes que ya están acotados a (alguno de)
    // sus propios centros — nunca un plan global de superadmin ni uno de un
    // centro que no administra.
    if (admin.role === 'admin') {
      if (plan.centerIds.length === 0) {
        throw new ForbiddenException('You do not have access to this plan.');
      }
      for (const centerId of plan.centerIds) {
        assertCenterAccess(admin, centerId);
      }
    }

    if (dto.centerIds !== undefined) {
      plan.centerIds = await this.resolveAndAuthorizeCenterIds(admin, dto.centerIds);
    }

    if (dto.name !== undefined) plan.name = dto.name;
    if (dto.description !== undefined) plan.description = dto.description;
    if (dto.price !== undefined) plan.price = dto.price;
    if (dto.currency !== undefined) plan.currency = dto.currency;
    if (dto.billingCycle !== undefined) plan.billingCycle = dto.billingCycle;
    if (dto.includesPool !== undefined) plan.includesPool = dto.includesPool;
    if (dto.includesSpa !== undefined) plan.includesSpa = dto.includesSpa;
    if (dto.classCreditsPerMonth !== undefined) plan.classCreditsPerMonth = dto.classCreditsPerMonth;
    if (dto.isActive !== undefined) plan.isActive = dto.isActive;

    await plan.save();
    return this.toPlanSummary(plan);
  }

  // Cambio manual de estado de membresía de un socio (Fase 1, sin pagos
  // integrados todavía — ver PLANNING.md sección 5). Registra el cambio en
  // GymMembershipEvent para que el dashboard pueda calcular altas/bajas por
  // mes distinguiendo voluntaria de impago (ver 2.9). No toca
  // membershipStartDate/EndDate a propósito: esas fechas las va a manejar la
  // lógica de pagos en Fase 2 — acá solo se audita el cambio de estado.
  async updateMemberStatus(
    admin: GymRequestUser,
    targetUserId: string,
    dto: UpdateGymMembershipStatusDto,
  ): Promise<void> {
    const member = await this.userModel.findById(targetUserId);
    if (!member) {
      throw new NotFoundException('Member not found.');
    }

    if (admin.role === 'admin') {
      if (!member.centerId) {
        throw new ForbiddenException('You do not have access to this member.');
      }
      assertCenterAccess(admin, member.centerId);
    }

    const previousStatus = member.membershipStatus;

    // `staff` es una membresía sin cargo pensada para admins/recepción que
    // también entrenan — solo un superadmin puede otorgarla o quitarla, para
    // que ningún admin se la asigne a sí mismo o a otro admin (ver
    // GYM_MEMBERSHIP_STATUSES en gym-user.schema.ts).
    if ((dto.newStatus === 'staff' || previousStatus === 'staff') && admin.role !== 'superadmin') {
      throw new ForbiddenException('Solo un superadmin puede otorgar o quitar una membresía de staff.');
    }

    member.membershipStatus = dto.newStatus;
    await member.save();

    await this.eventModel.create({
      userId: member._id,
      previousStatus,
      newStatus: dto.newStatus,
      category: dto.category,
      reason: dto.reason,
    });
  }

  // Congelamiento self-service (Fase 4, ver PLANNING.md sección 5) — a
  // diferencia de updateMemberStatus (que es una acción de admin sobre
  // cualquier socio y no toca fechas), acá es el propio socio el que congela
  // SU membresía por 1-3 semanas: se extiende membershipEndDate por esas
  // mismas semanas (así el tiempo congelado no cuenta como parte del
  // período pago) y se guarda freezeEndsAt para la reactivación automática
  // (ver reactivateFrozenMembershipIfNeeded en membership-expiration.util.ts).
  // Solo se puede congelar desde 'active' — no tiene sentido (ni es seguro)
  // congelar algo que ya está vencido, pendiente de pago, cancelado o ya
  // congelado.
  async freezeOwnMembership(user: GymRequestUser, dto: FreezeGymMembershipDto): Promise<void> {
    const member = await this.userModel.findById(user.id);
    if (!member) {
      throw new NotFoundException('User not found.');
    }

    // Si ya venció o ya se destrabó un congelamiento anterior, que se
    // refleje antes de decidir si este pedido de congelar es válido.
    await reactivateFrozenMembershipIfNeeded(this.eventModel, member);

    if (member.membershipStatus !== 'active') {
      throw new BadRequestException(
        'Solo podés congelar una membresía activa. Si la tuya no figura como "Activa", revisá su estado en "Mi membresía".',
      );
    }

    const previousStatus = member.membershipStatus;
    const weeksInMs = dto.weeks * 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const baseEndDate = member.membershipEndDate && member.membershipEndDate.getTime() > now
      ? member.membershipEndDate.getTime()
      : now;

    member.membershipStatus = 'frozen';
    member.freezeEndsAt = new Date(now + weeksInMs);
    member.membershipEndDate = new Date(baseEndDate + weeksInMs);
    await member.save();

    await this.eventModel.create({
      userId: member._id,
      previousStatus,
      newStatus: 'frozen',
      category: 'congelamiento',
      reason: `Congelamiento self-service por ${dto.weeks} semana(s).`,
    });
  }

  // Valida que los centerIds recibidos existan y que, si quien pide el
  // cambio es un admin (no superadmin), todos caigan dentro de sus propios
  // managedCenterIds. Devuelve los ObjectId ya resueltos, listos para guardar.
  private async resolveAndAuthorizeCenterIds(
    admin: GymRequestUser,
    centerIds: string[] | undefined,
  ): Promise<Types.ObjectId[]> {
    if (admin.role === 'admin' && (!centerIds || centerIds.length === 0)) {
      throw new ForbiddenException('As an admin, you must scope this plan to at least one of your centers.');
    }

    const resolved = (centerIds ?? []).map((id) => new Types.ObjectId(id));

    for (const centerId of resolved) {
      await this.centersService.assertExists(centerId);
      if (admin.role === 'admin') {
        assertCenterAccess(admin, centerId);
      }
    }

    return resolved;
  }

  private toPlanSummary(plan: GymMembershipPlanDocument): GymMembershipPlanSummary {
    return {
      id: plan._id.toString(),
      name: plan.name,
      description: plan.description,
      price: plan.price,
      currency: plan.currency,
      billingCycle: plan.billingCycle,
      includesPool: plan.includesPool,
      includesSpa: plan.includesSpa,
      classCreditsPerMonth: plan.classCreditsPerMonth,
      centerIds: plan.centerIds.map((id) => id.toString()),
      isActive: plan.isActive,
    };
  }
}
