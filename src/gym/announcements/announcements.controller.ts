import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { GymAnnouncementsService } from './announcements.service.js';
import { CreateGymAnnouncementDto } from './dto/create-announcement.dto.js';
import { UpdateGymAnnouncementDto } from './dto/update-announcement.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { GymRequestUser } from '../auth/gym-request-user.interface.js';

@Controller('gym/announcements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GymAnnouncementsController {
  constructor(private readonly announcementsService: GymAnnouncementsService) {}

  // Lo que ve el socio: publicados y no vencidos.
  @Get()
  listVisible() {
    return this.announcementsService.listVisible();
  }

  // Panel admin: todos, incluyendo futuros/vencidos.
  @Get('all')
  @Roles('admin', 'superadmin')
  listAll() {
    return this.announcementsService.listAll();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.announcementsService.findById(id);
  }

  @Post()
  @Roles('admin', 'superadmin')
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: GymRequestUser, @Body() dto: CreateGymAnnouncementDto) {
    return this.announcementsService.create(user, dto);
  }

  @Patch(':id')
  @Roles('admin', 'superadmin')
  update(@Param('id') id: string, @Body() dto: UpdateGymAnnouncementDto) {
    return this.announcementsService.update(id, dto);
  }

  @Delete(':id')
  @Roles('admin', 'superadmin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.announcementsService.remove(id);
  }
}
