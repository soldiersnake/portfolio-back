import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';

export interface TiendaMuebleAuthUser {
  email: string;
  name: string;
  picture?: string;
  isAdmin: boolean;
}

/**
 * Login vía Google Identity Services (ver GoogleLoginButton en el
 * frontend): el navegador obtiene un ID token firmado por Google, este
 * servicio lo verifica contra los servidores de Google (sin necesidad de
 * client secret ni redirect flow, ideal para una SPA) y emite un JWT propio
 * de corta vida para el resto de la API.
 *
 * El rol de admin no se guarda en ningún lado: se calcula comparando el
 * email verificado contra TIENDA_MUEBLE_ADMIN_EMAIL. Así no hace falta
 * mantener una tabla de roles para un solo usuario admin (Mariano).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClient: OAuth2Client;
  private readonly clientId?: string;
  private readonly adminEmail: string;

  constructor(
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    this.googleClient = new OAuth2Client(this.clientId);
    this.adminEmail = (this.config.get<string>('TIENDA_MUEBLE_ADMIN_EMAIL') ?? '').toLowerCase();
  }

  async loginWithGoogle(idToken: string): Promise<{ token: string; user: TiendaMuebleAuthUser }> {
    if (!this.clientId) {
      this.logger.error('GOOGLE_CLIENT_ID is not set — cannot verify Google logins.');
      throw new UnauthorizedException('Google login is not configured on the server.');
    }

    let payload;
    try {
      const ticket = await this.googleClient.verifyIdToken({ idToken, audience: this.clientId });
      payload = ticket.getPayload();
    } catch (error) {
      this.logger.warn(`Google ID token verification failed: ${(error as Error).message}`);
      throw new UnauthorizedException('Invalid Google token.');
    }

    if (!payload?.email || !payload.email_verified) {
      throw new UnauthorizedException('Google account email is not verified.');
    }

    const email = payload.email.toLowerCase();
    const user: TiendaMuebleAuthUser = {
      email,
      name: payload.name ?? email,
      picture: payload.picture,
      isAdmin: Boolean(this.adminEmail) && email === this.adminEmail,
    };

    const token = await this.jwtService.signAsync(user);
    return { token, user };
  }
}
