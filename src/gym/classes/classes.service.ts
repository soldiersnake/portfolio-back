import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { assertCenterAccess } from '../auth/centers-access.util.js';
import type { GymRequestUser } from '../auth/gym-request-user.interface.js';
import { GymCentersService } from '../centers/centers.service.js';
import { expireMembershipIfNeeded } from '../common/membership-expiration.util.js';
import { GymNotificationsService } from '../notifications/notifications.service.js';
import { GymImageKitService } from '../users/gym-imagekit.service.js';
import { GymClass, type GymClassDocument, type GymClassSchedule } from '../schemas/gym-class.schema.js';
import {
  GymClassBooking,
  type GymClassBookingDocument,
  type GymClassBookingStatus,
} from '../schemas/gym-class-booking.schema.js';
import { GymMembershipEvent, type GymMembershipEventDocument } from '../schemas/gym-membership-event.schema.js';
import { GymMembershipPlan, type GymMembershipPlanDocument } from '../schemas/gym-membership-plan.schema.js';
import { GymUser, type GymUserDocument } from '../schemas/gym-user.schema.js';
import type { CreateGymClassDto } from './dto/create-class.dto.js';
import type { UpdateGymClassDto } from './dto/update-class.dto.js';
import type { BookGymClassDto } from './dto/book-class.dto.js';
import { GYM_DB_CONNECTION } from '../gym-db.constants.js';

export interface GymClassSummary {
  id: string;
  name: string;
  centerId: string;
  instructorName?: string;
  capacity: number;
  schedule: GymClassSchedule;
  requiresPlanFeature?: string;
  isActive: boolean;
  imageUrl?: string;
}

export interface GymClassAvailability {
  classId: string;
  sessionDate: string;
  capacity: number;
  bookedCount: number;
  waitlistCount: number;
  spotsAvailable: number;
}

export interface GymClassBookingSummary {
  id: string;
  classId: string;
  className?: string;
  centerId?: string;
  sessionDate: string;
  status: GymClassBookingStatus;
  // Copiados del GymClass al momento de reservar/listar — hacen falta para
  // armar el evento de calendario (Google Calendar / .ics) del lado del
  // frontend sin tener que resolver la clase por separado (ver
  // gymbro/frontend/src/lib/calendar.ts).
  startTime?: string;
  endTime?: string;
}

export interface GymClassRosterEntry {
  bookingId: string;
  userId: string;
  firstName: string;
  lastName: string;
  status: GymClassBookingStatus;
}

@Injectable()
export class GymClassesService {
  constructor(
    @InjectModel(GymClass.name, GYM_DB_CONNECTION) private readonly classModel: Model<GymClassDocument>,
    @InjectModel(GymClassBooking.name, GYM_DB_CONNECTION) private readonly bookingModel: Model<GymClassBookingDocument>,
    @InjectModel(GymUser.name, GYM_DB_CONNECTION) private readonly userModel: Model<GymUserDocument>,
    @InjectModel(GymMembershipPlan.name, GYM_DB_CONNECTION) private readonly planModel: Model<GymMembershipPlanDocument>,
    @InjectModel(GymMembershipEvent.name, GYM_DB_CONNECTION) private readonly eventModel: Model<GymMembershipEventDocument>,
    private readonly centersService: GymCentersService,
    private readonly notificationsService: GymNotificationsService,
    private readonly imageKitService: GymImageKitService,
  ) {}

  // Lo que ve el socio al elegir clase: solo activas, opcionalmente
  // filtradas por sede (el frontend ya conoce el centerId del socio).
  async listActive(centerId?: string): Promise<GymClassSummary[]> {
    const filter: Record<string, unknown> = { isActive: true };
    if (centerId) {
      filter.centerId = new Types.ObjectId(centerId);
    }
    const classes = await this.classModel.find(filter).sort({ name: 1 });
    return classes.map((gymClass) => this.toClassSummary(gymClass));
  }

  // Panel admin: incluye inactivas, scoping igual que memberships/plans —
  // admin ve solo sus propios centros, superadmin ve todo.
  async listAllForAdmin(admin: GymRequestUser): Promise<GymClassSummary[]> {
    const filter = admin.role === 'admin' ? { centerId: { $in: admin.managedCenterIds } } : {};
    const classes = await this.classModel.find(filter).sort({ name: 1 });
    return classes.map((gymClass) => this.toClassSummary(gymClass));
  }

