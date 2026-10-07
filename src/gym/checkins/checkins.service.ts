import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { assertCenterAccess } from '../auth/centers-access.util.js';
import type { GymRequestUser } from '../auth/gym-request-user.interface.js';
import { GymCentersService } from '../centers/centers.service.js';
import { expireMembershipIfNeeded, reactivateFrozenMembershipIfNeeded } from '../common/membership-expiration.util.js';
import { GymCheckIn, type GymCheckInDocument, type GymCheckInMethod } from '../schemas/gym-checkin.schema.js';
import { GymMembershipEvent, type GymMembershipEventDocument } from '../schemas/gym-membership-event.schema.js';
import { GymUser, type GymUserDocument } from '../schemas/gym-user.schema.js';
import type { ScanGymCheckInDto } from './dto/scan-checkin.dto.js';
import type { ManualGymCheckInDto } from './dto/manual-checkin.dto.js';
import { GYM_DB_CONNECTION } from '../gym-db.constants.js';

export interface GymCheckInResult {
  checkInId: string;
  accessGranted: boolean;
  member: {
    id: string;
    firstName: string;
    lastName: string;
    photoUrl?: string;
    membershipStatus: string;
  };
}

@Injectable()
export class GymCheckInsService {
  constructor(
    @InjectModel(GymCheckIn.name, GYM_DB_CONNECTION) private readonly checkInModel: Model<GymCheckInDocument>,
    @InjectModel(GymUser.name, GYM_DB_CONNECTION) private readonly userModel: Model<GymUserDocument>,
    @InjectModel(GymMembershipEvent.name, GYM_DB_CONNECTION) private readonly eventModel: Model<GymMembershipEventDocument>,
    private readonly centersService: GymCentersService,
  ) {}

  async checkInByQr(scannedBy: GymRequestUser, dto: ScanGymCheckInDto): Promise<GymCheckInResult> {
    const member = await this.userModel.findOne({ qrCodeToken: dto.qrCodeToken });
    if (!member) {
      throw new NotFoundException('Invalid QR code.');
    }
    return this.registerCheckIn(scannedBy, member, dto.centerId, 'qr_scan_app');
  }

  async checkInManually(scannedBy: GymRequestUser, dto: ManualGymCheckInDto): Promise<GymCheckInResult> {
    const member = await this.userModel.findById(dto.userId);
    if (!member) {
      throw new NotFoundException('Member not found.');
    }
    return this.registerCheckIn(scannedBy, member, dto.centerId, 'manual');
  }

  private async registerCheckIn(
    scannedBy: GymRequestUser,
    member: GymUserDocument,
    centerIdRaw: string,
    method: GymCheckInMethod,
  ): Promise<GymCheckInResult> {
    const centerId = new Types.ObjectId(centerIdRaw);
    await this.centersService.assertExists(centerId);

    // Un admin solo puede registrar accesos en los centros que administra;
    // superadmin no tiene restricción (ver PLANNING.md sección 3).
    assertCenterAccess(scannedBy, centerId);

    // Reactivación + vencimiento perezosos (Fase 2 y 4, ver
    // membership-expiration.util.ts) — en ese orden: primero se destraba un
    // congelamiento que ya terminó, y recién después se evalúa si
    // membershipEndDate quedó vencida, así un socio que dejó de pagar hace
    // meses y recién ahora vuelve a pisar el gimnasio no entra "porque nadie
    // lo actualizó".
    await reactivateFrozenMembershipIfNeeded(this.eventModel, member);
    await expireMembershipIfNeeded(this.eventModel, member);

    // Snapshot: se guarda el estado tal cual está ahora, no se recalcula
    // después, para que el historial de accesos no cambie retroactivamente
    // si el socio paga/vence más tarde (ver PLANNING.md sección 2.8).
    // `staff` (membresía sin cargo otorgada por un superadmin) entra igual
    // que `active` — ver GYM_MEMBERSHIP_STATUSES en gym-user.schema.ts.
    const accessGranted = member.membershipStatus === 'active' || member.membershipStatus === 'staff';

    const checkIn = await this.checkInModel.create({
      userId: member._id,
      centerId,
      method,
      scannedByUserId: scannedBy.id,
      membershipStatusAtCheckIn: member.membershipStatus,
      accessGranted,
    });

    return {
      checkInId: checkIn._id.toString(),
      accessGranted,
      member: {
        id: member._id.toString(),
        firstName: member.firstName,
        lastName: member.lastName,
        photoUrl: member.photoUrl,
        membershipStatus: member.membershipStatus,
      },
    };
  }
}
