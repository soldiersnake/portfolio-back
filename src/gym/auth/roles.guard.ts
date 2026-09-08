import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { GymRole } from '../schemas/gym-user.schema.js';
import { GYM_ROLES_KEY } from './roles.decorator.js';

// Chequea que request.gymUser.role esté entre los roles permitidos por
// @Roles(...) en el handler o el controller. Nota: esto NO valida el
// scoping por centro de un admin (managedCenterIds) — eso lo va a hacer un
// centers-scope.guard aparte cuando exista el módulo de centers (ver
// PLANNING.md sección 3, "segunda tanda" del scaffolding).
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<GymRole[] | undefined>(GYM_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const role = request.gymUser?.role;

    if (!role || !requiredRoles.includes(role)) {
      throw new ForbiddenException('You do not have permission to perform this action.');
    }

    return true;
  }
}
