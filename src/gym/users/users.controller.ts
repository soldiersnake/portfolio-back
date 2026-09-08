import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { GymUsersService } from './users.service.js';
import { CreateGymMemberByAdminDto } from './dto/create-member-by-admin.dto.js';
import { UpdateGymProfileDto } from './dto/update-profile.dto.js';
import { AddGymWeightLogDto } from './dto/add-weight-log.dto.js';
import { UpdateGymMemberRoleDto } from './dto/update-member-role.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { GymRequestUser } from '../auth/gym-request-user.interface.js';

// Todas las rutas requieren sesión (JwtAuthGuard). RolesGuard solo exige un
// rol puntual donde hay @Roles(...) — ver createMember más abajo; el resto
// son de "mi propio perfil", accesibles para cualquier socio autenticado.
@Controller('gym/users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GymUsersController {
  constructor(private readonly usersService: GymUsersService) {}

  @Get('me')
  getMyProfile(@CurrentUser() user: GymRequestUser) {
    return this.usersService.getProfile(user.id);
  }

  @Patch('me')
  updateMyProfile(@CurrentUser() user: GymRequestUser, @Body() dto: UpdateGymProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  // Subida de la foto de perfil (ver comentario en GymUsersService.updateProfilePhoto
  // sobre por qué es un endpoint aparte del PATCH general). Mismo límite de
  // tamaño que tienda-mueble/products (5MB).
  @Post('me/photo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadMyPhoto(@CurrentUser() user: GymRequestUser, @UploadedFile() file: Express.Multer.File) {
    return this.usersService.updateProfilePhoto(user.id, file);
  }

  @Get('me/weight-logs')
  listMyWeightLogs(@CurrentUser() user: GymRequestUser) {
    return this.usersService.listWeightLogs(user.id);
  }

  @Post('me/weight-logs')
  @HttpCode(HttpStatus.CREATED)
  addMyWeightLog(@CurrentUser() user: GymRequestUser, @Body() dto: AddGymWeightLogDto) {
    return this.usersService.addWeightLog(user.id, dto);
  }

  @Post('me/qr-code/regenerate')
  @HttpCode(HttpStatus.OK)
  regenerateMyQrCode(@CurrentUser() user: GymRequestUser) {
    return this.usersService.regenerateQrCode(user.id);
  }

  // Listado/búsqueda de socios para "Gestión de afiliados" — admin ve solo
  // sus centros, superadmin ve todo (ver GymUsersService.listMembers).
  // recepción también entra acá (con el mismo scoping por centro que admin):
  // es lo que usa la pestaña "Buscar" de Control de acceso para encontrar un
  // socio y hacer el check-in manual, sin pasar por getMemberById (ficha
  // completa), que sigue vedado para este rol.
  @Get()
  @Roles('admin', 'superadmin', 'recepcion')
  listMembers(
    @CurrentUser() user: GymRequestUser,
    @Query('search') search?: string,
    @Query('centerId') centerId?: string,
    @Query('status') status?: string,
  ) {
    return this.usersService.listMembers(user, { search, centerId, status });
  }

  // "Gestión de admins" (solo superadmin) — va antes de ':id' para que Nest
  // no intente matchear "admins" como un ObjectId.
  @Get('admins')
  @Roles('superadmin')
  listAdmins() {
    return this.usersService.listAdmins();
  }

  // Ficha individual de un socio (o admin) — mismo scoping por centro que el
  // listado.
  @Get(':id')
  @Roles('admin', 'superadmin')
  getMemberById(@CurrentUser() user: GymRequestUser, @Param('id') id: string) {
    return this.usersService.getMemberById(user, id);
  }

  // Alta manual de un socio nuevo desde "Gestión de afiliados" (recepción).
  // Ver GymUsersService.createByAdmin — dispara invitación por mail. También
  // sirve para dar de alta un admin nuevo (dto.role) si quien pide el alta
  // es superadmin.
  @Post()
  @Roles('admin', 'superadmin')
  @HttpCode(HttpStatus.CREATED)
  createMember(@CurrentUser() user: GymRequestUser, @Body() dto: CreateGymMemberByAdminDto) {
    return this.usersService.createByAdmin(dto, user);
  }

  // Promueve/degrada el rol de un usuario existente y (re)asigna sus centros
  // gestionados — ver GymUsersService.updateMemberRole.
  @Patch(':id/role')
  @Roles('superadmin')
  updateMemberRole(
    @CurrentUser() user: GymRequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateGymMemberRoleDto,
  ) {
    return this.usersService.updateMemberRole(user, id, dto);
  }
}
