import { IsArray, IsIn, IsMongoId, IsOptional } from 'class-validator';
import { GYM_ROLES, type GymRole } from '../../schemas/gym-user.schema.js';

// PATCH /gym/users/:id/role (solo superadmin, ver GymUsersService.updateMemberRole)
// — promueve un member a admin, degrada un admin a member, o reasigna los
// centros de un admin existente. managedCenterIds es obligatorio (al menos
// 1) cuando role = 'admin'; se ignora/limpia para 'member' y 'superadmin'.
export class UpdateGymMemberRoleDto {
  @IsIn(GYM_ROLES)
  role!: GymRole;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  managedCenterIds?: string[];
}
