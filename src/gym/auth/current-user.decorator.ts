import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { GymRequestUser } from './gym-request-user.interface.js';

// Solo tiene sentido usarlo en rutas protegidas por JwtAuthGuard, que es
// quien deja request.gymUser seteado.
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): GymRequestUser => {
  const request = ctx.switchToHttp().getRequest<Request>();
  if (!request.gymUser) {
    throw new UnauthorizedException('Missing authentication token.');
  }
  return request.gymUser;
});
