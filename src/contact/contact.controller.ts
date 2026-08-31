import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ContactService } from './contact.service.js';
import { CreateContactDto } from './dto/create-contact.dto.js';
import { RateLimitGuard } from '../common/guards/rate-limit.guard.js';

@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RateLimitGuard)
  async create(@Body() dto: CreateContactDto, @Req() request: Request): Promise<void> {
    await this.contactService.submit(dto, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }
}
