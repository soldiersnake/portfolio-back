import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { TiendaMuebleAuthUser } from './auth.service.js';

declare module 'express' {
  interface Request {
    tiendaMuebleUser?: TiendaMuebleAuthUser;
  }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (!token) {
      throw new UnauthorizedException('Missing authentication token.');
    }

    try {
      request.tiendaMuebleUser = await this.jwtService.verifyAsync<TiendaMuebleAuthUser>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }

    return true;
  }
}
