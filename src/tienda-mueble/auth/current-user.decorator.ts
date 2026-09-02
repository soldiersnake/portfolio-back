import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { TiendaMuebleAuthUser } from './auth.service.js';

// Solo tiene sentido usarlo en rutas protegidas por JwtAuthGuard, que es
// quien deja request.tiendaMuebleUser seteado.
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): TiendaMuebleAuthUser => {
  const request = ctx.switchToHttp().getRequest<Request>();
  if (!request.tiendaMuebleUser) {
    throw new UnauthorizedException('Missing authentication token.');
  }
  return request.tiendaMuebleUser;
});
