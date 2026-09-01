import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { RecommendationsService } from './recommendations.service.js';
import { CreateRecommendationDto } from './dto/create-recommendation.dto.js';
import { RateLimitGuard } from '../common/guards/rate-limit.guard.js';

@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendationsService: RecommendationsService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RateLimitGuard)
  async create(@Body() dto: CreateRecommendationDto, @Req() request: Request): Promise<void> {
    await this.recommendationsService.submit(dto, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }
}
