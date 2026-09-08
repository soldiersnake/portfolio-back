import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { GymCheckInsService } from './checkins.service.js';
import { ScanGymCheckInDto } from './dto/scan-checkin.dto.js';
import { ManualGymCheckInDto } from './dto/manual-checkin.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { GymRequestUser } from '../auth/gym-request-user.interface.js';

// "Control de acceso" — admin, superadmin y recepción (rol acotado
// exclusivamente a esta pantalla, ver GYM_ROLES en gym-user.schema.ts), ver
// PLANNING.md sección 4 ("Control de acceso*"). El scoping por centro lo
// valida GymCheckInsService vía assertCenterAccess.
@Controller('gym/checkins')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'superadmin', 'recepcion')
export class GymCheckInsController {
  constructor(private readonly checkInsService: GymCheckInsService) {}

  @Post('scan')
  @HttpCode(HttpStatus.CREATED)
  scan(@CurrentUser() user: GymRequestUser, @Body() dto: ScanGymCheckInDto) {
    return this.checkInsService.checkInByQr(user, dto);
  }

  @Post('manual')
  @HttpCode(HttpStatus.CREATED)
  manual(@CurrentUser() user: GymRequestUser, @Body() dto: ManualGymCheckInDto) {
    return this.checkInsService.checkInManually(user, dto);
  }
}
