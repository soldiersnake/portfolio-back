import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AudifonosService } from './audifonos.service.js';
import { SubscribeNewsletterDto } from './dto/subscribe-newsletter.dto.js';
import { RateLimitGuard } from '../common/guards/rate-limit.guard.js';

@Controller('audifonos')
export class AudifonosController {
  constructor(private readonly audifonosService: AudifonosService) {}

  @Post('newsletter')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RateLimitGuard)
  async subscribe(@Body() dto: SubscribeNewsletterDto, @Req() request: Request): Promise<void> {
    await this.audifonosService.subscribe(dto, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }
}
