import { SetMetadata } from '@nestjs/common';
import type { GymRole } from '../schemas/gym-user.schema.js';

export const GYM_ROLES_KEY = 'gymRoles';

// Uso: @Roles('admin', 'superadmin') junto con @UseGuards(JwtAuthGuard, RolesGuard).
// El orden de los guards importa: JwtAuthGuard tiene que correr primero para
// dejar request.gymUser seteado.
export const Roles = (...roles: GymRole[]) => SetMetadata(GYM_ROLES_KEY, roles);
