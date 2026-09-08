import {
  Body,
  Controller,
  Delete,
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
import { GymClassesService } from './classes.service.js';
import { CreateGymClassDto } from './dto/create-class.dto.js';
import { UpdateGymClassDto } from './dto/update-class.dto.js';
import { BookGymClassDto } from './dto/book-class.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { GymRequestUser } from '../auth/gym-request-user.interface.js';

@Controller('gym/classes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GymClassesController {
  constructor(private readonly classesService: GymClassesService) {}

  // Lo que ve el socio al elegir clase (solo activas).
  @Get()
  listActive(@Query('centerId') centerId?: string) {
    return this.classesService.listActive(centerId);
  }

  // Panel admin: incluye inactivas, scoping por centro.
  @Get('all')
  @Roles('admin', 'superadmin')
  listAll(@CurrentUser() user: GymRequestUser) {
    return this.classesService.listAllForAdmin(user);
  }

  // Reservas propias del socio autenticado — va antes de ':id' para que
  // Nest no intente matchear "mine" como un ObjectId.
  @Get('bookings/mine')
  listMyBookings(@CurrentUser() user: GymRequestUser) {
    return this.classesService.listMyBookings(user);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.classesService.findById(id);
  }

  @Get(':id/availability')
  getAvailability(@Param('id') id: string, @Query('sessionDate') sessionDate: string) {
    return this.classesService.getAvailability(id, sessionDate);
  }

  @Get(':id/roster')
  @Roles('admin', 'superadmin')
  getRoster(
    @CurrentUser() user: GymRequestUser,
    @Param('id') id: string,
    @Query('sessionDate') sessionDate: string,
  ) {
    return this.classesService.listRoster(user, id, sessionDate);
  }

  @Post()
  @Roles('admin', 'superadmin')
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: GymRequestUser, @Body() dto: CreateGymClassDto) {
    return this.classesService.create(user, dto);
  }

  @Patch(':id')
  @Roles('admin', 'superadmin')
  update(@CurrentUser() user: GymRequestUser, @Param('id') id: string, @Body() dto: UpdateGymClassDto) {
    return this.classesService.update(user, id, dto);
  }

  @Delete(':id')
  @Roles('admin', 'superadmin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: GymRequestUser, @Param('id') id: string): Promise<void> {
    await this.classesService.remove(user, id);
  }

  // Subida de la foto de la clase — mismo límite de tamaño (5MB) y patrón
  // (endpoint aparte del PATCH general) que gym/users/me/photo.
  @Post(':id/photo')
  @Roles('admin', 'superadmin')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadPhoto(
    @CurrentUser() user: GymRequestUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.classesService.updateClassImage(user, id, file);
  }

  @Post('bookings')
  @HttpCode(HttpStatus.CREATED)
  bookClass(@CurrentUser() user: GymRequestUser, @Body() dto: BookGymClassDto) {
    return this.classesService.bookClass(user, dto);
  }

  @Post('bookings/:bookingId/cancel')
  @HttpCode(HttpStatus.OK)
  cancelBooking(@CurrentUser() user: GymRequestUser, @Param('bookingId') bookingId: string) {
    return this.classesService.cancelBooking(user, bookingId);
  }
}