  async findById(id: string): Promise<GymClassSummary> {
    const gymClass = await this.classModel.findById(id);
    if (!gymClass) {
      throw new NotFoundException('Class not found.');
    }
    return this.toClassSummary(gymClass);
  }

  async create(admin: GymRequestUser, dto: CreateGymClassDto): Promise<GymClassSummary> {
    const centerId = new Types.ObjectId(dto.centerId);
    await this.centersService.assertExists(centerId);
    assertCenterAccess(admin, centerId);

    const created = await this.classModel.create({
      name: dto.name,
      centerId,
      instructorName: dto.instructorName,
      capacity: dto.capacity,
      schedule: dto.schedule,
      requiresPlanFeature: dto.requiresPlanFeature,
      isActive: dto.isActive ?? true,
    });

    return this.toClassSummary(created);
  }

  async update(admin: GymRequestUser, id: string, dto: UpdateGymClassDto): Promise<GymClassSummary> {
    const gymClass = await this.classModel.findById(id);
    if (!gymClass) {
      throw new NotFoundException('Class not found.');
    }
    assertCenterAccess(admin, gymClass.centerId);

    if (dto.name !== undefined) gymClass.name = dto.name;
    if (dto.instructorName !== undefined) gymClass.instructorName = dto.instructorName;
    if (dto.capacity !== undefined) gymClass.capacity = dto.capacity;
    if (dto.schedule !== undefined) gymClass.schedule = dto.schedule;
    if (dto.requiresPlanFeature !== undefined) gymClass.requiresPlanFeature = dto.requiresPlanFeature;
    if (dto.isActive !== undefined) gymClass.isActive = dto.isActive;

    await gymClass.save();
    return this.toClassSummary(gymClass);
  }

  // Cancela en cascada las reservas futuras (booked/waitlisted) antes de
  // borrar la clase, para no dejar bookings huérfanos apuntando a un
  // classId que ya no existe.
  async remove(admin: GymRequestUser, id: string): Promise<void> {
    const gymClass = await this.classModel.findById(id);
    if (!gymClass) {
      throw new NotFoundException('Class not found.');
    }
    assertCenterAccess(admin, gymClass.centerId);

    await this.bookingModel.updateMany(
      { classId: gymClass._id, status: { $in: ['booked', 'waitlisted'] } },
      { status: 'cancelled' },
    );
    await this.classModel.deleteOne({ _id: gymClass._id });
  }

  // Subida de la foto ilustrativa de la clase — endpoint aparte del PATCH
  // general, mismo criterio que GymUsersService.updateProfilePhoto (Multer
  // no viaja bien mezclado con un body JSON de otros campos).
  async updateClassImage(admin: GymRequestUser, id: string, file?: Express.Multer.File): Promise<GymClassSummary> {
    if (!file) {
      throw new BadRequestException('No image file was provided.');
    }

    const gymClass = await this.classModel.findById(id);
    if (!gymClass) {
      throw new NotFoundException('Class not found.');
    }
    assertCenterAccess(admin, gymClass.centerId);

    gymClass.imageUrl = await this.imageKitService.uploadClassImage(file);
    await gymClass.save();
    return this.toClassSummary(gymClass);
  }

  async getAvailability(classId: string, sessionDateRaw: string): Promise<GymClassAvailability> {
    const gymClass = await this.classModel.findById(classId);
    if (!gymClass) {
      throw new NotFoundException('Class not found.');
    }
    const sessionDate = new Date(sessionDateRaw);
    const [bookedCount, waitlistCount] = await Promise.all([
      this.bookingModel.countDocuments({ classId: gymClass._id, sessionDate, status: 'booked' }),
      this.bookingModel.countDocuments({ classId: gymClass._id, sessionDate, status: 'waitlisted' }),
    ]);

    return {
      classId: gymClass._id.toString(),
      sessionDate: sessionDate.toISOString(),
      capacity: gymClass.capacity,
      bookedCount,
      waitlistCount,
      spotsAvailable: Math.max(0, gymClass.capacity - bookedCount),
    };
  }

