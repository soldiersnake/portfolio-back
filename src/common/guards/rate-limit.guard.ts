import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Minimal in-memory rate limiter, keyed by IP address.
 *
 * We use a tiny hand-rolled guard instead of @nestjs/throttler here because,
 * at the time this project was built, @nestjs/throttler's peer dependencies
 * didn't yet support the NestJS 12 major version used by this backend.
 * For a low-traffic contact form this simple approach is sufficient; swap in
 * @nestjs/throttler (or a Redis-backed limiter) if this API grows beyond a
 * single instance/process.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();
  private readonly windowMs = 10 * 60 * 1000; // 10 minutes
  private readonly maxRequests = 5;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const key = request.ip ?? 'unknown';
    const now = Date.now();

    const timestamps = (this.hits.get(key) ?? []).filter(
      (timestamp) => now - timestamp < this.windowMs,
    );

    if (timestamps.length >= this.maxRequests) {
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
