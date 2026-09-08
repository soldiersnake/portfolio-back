import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { GymNotificationsService } from './notifications.service.js';
import { SubscribeGymPushDto } from './dto/subscribe-push.dto.js';
import { UnsubscribeGymPushDto } from './dto/unsubscribe-push.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { GymRequestUser } from '../auth/gym-request-user.interface.js';

@Controller('gym/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GymNotificationsController {
  constructor(private readonly notificationsService: GymNotificationsService) {}

  // Cualquier socio autenticado (member/admin/superadmin) puede pedir la
  // public key para suscribirse — null si el servidor no tiene VAPID
  // configurado (ver GymWebPushService).
  @Get('vapid-public-key')
  getVapidPublicKey() {
    return { publicKey: this.notificationsService.getVapidPublicKey() };
  }

  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  async subscribe(@CurrentUser() user: GymRequestUser, @Body() dto: SubscribeGymPushDto): Promise<{ success: true }> {
    await this.notificationsService.subscribe(user, dto);
    return { success: true };
  }

  @Post('unsubscribe')
  @HttpCode(HttpStatus.OK)
  async unsubscribe(
    @CurrentUser() user: GymRequestUser,
    @Body() dto: UnsubscribeGymPushDto,
  ): Promise<{ success: true }> {
    await this.notificationsService.unsubscribe(user, dto);
    return { success: true };
  }

  // Disparo explícito de push + email para un anuncio ya creado (ver
  // GymAnnouncementsController.create) — separado del alta del anuncio a
  // propósito, para que un admin pueda revisar/editar antes de notificar a
  // todos los socios (ver PLANNING.md sección 4, "Gestión de anuncios").
  @Post('announcements/:id/publish')
  @Roles('admin', 'superadmin')
  @HttpCode(HttpStatus.OK)
  publishAnnouncement(@Param('id') id: string) {
    return this.notificationsService.publishAnnouncement(id);
  }
}
