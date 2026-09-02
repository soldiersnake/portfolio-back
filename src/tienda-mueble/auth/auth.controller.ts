import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { GoogleLoginDto } from '../dto/google-login.dto.js';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard.js';

@Controller('tienda-mueble/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  async google(@Body() dto: GoogleLoginDto) {
    return this.authService.loginWithGoogle(dto.idToken);
  }
}
