import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import type { Request } from 'express';
import { Model } from 'mongoose';
import { GymUser, type GymUserDocument } from '../schemas/gym-user.schema.js';
import type { GymRequestUser } from './gym-request-user.interface.js';
import { GYM_DB_CONNECTION } from '../gym-db.constants.js';

declare module 'express' {
  interface Request {
    gymUser?: GymRequestUser;
  }
}

interface GymJwtPayload {
  sub: string;
}

// A diferencia de tienda-mueble (JWT stateless con el perfil entero adentro),
// acá el JWT solo lleva { sub: userId } y este guard busca el GymUser
// fresco en cada request — necesario porque el rol, los centros que
// administra un admin, o el estado de la cuenta pueden cambiar en cualquier
// momento y tienen que reflejarse al instante (ej. si un superadmin le saca
// un centro a un admin, o congela una cuenta).
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @InjectModel(GymUser.name, GYM_DB_CONNECTION) private readonly userModel: Model<GymUserDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (!token) {
      throw new UnauthorizedException('Missing authentication token.');
    }

    let payload: GymJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<GymJwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }

    const user = await this.userModel.findById(payload.sub).lean();
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account not found or disabled.');
    }

    request.gymUser = {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      managedCenterIds: user.managedCenterIds,
      accountStatus: user.accountStatus,
    };

    return true;
  }
}
