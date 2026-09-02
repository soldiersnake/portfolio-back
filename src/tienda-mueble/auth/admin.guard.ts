import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

// Se usa siempre después de JwtAuthGuard (@UseGuards(JwtAuthGuard, AdminGuard)):
// necesita que request.tiendaMuebleUser ya esté seteado.
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.tiendaMuebleUser?.isAdmin) {
      throw new ForbiddenException('Admin access required.');
    }
    return true;
  }
}
