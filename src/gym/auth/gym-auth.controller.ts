import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { GymAuthService } from './gym-auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { GoogleLoginDto } from './dto/google-login.dto.js';
import { AcceptInviteDto } from './dto/accept-invite.dto.js';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard.js';

@Controller('gym/auth')
@UseGuards(RateLimitGuard)
export class GymAuthController {
  constructor(private readonly authService: GymAuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.authService.registerWithEmail(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.loginWithEmail(dto);
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  google(@Body() dto: GoogleLoginDto) {
    return this.authService.loginWithGoogle(dto.idToken, dto.centerId, dto.ref);
  }

  // Usado tanto por socios dados de alta manualmente por un admin (link del
  // mail de invitación) para elegir contraseña o vincular Google.
  @Post('accept-invite')
  @HttpCode(HttpStatus.OK)
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.authService.acceptInvite(dto);
  }
}
