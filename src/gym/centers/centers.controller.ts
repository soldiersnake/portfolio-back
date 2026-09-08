import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { GymCentersService } from './centers.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import type { CreateGymCenterDto } from './dto/create-center.dto.js';
import type { UpdateGymCenterDto } from './dto/update-center.dto.js';

// Lectura abierta a cualquier socio autenticado (sin rol) — ver
// listActive()/findById() en el service. La gestión de sedes
// (crear/editar/reactivar) es exclusiva de superadmin — ver PLANNING.md
// sección 4. 'all' va antes de ':id' para que Nest no intente matchear
// "all" como un ObjectId (mismo criterio que 'admins' en users.controller.ts).
@Controller('gym/centers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GymCentersController {
  constructor(private readonly centersService: GymCentersService) {}

  @Get()
  list() {
    return this.centersService.listActive();
  }

  // Panel admin "Gestión de sedes" — incluye las desactivadas.
  @Get('all')
  @Roles('superadmin')
  listAllForAdmin() {
    return this.centersService.listAllForAdmin();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.centersService.findById(id);
  }

  @Post()
  @Roles('superadmin')
  create(@Body() dto: CreateGymCenterDto) {
    return this.centersService.create(dto);
  }

  @Patch(':id')
  @Roles('superadmin')
  update(@Param('id') id: string, @Body() dto: UpdateGymCenterDto) {
    return this.centersService.update(id, dto);
  }

  // Sube una foto y la agrega al array `photos` de la sede — mismo límite de
  // tamaño (5MB) y patrón que gym/users/me/photo y gym/classes/:id/photo.
  @Post(':id/photo')
  @Roles('superadmin')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadPhoto(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.centersService.addPhoto(id, file);
  }
}
