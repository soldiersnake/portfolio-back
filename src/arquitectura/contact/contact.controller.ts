import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ArquitecturaContactService } from './contact.service.js';
import { CreateArquitecturaContactDto } from '../dto/create-contact.dto.js';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard.js';

@Controller('arquitectura/contact')
export class ArquitecturaContactController {
  constructor(private readonly contactService: ArquitecturaContactService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RateLimitGuard)
  async create(@Body() dto: CreateArquitecturaContactDto, @Req() request: Request): Promise<void> {
    await this.contactService.submit(dto, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }
}
