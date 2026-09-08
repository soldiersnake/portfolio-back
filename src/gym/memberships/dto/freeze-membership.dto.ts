import { IsIn } from 'class-validator';

// POST /gym/memberships/me/freeze — congelamiento self-service (Fase 4, ver
// GymMembershipsService.freezeOwnMembership). Acotado a 1-3 semanas: más de
// eso empieza a pisar el criterio de "de baja" y se maneja mejor a mano por
// un admin (PATCH /gym/memberships/users/:userId/status).
export class FreezeGymMembershipDto {
  @IsIn([1, 2, 3])
  weeks!: number;
}