  // Lista de asistentes/lista de espera de un turno puntual, para que
  // recepción sepa a quién esperar (o a quién avisar si hay que cancelar la
  // clase). Scoping por centro igual que el resto del panel admin.
  async listRoster(admin: GymRequestUser, classId: string, sessionDateRaw: string): Promise<GymClassRosterEntry[]> {
    const gymClass = await this.classModel.findById(classId);
    if (!gymClass) {
      throw new NotFoundException('Class not found.');
    }
    assertCenterAccess(admin, gymClass.centerId);

    const sessionDate = new Date(sessionDateRaw);
    const bookings = await this.bookingModel
      .find({ classId: gymClass._id, sessionDate, status: { $in: ['booked', 'waitlisted', 'attended'] } })
      .sort({ status: 1, createdAt: 1 })
      .populate('userId', 'firstName lastName');

    return bookings.map((booking) => {
      const member = booking.userId as unknown as GymUserDocument;
      return {
        bookingId: booking._id.toString(),
        userId: member._id.toString(),
        firstName: member.firstName,
        lastName: member.lastName,
        status: booking.status,
      };
    });
  }

  // Reserva de un socio para un turno puntual — acá vive el cupo + lista de
  // espera (ver PLANNING.md sección 5, roadmap Fase 3).
  async bookClass(user: GymRequestUser, dto: BookGymClassDto): Promise<GymClassBookingSummary> {
    const gymClass = await this.classModel.findById(dto.classId);
    if (!gymClass || !gymClass.isActive) {
      throw new NotFoundException('Class not found.');
    }

    const sessionDate = new Date(dto.sessionDate);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    if (sessionDate < startOfToday) {
      throw new BadRequestException('No se puede reservar una clase en una fecha pasada.');
    }

    const member = await this.userModel.findById(user.id);
    if (!member) {
      throw new NotFoundException('Member not found.');
    }

    // Mismo chequeo perezoso de vencimiento que checkins/dashboard/payments
    // (ver common/membership-expiration.util.ts) — así un socio que dejó de
    // pagar hace tiempo no puede seguir reservando clases aunque nadie haya
    // hecho check-in todavía para reflejarlo.
    await expireMembershipIfNeeded(this.eventModel, member);
    // `staff` (membresía sin cargo otorgada por un superadmin) da acceso
    // igual que `active` — ver GYM_MEMBERSHIP_STATUSES en gym-user.schema.ts.
    if (member.membershipStatus !== 'active' && member.membershipStatus !== 'staff') {
      throw new ForbiddenException('Necesitás una membresía activa para reservar clases.');
    }

    const plan = member.membershipPlanId ? await this.planModel.findById(member.membershipPlanId) : null;

    if (gymClass.requiresPlanFeature) {
      const hasFeature =
        gymClass.requiresPlanFeature === 'pool'
          ? Boolean(plan?.includesPool)
          : gymClass.requiresPlanFeature === 'spa'
            ? Boolean(plan?.includesSpa)
            : false;
      if (!hasFeature) {
        throw new ForbiddenException('Tu plan actual no incluye esta clase.');
      }
    }

    if (plan && plan.classCreditsPerMonth !== null) {
      const monthStart = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), 1);
      const monthEnd = new Date(sessionDate.getFullYear(), sessionDate.getMonth() + 1, 1);
      const usedCredits = await this.bookingModel.countDocuments({
        userId: member._id,
        status: { $in: ['booked', 'attended'] },
        sessionDate: { $gte: monthStart, $lt: monthEnd },
      });
      if (usedCredits >= plan.classCreditsPerMonth) {
        throw new ForbiddenException('Alcanzaste el límite de clases de tu plan para este mes.');
      }
    }

    const existing = await this.bookingModel.findOne({
      classId: gymClass._id,
      userId: member._id,
      sessionDate,
      status: { $in: ['booked', 'waitlisted'] },
    });
    if (existing) {
      throw new BadRequestException('Ya tenés una reserva para esta clase.');
    }

    const bookedCount = await this.bookingModel.countDocuments({
      classId: gymClass._id,
      sessionDate,
      status: 'booked',
    });
    const status: GymClassBookingStatus = bookedCount < gymClass.capacity ? 'booked' : 'waitlisted';

    const booking = await this.bookingModel.create({
      classId: gymClass._id,
      userId: member._id,
      sessionDate,
      status,
    });

    return {
      id: booking._id.toString(),
      classId: gymClass._id.toString(),
      className: gymClass.name,
      centerId: gymClass.centerId.toString(),
      sessionDate: sessionDate.toISOString(),
      status,
      startTime: gymClass.schedule.startTime,
      endTime: gymClass.schedule.endTime,
    };
  }

  // Cancela una reserva propia (socio) o ajena (admin/superadmin, scoping
  // por centro). Si la reserva cancelada tenía un cupo real ('booked'), se
  // promueve automáticamente al primero de la lista de espera y se le avisa
  // por push/email (ver GymNotificationsService.notifyClassSpotAvailable) —
  // esto es la "lista de espera" del roadmap, no solo un estado inerte.
  async cancelBooking(user: GymRequestUser, bookingId: string): Promise<GymClassBookingSummary> {
    const booking = await this.bookingModel.findById(bookingId);
    if (!booking) {
      throw new NotFoundException('Booking not found.');
    }

    const gymClass = await this.classModel.findById(booking.classId);
    if (!gymClass) {
      throw new NotFoundException('Class not found.');
    }

    if (user.role === 'member') {
      if (!booking.userId.equals(user.id)) {
        throw new ForbiddenException('You do not have access to this booking.');
      }
    } else {
      assertCenterAccess(user, gymClass.centerId);
    }

    if (booking.status !== 'booked' && booking.status !== 'waitlisted') {
      throw new BadRequestException('Esta reserva ya no está activa.');
    }

    const freedSpot = booking.status === 'booked';
    booking.status = 'cancelled';
    await booking.save();

    if (freedSpot) {
      const promoted = await this.bookingModel
        .findOneAndUpdate(
          { classId: booking.classId, sessionDate: booking.sessionDate, status: 'waitlisted' },
          { status: 'booked' },
          { sort: { createdAt: 1 }, new: true },
        )
        .populate('userId', 'firstName lastName email pushSubscriptions');

      if (promoted) {
        try {
          await this.notificationsService.notifyClassSpotAvailable(promoted, gymClass);
        } catch {
          // Un fallo al notificar no debería hacer fallar la cancelación —
          // el cupo ya se liberó y se promovió correctamente en la DB.
        }
      }
    }

    return {
      id: booking._id.toString(),
      classId: booking.classId.toString(),
      sessionDate: booking.sessionDate.toISOString(),
      status: booking.status,
      startTime: gymClass.schedule.startTime,
      endTime: gymClass.schedule.endTime,
    };
  }

  async listMyBookings(user: GymRequestUser): Promise<GymClassBookingSummary[]> {
    const bookings = await this.bookingModel
      .find({ userId: user.id, status: { $ne: 'cancelled' } })
      .sort({ sessionDate: -1 })
      .populate('classId', 'name centerId schedule');

    return bookings.map((booking) => {
      const gymClass = booking.classId as unknown as GymClassDocument;
      const isPopulated = gymClass && typeof gymClass === 'object' && 'name' in gymClass;
      return {
        id: booking._id.toString(),
        classId: isPopulated ? gymClass._id.toString() : (booking.classId as unknown as Types.ObjectId).toString(),
        className: isPopulated ? gymClass.name : undefined,
        centerId: isPopulated ? gymClass.centerId?.toString() : undefined,
        sessionDate: booking.sessionDate.toISOString(),
        status: booking.status,
        startTime: isPopulated ? gymClass.schedule.startTime : undefined,
        endTime: isPopulated ? gymClass.schedule.endTime : undefined,
      };
    });
  }

  private toClassSummary(gymClass: GymClassDocument): GymClassSummary {
    return {
      id: gymClass._id.toString(),
      name: gymClass.name,
      centerId: gymClass.centerId.toString(),
      instructorName: gymClass.instructorName,
      capacity: gymClass.capacity,
      schedule: gymClass.schedule,
      requiresPlanFeature: gymClass.requiresPlanFeature,
      isActive: gymClass.isActive,
      imageUrl: gymClass.imageUrl,
    };
  }
}
