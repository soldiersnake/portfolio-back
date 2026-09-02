import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { TiendaMuebleContactService } from './contact.service.js';
import { CreateTiendaMuebleContactDto } from '../dto/create-contact.dto.js';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard.js';

@Controller('tienda-mueble/contact')
export class TiendaMuebleContactController {
  constructor(private readonly contactService: TiendaMuebleContactService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RateLimitGuard)
  async create(@Body() dto: CreateTiendaMuebleContactDto, @Req() request: Request): Promise<void> {
    await this.contactService.submit(dto, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }
}
