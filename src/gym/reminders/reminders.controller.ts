import { Controller, ForbiddenException, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GymRemindersService } from './reminders.service.js';

// Endpoint público (sin JwtAuthGuard/RolesGuard): lo llama la GitHub Action
// diaria (.github/workflows/gym-membership-reminders.yml), no un socio
// logueado — mismo motivo que los webhooks de gym/payments/payments.controller.ts
// (comentario ahí explica por qué van con guards por-endpoint y no a nivel
// de clase). Acá no hay firma de proveedor de pagos que verificar, así que
// se protege con un secreto compartido simple en un header.
@Controller('gym/reminders')
export class GymRemindersController {
  constructor(
    private readonly remindersService: GymRemindersService,
    private readonly config: ConfigService,
  ) {}

  @Post('expiring-soon')
  @HttpCode(HttpStatus.OK)
  async runExpiringSoonReminders(@Headers('x-cron-secret') providedSecret?: string) {
    const expectedSecret = this.config.get<string>('GYM_CRON_SECRET');
    // Si no hay secreto configurado en el server, el endpoint queda cerrado
    // por completo (nunca "abierto por defecto") — evita que alguien lo
    // dispare a mano contra prod solo porque Mariano todavía no cargó la
    // env var.
    if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
      throw new ForbiddenException('Invalid or missing cron secret.');
    }

    return this.remindersService.sendExpiringSoonReminders();
  }
}
