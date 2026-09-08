import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { GymMembershipsService } from './memberships.service.js';
import { CreateGymMembershipPlanDto } from './dto/create-plan.dto.js';
import { UpdateGymMembershipPlanDto } from './dto/update-plan.dto.js';
import { UpdateGymMembershipStatusDto } from './dto/update-membership-status.dto.js';
import { FreezeGymMembershipDto } from './dto/freeze-membership.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { GymRequestUser } from '../auth/gym-request-user.interface.js';

@Controller('gym/memberships')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GymMembershipsController {
  constructor(private readonly membershipsService: GymMembershipsService) {}

  // Cualquier socio autenticado puede ver los planes (para elegir/comparar).
  @Get('plans')
  listPlans() {
    return this.membershipsService.listActivePlans();
  }

  // "Gestión de planes" completa, incluye desactivados (ver
  // GymMembershipsService.listAllPlans). Va antes de 'plans/:id' para que
  // Nest no intente matchear 'all' como un ObjectId.
  @Get('plans/all')
  @Roles('admin', 'superadmin')
  listAllPlans() {
    return this.membershipsService.listAllPlans();
  }

  @Get('plans/:id')
  getPlan(@Param('id') id: string) {
    return this.membershipsService.findPlanById(id);
  }

  @Post('plans')
  @Roles('admin', 'superadmin')
  @HttpCode(HttpStatus.CREATED)
  createPlan(@CurrentUser() user: GymRequestUser, @Body() dto: CreateGymMembershipPlanDto) {
    return this.membershipsService.createPlan(user, dto);
  }

  @Patch('plans/:id')
  @Roles('admin', 'superadmin')
  updatePlan(@CurrentUser() user: GymRequestUser, @Param('id') id: string, @Body() dto: UpdateGymMembershipPlanDto) {
    return this.membershipsService.updatePlan(user, id, dto);
  }

  // Cambio manual de estado de membresía de un socio (activar/expirar/
  // congelar/reactivar) — ver GymMembershipsService.updateMemberStatus.
  @Patch('users/:userId/status')
  @Roles('admin', 'superadmin')
  @HttpCode(HttpStatus.OK)
  async updateMemberStatus(
    @CurrentUser() user: GymRequestUser,
    @Param('userId') userId: string,
    @Body() dto: UpdateGymMembershipStatusDto,
  ) {
    await this.membershipsService.updateMemberStatus(user, userId, dto);
    return { success: true };
  }

  // Congelamiento self-service: cualquier socio autenticado congela SU
  // PROPIA membresía (sin @Roles — no hace falta ser admin, ver
  // GymMembershipsService.freezeOwnMembership).
  @Post('me/freeze')
  @HttpCode(HttpStatus.OK)
  async freezeOwnMembership(@CurrentUser() user: GymRequestUser, @Body() dto: FreezeGymMembershipDto) {
    await this.membershipsService.freezeOwnMembership(user, dto);
    return { success: true };
  }
}
