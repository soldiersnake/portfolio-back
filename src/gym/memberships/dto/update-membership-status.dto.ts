import { IsIn, IsOptional, IsString } from 'class-validator';
import { GYM_MEMBERSHIP_STATUSES, type GymMembershipStatus } from '../../schemas/gym-user.schema.js';
import {
  GYM_MEMBERSHIP_EVENT_CATEGORIES,
  type GymMembershipEventCategory,
} from '../../schemas/gym-membership-event.schema.js';

// Cambio manual del estado de membresía de un socio (Fase 1: sin
// integración de pagos todavía, ver PLANNING.md sección 5 — un admin activa,
// congela o da de baja "a mano"). Cada cambio queda auditado en
// GymMembershipEvent (ver GymMembershipsService.updateStatus) con la
// `category` que alimenta las métricas del dashboard (altas/bajas
// voluntarias vs. por impago).
export class UpdateGymMembershipStatusDto {
  @IsIn(GYM_MEMBERSHIP_STATUSES)
  newStatus!: GymMembershipStatus;

  @IsIn(GYM_MEMBERSHIP_EVENT_CATEGORIES)
  category!: GymMembershipEventCategory;

  @IsOptional()
  @IsString()
  reason?: string;
}
