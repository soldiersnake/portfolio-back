import { BadRequestException, ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import * as bcrypt from 'bcryptjs';
import { Model, Types } from 'mongoose';
import { EmailService } from '../../email/email.service.js';
import { GymUser, type GymUserDocument } from '../schemas/gym-user.schema.js';
import { generateOpaqueToken } from '../common/tokens.util.js';
import { GymCentersService } from '../centers/centers.service.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { AcceptInviteDto } from './dto/accept-invite.dto.js';
import { GYM_DB_CONNECTION } from '../gym-db.constants.js';

// Forma pública de un GymUser devuelta al frontend después de login/registro
// — nunca incluye passwordHash/inviteToken (que además ya tienen
// `select: false` en el schema, así que ni siquiera llegan del find salvo
// que se pidan explícitamente).
export interface GymPublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  accountStatus: string;
  membershipStatus: string;
  qrCodeToken: string;
  photoUrl?: string;
}

export interface GymAuthResult {
  token: string;
  user: GymPublicUser;
}

const SALT_ROUNDS = 12;

@Injectable()
export class GymAuthService {
  private readonly logger = new Logger(GymAuthService.name);
  private readonly googleClient: OAuth2Client;
  private readonly googleClientId?: string;

  constructor(
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly centersService: GymCentersService,
    @InjectModel(GymUser.name, GYM_DB_CONNECTION) private readonly userModel: Model<GymUserDocument>,
  ) {
    // Cliente OAuth propio y separado del de tienda-mueble (GOOGLE_CLIENT_ID)
    // — GymBro usa su propio proyecto/cliente en Google Cloud, ver
    // PLANNING.md "Resuelto ronda 2".
    this.googleClientId = this.config.get<string>('GYM_GOOGLE_CLIENT_ID');
    this.googleClient = new OAuth2Client(this.googleClientId);
  }

  async registerWithEmail(dto: RegisterDto): Promise<GymAuthResult> {
    const email = dto.email.toLowerCase();
    const existing = await this.userModel.exists({ email });
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const centerId = await this.resolveCenterId(dto.centerId);
    const referredByUserId = await this.resolveReferrer(dto.ref);

    const created = await this.userModel.create({
      email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: 'member',
      registrationSource: 'self',
      accountStatus: 'active',
      qrCodeToken: generateOpaqueToken(),
      centerId,
      referredByUserId,
    });

    await this.sendWelcomeEmailSafely(created);

    return this.buildAuthResult(created);
  }

  async loginWithEmail(dto: LoginDto): Promise<GymAuthResult> {
    const email = dto.email.toLowerCase();
    const user = await this.userModel.findOne({ email }).select('+passwordHash');

    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('This account has been disabled.');
    }

