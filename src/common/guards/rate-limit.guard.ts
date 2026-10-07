import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  mixin,
  type Type,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Minimal in-memory rate limiter, keyed by IP address + route.
 *
 * We use a tiny hand-rolled guard instead of @nestjs/throttler here because,
 * at the time this project was built, @nestjs/throttler's peer dependencies
 * didn't yet support the NestJS 12 major version used by this backend.
 * Swap in @nestjs/throttler (or a Redis-backed limiter) if this API grows
 * beyond a single instance/process.
 *
 * The key includes the route path so that, e.g., failed logins don't eat
 * into the register budget of the same IP. request.ip only reflects the
 * real client when `trust proxy` is enabled (see main.ts) — otherwise on
 * Render every request shares the load balancer's IP and one bucket.
 */
export function createRateLimitGuard(maxRequests: number, windowMs: number): Type<CanActivate> {
  @Injectable()
  class RateLimitGuardMixin implements CanActivate {
    private readonly hits = new Map<string, number[]>();

    canActivate(context: ExecutionContext): boolean {
      const request = context.switchToHttp().getRequest<Request>();
      const key = `${request.ip ?? 'unknown'}:${request.method}:${request.route?.path ?? request.path}`;
      const now = Date.now();

      const timestamps = (this.hits.get(key) ?? []).filter(
        (timestamp) => now - timestamp < windowMs,
      );

      if (timestamps.length >= maxRequests) {
        throw new HttpException(
          'Too many requests. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      timestamps.push(now);
      this.hits.set(key, timestamps);
      return true;
    }
  }

  return mixin(RateLimitGuardMixin);
}

// Default: 5 requests / 10 min — pensado para formularios de contacto y
// pedidos (bajo volumen, alto riesgo de spam).
export const RateLimitGuard = createRateLimitGuard(5, 10 * 60 * 1000);

// Auth de GymBro: un login real puede requerir varios intentos (contraseña
// mal tipeada, Google One Tap reintentando, cambio de cuenta), y en un
// gimnasio varios socios pueden compartir la IP del wifi. 30 / 10 min por
// IP y por endpoint sigue frenando fuerza bruta sin bloquear uso normal.
export const AuthRateLimitGuard = createRateLimitGuard(30, 10 * 60 * 1000);