    return this.buildAuthResult(user);
  }

  async loginWithGoogle(idToken: string, centerIdRaw?: string, refRaw?: string): Promise<GymAuthResult> {
    if (!this.googleClientId) {
      this.logger.error('GYM_GOOGLE_CLIENT_ID is not set — cannot verify Google logins.');
      throw new UnauthorizedException('Google login is not configured on the server.');
    }

    const payload = await this.verifyGoogleIdToken(idToken);
    const email = payload.email!.toLowerCase();

    let user = await this.userModel.findOne({ email });

    if (!user) {
      // Autoregistro vía Google: no existía ninguna cuenta con este mail.
      // centerId/ref solo aplican acá (alta nueva) — mismo criterio que
      // registerWithEmail, ver comentario en RegisterDto.
      const centerId = await this.resolveCenterId(centerIdRaw);
      const referredByUserId = await this.resolveReferrer(refRaw);
      user = await this.userModel.create({
        email,
        googleId: payload.sub,
        firstName: payload.given_name ?? payload.name ?? email,
        lastName: payload.family_name ?? '',
        photoUrl: payload.picture,
        role: 'member',
        registrationSource: 'self',
        accountStatus: 'active',
        qrCodeToken: generateOpaqueToken(),
        centerId,
        referredByUserId,
      });
      await this.sendWelcomeEmailSafely(user);
    } else if (!user.isActive) {
      throw new UnauthorizedException('This account has been disabled.');
    } else if (!user.googleId) {
      // Cuenta existente (ej. alta manual de un admin, o registro por
      // email) que ahora se loguea con Google por primera vez: vinculamos.
      user.googleId = payload.sub;
      await user.save();
    }

    return this.buildAuthResult(user);
  }

  // El socio dado de alta manualmente por un admin (accountStatus =
  // 'pending_invite', ver GymUsersService.createByAdmin) usa el link del
  // mail de invitación para completar su acceso, eligiendo contraseña o
  // vinculando Google.
  async acceptInvite(dto: AcceptInviteDto): Promise<GymAuthResult> {
    if (!dto.password && !dto.googleIdToken) {
      throw new BadRequestException('Provide either a password or a Google account to finish setting up access.');
    }

    const user = await this.userModel
      .findOne({ inviteToken: dto.inviteToken })
      .select('+inviteToken +inviteTokenExpiresAt');

    if (!user || !user.inviteTokenExpiresAt || user.inviteTokenExpiresAt < new Date()) {
      throw new UnauthorizedException('This invitation link is invalid or has expired.');
    }

    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    }

    if (dto.googleIdToken) {
      const payload = await this.verifyGoogleIdToken(dto.googleIdToken);
      if (payload.email!.toLowerCase() !== user.email) {
        throw new BadRequestException('The Google account email does not match the invited email.');
      }
      user.googleId = payload.sub;
    }

    user.accountStatus = 'active';
    user.inviteAcceptedAt = new Date();
    user.inviteToken = undefined;
    user.inviteTokenExpiresAt = undefined;
    await user.save();

    return this.buildAuthResult(user);
  }

  // centerId de un link de invitación de sede compartido (ver AdminSedesPage
  // "Compartir" / RegisterDto) — a diferencia de ref (abajo), si viene
  // presente pero no corresponde a ninguna sede real se rechaza el registro
  // entero (assertExists tira NotFoundException): un centerId roto es un bug
  // del link, no algo para ignorar en silencio.
  private async resolveCenterId(raw?: string): Promise<Types.ObjectId | undefined> {
    if (!raw) return undefined;
    const centerId = new Types.ObjectId(raw);
    await this.centersService.assertExists(centerId);
    return centerId;
  }

  // userId de quien compartió el link (ver referredByUserId en
  // gym-user.schema.ts) — a diferencia de centerId, acá SÍ se ignora en
  // silencio si no corresponde a ningún usuario real (cuenta borrada, link
  // viejo, etc.): es solo trazabilidad sin recompensa todavía, no vale la
  // pena bloquear un alta nueva por un dato que no es crítico.
  private async resolveReferrer(raw?: string): Promise<Types.ObjectId | undefined> {
    if (!raw) return undefined;
    const referrerId = new Types.ObjectId(raw);
    const exists = await this.userModel.exists({ _id: referrerId });
    return exists ? referrerId : undefined;
  }

  private async verifyGoogleIdToken(idToken: string): Promise<TokenPayload> {
    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.googleClient.verifyIdToken({ idToken, audience: this.googleClientId });
      payload = ticket.getPayload();
    } catch (error) {
      this.logger.warn(`Google ID token verification failed: ${(error as Error).message}`);
      throw new UnauthorizedException('Invalid Google token.');
    }

    if (!payload?.email || !payload.email_verified) {
      throw new UnauthorizedException('Google account email is not verified.');
    }

    return payload;
  }

  // Mail de bienvenida para el socio que se autoregistró (email/contraseña
  // o Google) — a diferencia de sendGymInviteEmail, la cuenta ya queda
  // activa de entrada, así que esto es solo confirmación + acceso directo,
  // no una acción pendiente. Nunca debe romper el registro/login si el
  // envío falla (mismo criterio que el mail de invitación en
  // GymUsersService.createByAdmin).
  private async sendWelcomeEmailSafely(user: GymUserDocument): Promise<void> {
    const sent = await this.emailService.sendGymWelcomeEmail({
      email: user.email,
      firstName: user.firstName,
    });
    if (!sent) {
      this.logger.warn(`Welcome email could not be sent to ${user.email} (account created regardless).`);
    }
  }

  private async buildAuthResult(user: GymUserDocument): Promise<GymAuthResult> {
    const token = await this.jwtService.signAsync({ sub: user._id.toString() });
    return {
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        accountStatus: user.accountStatus,
        membershipStatus: user.membershipStatus,
        qrCodeToken: user.qrCodeToken,
        photoUrl: user.photoUrl,
      },
    };
  }
}
