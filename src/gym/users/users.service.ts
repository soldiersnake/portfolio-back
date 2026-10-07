import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { QueryFilter } from 'mongoose';
import { Model, Types } from 'mongoose';
import { EmailService } from '../../email/email.service.js';
import { generateOpaqueToken } from '../common/tokens.util.js';
import { assertCenterAccess } from '../auth/centers-access.util.js';
import { GymCentersService } from '../centers/centers.service.js';
import { expireMembershipIfNeeded, reactivateFrozenMembershipIfNeeded } from '../common/membership-expiration.util.js';
import { GymMembershipEvent, type GymMembershipEventDocument } from '../schemas/gym-membership-event.schema.js';
import { GYM_MEMBERSHIP_STATUSES, GymUser, type GymMembershipStatus, type GymUserDocument } from '../schemas/gym-user.schema.js';
import { GymWeightLog, type GymWeightLogDocument } from '../schemas/gym-weight-log.schema.js';
import type { GymPublicUser } from '../auth/gym-auth.service.js';
import type { GymRequestUser } from '../auth/gym-request-user.interface.js';
import type { CreateGymMemberByAdminDto } from './dto/create-member-by-admin.dto.js';
import type { UpdateGymProfileDto } from './dto/update-profile.dto.js';
import type { AddGymWeightLogDto } from './dto/add-weight-log.dto.js';
import type { UpdateGymMemberRoleDto } from './dto/update-member-role.dto.js';
import { GymImageKitService } from './gym-imagekit.service.js';
import { GYM_DB_CONNECTION } from '../gym-db.constants.js';

// Cuánto tiempo queda vivo el link de invitación mandado por mail al socio
// dado de alta manualmente por un admin (ver createByAdmin más abajo).
const INVITE_TOKEN_TTL_DAYS = 7;

// Perfil completo devuelto en /gym/users/me — más completo que GymPublicUser
// (el que se devuelve en login/registro), porque acá sí tiene sentido
// exponer los datos de perfil/membresía completos al propio dueño de la
// cuenta. Nunca incluye passwordHash/inviteToken (select: false en el schema).
export interface GymUserProfile extends GymPublicUser {
  phone?: string;
  birthDate?: Date;
  emergencyContact?: { name?: string; phone?: string };
  height?: number;
  currentWeight?: number;
  goal?: string;
  centerId?: string;
  membershipPlanId?: string;
  membershipStartDate?: Date;
  membershipEndDate?: Date;
  preferredPaymentMethod?: string;
  registrationSource: string;
}

export interface GymWeightLogEntry {
  id: string;
  weight: number;
  recordedAt: Date;
  note?: string;
}

export interface GymCreateMemberResult {
  user: GymUserProfile;
  inviteEmailSent: boolean;
}

// Fila resumida para el listado de "Gestión de afiliados" — más liviana que
// GymUserProfile (sin peso/objetivo/emergencia, que solo hacen falta en la
// ficha individual).
export interface GymMemberSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  photoUrl?: string;
  role: string;
  accountStatus: string;
  membershipStatus: string;
  centerId?: string;
  membershipPlanId?: string;
  phone?: string;
}

// Fila para "Gestión de admins" (solo superadmin) — el dato clave acá es
// managedCenterIds, que no aparece en GymMemberSummary porque a un socio
// normal no le aplica.
export interface GymAdminSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  photoUrl?: string;
  role: string;
  managedCenterIds: string[];
}

@Injectable()
export class GymUsersService {
  private readonly logger = new Logger(GymUsersService.name);

  constructor(
    @InjectModel(GymUser.name, GYM_DB_CONNECTION) private readonly userModel: Model<GymUserDocument>,
    @InjectModel(GymWeightLog.name, GYM_DB_CONNECTION) private readonly weightLogModel: Model<GymWeightLogDocument>,
    @InjectModel(GymMembershipEvent.name, GYM_DB_CONNECTION) private readonly eventModel: Model<GymMembershipEventDocument>,
    private readonly emailService: EmailService,
    private readonly imagekit: GymImageKitService,
    private readonly centersService: GymCentersService,
  ) {}

  // Recalcula el vencimiento acá también (no solo en check-ins/clases/
  // dashboard, ver membership-expiration.util.ts): es la pantalla que el
  // socio más mira ("Mi membresía"/Home vía AppLayout), así que sin esto
  // podía seguir viendo "Activa" varios días después de vencer si no había
  // ido al gimnasio ni reservado ninguna clase mientras tanto.
  async getProfile(userId: Types.ObjectId): Promise<GymUserProfile> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    await reactivateFrozenMembershipIfNeeded(this.eventModel, user);
    await expireMembershipIfNeeded(this.eventModel, user);
    return this.toProfile(user);
  }

  async updateProfile(userId: Types.ObjectId, dto: UpdateGymProfileDto): Promise<GymUserProfile> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;
    if (dto.photoUrl !== undefined) user.photoUrl = dto.photoUrl;
    if (dto.birthDate !== undefined) user.birthDate = new Date(dto.birthDate);
    if (dto.phone !== undefined) user.phone = dto.phone;
    if (dto.emergencyContact !== undefined) user.emergencyContact = dto.emergencyContact;
    if (dto.height !== undefined) user.height = dto.height;
    if (dto.goal !== undefined) user.goal = dto.goal;

    await user.save();
    return this.toProfile(user);
  }

  // Endpoint separado de updateProfile (POST .../me/photo, multipart) en vez
  // de meter el archivo dentro del PATCH general: UpdateGymProfileDto tiene
  // campos anidados (emergencyContact) que no viajan bien como multipart
  // FormData sin parseo extra, así que se resuelve como una acción puntual
  // (mismo criterio que regenerateQrCode) — el frontend sube la foto acá
  // primero y manda el photoUrl resultante en el PATCH normal si hace falta.
  async updateProfilePhoto(userId: Types.ObjectId, file?: Express.Multer.File): Promise<GymUserProfile> {
    if (!file) {
      throw new BadRequestException('No image file was provided.');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    user.photoUrl = await this.imagekit.uploadProfilePhoto(file);
    await user.save();
    return this.toProfile(user);
  }

  // Guarda un punto de historial Y actualiza el denormalizado
  // GymUser.currentWeight (ver comentario en el schema) para que el perfil
  // no tenga que recalcularlo consultando el último GymWeightLog.
  async addWeightLog(userId: Types.ObjectId, dto: AddGymWeightLogDto): Promise<GymWeightLogEntry> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const recordedAt = dto.recordedAt ? new Date(dto.recordedAt) : new Date();

    // Se busca el último registro ANTES de insertar el nuevo, para poder
    // decidir si este pisa el denormalizado GymUser.currentWeight — evita
    // que cargar un peso viejo (retroactivo) desactualice el valor "actual"
    // mostrado en el perfil si ya existe un registro más reciente.
    const latestExisting = await this.weightLogModel.findOne({ userId }).sort({ recordedAt: -1 });

    const log = await this.weightLogModel.create({
      userId,
      weight: dto.weight,
      recordedAt,
      note: dto.note,
    });

    if (!latestExisting || recordedAt >= latestExisting.recordedAt) {
      user.currentWeight = dto.weight;
      await user.save();
    }

    return {
      id: log._id.toString(),
      weight: log.weight,
      recordedAt: log.recordedAt,
      note: log.note,
    };
  }

  async listWeightLogs(userId: Types.ObjectId): Promise<GymWeightLogEntry[]> {
    const logs = await this.weightLogModel.find({ userId }).sort({ recordedAt: 1 });
    return logs.map((log) => ({
      id: log._id.toString(),
      weight: log.weight,
      recordedAt: log.recordedAt,
      note: log.note,
    }));
  }

  async regenerateQrCode(userId: Types.ObjectId): Promise<{ qrCodeToken: string }> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    user.qrCodeToken = generateOpaqueToken();
    await user.save();
    return { qrCodeToken: user.qrCodeToken };
  }

  // Alta manual desde "Gestión de afiliados" (admin/superadmin, ver
  // RolesGuard en el controller). A diferencia del autoregistro, no hay
  // contraseña todavía: se crea en accountStatus = 'pending_invite' y se
  // dispara un mail con un link de inviteToken (ver EmailService.sendGymInviteEmail)
  // para que el socio complete su acceso cuando quiera. El qrCodeToken se
  // genera igual, sin depender de que acepte la invitación — ver
  // PLANNING.md sección 3.
  //
  // dto.role/dto.managedCenterIds: reutiliza este mismo endpoint para el
  // alta de un admin nuevo desde "Gestión de admins" (solo superadmin, ver
  // controller) en vez de duplicar el flujo de invitación por mail — un
  // admin normal que intente mandar estos campos se rechaza acá, no solo se
  // ignora, para que el error sea explícito en vez de un alta silenciosa
  // como 'member'.
  async createByAdmin(dto: CreateGymMemberByAdminDto, admin: GymRequestUser): Promise<GymCreateMemberResult> {
    const email = dto.email.toLowerCase();
    const existing = await this.userModel.exists({ email });
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    const role = dto.role ?? 'member';
    if (role !== 'member' && admin.role !== 'superadmin') {
      throw new ForbiddenException('Solo un superadmin puede dar de alta a otro admin.');
    }

    let managedCenterIds: Types.ObjectId[] = [];
    if (role === 'admin' || role === 'recepcion') {
      managedCenterIds = await this.resolveManagedCenterIds(dto.managedCenterIds);
    }

    if (dto.centerId) {
      const centerId = new Types.ObjectId(dto.centerId);
      await this.centersService.assertExists(centerId);
      if (admin.role === 'admin' || admin.role === 'recepcion') {
        assertCenterAccess(admin, centerId);
      }
    }

    const inviteToken = generateOpaqueToken();
    const inviteTokenExpiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    const created = await this.userModel.create({
      email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      centerId: dto.centerId ? new Types.ObjectId(dto.centerId) : undefined,
      membershipPlanId: dto.membershipPlanId ? new Types.ObjectId(dto.membershipPlanId) : undefined,
      role,
      managedCenterIds,
      registrationSource: 'admin',
      createdByUserId: admin.id,
      accountStatus: 'pending_invite',
      qrCodeToken: generateOpaqueToken(),
      inviteToken,
      inviteTokenExpiresAt,
      invitedAt: new Date(),
    });

    const inviteEmailSent = await this.emailService.sendGymInviteEmail({
      email: created.email,
      firstName: created.firstName,
      inviteToken,
    });

    if (!inviteEmailSent) {
      this.logger.warn(`Invite email could not be sent to ${created.email} (member created regardless).`);
    }

    return { user: this.toProfile(created), inviteEmailSent };
  }

  // Listado/búsqueda para "Gestión de afiliados" (admin/superadmin, ver
  // controller). `admin` solo ve socios de sus propios centros — si no manda
  // `centerId` se filtra automáticamente por managedCenterIds; si lo manda,
  // se valida que sea uno de los suyos. `superadmin` ve todo, opcionalmente
  // acotado por `centerId`. Sin paginación por ahora (ver clases/planes,
  // mismo criterio) — 200 resultados de tope para no tirar un find() sin
  // límite si la base crece.
  async listMembers(
    admin: GymRequestUser,
    query: { search?: string; centerId?: string; status?: string },
  ): Promise<GymMemberSummary[]> {
    const filter: QueryFilter<GymUserDocument> = {};

    if (query.centerId) {
      const centerId = new Types.ObjectId(query.centerId);
      if (admin.role === 'admin' || admin.role === 'recepcion') {
        assertCenterAccess(admin, centerId);
      }
      filter.centerId = centerId;
    } else if (admin.role === 'admin' || admin.role === 'recepcion') {
      filter.centerId = { $in: admin.managedCenterIds };
    }

    // Se valida contra GYM_MEMBERSHIP_STATUSES en vez de castear directo:
    // un valor de query inválido se ignora (sin filtrar) en lugar de romper
    // la búsqueda con un 500 — mismo criterio permisivo que el resto de los
    // filtros opcionales de este endpoint.
    if (query.status && (GYM_MEMBERSHIP_STATUSES as readonly string[]).includes(query.status)) {
      filter.membershipStatus = query.status as GymMembershipStatus;
    }

    if (query.search) {
      const regex = new RegExp(escapeRegex(query.search.trim()), 'i');
      filter.$or = [{ firstName: regex }, { lastName: regex }, { email: regex }];
    }

    const users = await this.userModel.find(filter).sort({ firstName: 1, lastName: 1 }).limit(200);
    return users.map((user) => this.toMemberSummary(user));
  }

  // Ficha individual de un socio (ver PLANNING.md sección 4, "listado,
  // filtros, ficha") — misma forma que GET /gym/users/me pero para un socio
  // ajeno, con el scoping de centro correspondiente.
  async getMemberById(admin: GymRequestUser, id: string): Promise<GymUserProfile> {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('Member not found.');
    }
    if (admin.role === 'admin') {
      if (!user.centerId) {
        throw new ForbiddenException('You do not have access to this member.');
      }
      assertCenterAccess(admin, user.centerId);
    }
    return this.toProfile(user);
  }

  // "Gestión de admins" (solo superadmin, ver controller) — trae admin +
  // superadmin + recepción, nunca members (esos se ven/gestionan desde
  // "Gestión de afiliados").
  async listAdmins(): Promise<GymAdminSummary[]> {
    const admins = await this.userModel
      .find({ role: { $in: ['admin', 'superadmin', 'recepcion'] } })
      .sort({ firstName: 1 });
    return admins.map((admin) => this.toAdminSummary(admin));
  }

  // Promueve/degrada el rol de un usuario y (re)asigna sus centros
  // gestionados — único punto donde se puede convertir un member en admin
  // (fuera del alta con dto.role en createByAdmin) o quitarle el rol a un
  // admin existente. Un superadmin no puede tocar su propio rol acá para
  // evitar quedarse sin acceso por error — eso requiere que otro superadmin
  // lo haga.
  async updateMemberRole(
    admin: GymRequestUser,
    targetUserId: string,
    dto: UpdateGymMemberRoleDto,
  ): Promise<GymAdminSummary> {
    if (targetUserId === admin.id.toString()) {
      throw new ForbiddenException('No podés cambiar tu propio rol — pedile a otro superadmin que lo haga.');
    }

    const user = await this.userModel.findById(targetUserId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const managedCenterIds =
      dto.role === 'admin' || dto.role === 'recepcion'
        ? await this.resolveManagedCenterIds(dto.managedCenterIds)
        : [];

    user.role = dto.role;
    user.managedCenterIds = managedCenterIds;
    await user.save();
    return this.toAdminSummary(user);
  }

  // Compartido por createByAdmin (alta de un admin nuevo) y updateMemberRole
  // (promoción de un member existente): un admin siempre necesita al menos
  // un centro real para poder operar (mismo criterio que
  // MembershipsService.resolveAndAuthorizeCenterIds para planes acotados).
  private async resolveManagedCenterIds(centerIds: string[] | undefined): Promise<Types.ObjectId[]> {
    if (!centerIds || centerIds.length === 0) {
      throw new BadRequestException('Un admin o recepción necesita al menos un centro asignado.');
    }

    const resolved = centerIds.map((id) => new Types.ObjectId(id));
    for (const centerId of resolved) {
      await this.centersService.assertExists(centerId);
    }
    return resolved;
  }

  private toMemberSummary(user: GymUserDocument): GymMemberSummary {
    return {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      photoUrl: user.photoUrl,
      role: user.role,
      accountStatus: user.accountStatus,
      membershipStatus: user.membershipStatus,
      centerId: user.centerId?.toString(),
      membershipPlanId: user.membershipPlanId?.toString(),
      phone: user.phone,
    };
  }

  private toAdminSummary(user: GymUserDocument): GymAdminSummary {
    return {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      photoUrl: user.photoUrl,
      role: user.role,
      managedCenterIds: user.managedCenterIds.map((id) => id.toString()),
    };
  }

  private toProfile(user: GymUserDocument): GymUserProfile {
    return {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      accountStatus: user.accountStatus,
      membershipStatus: user.membershipStatus,
      qrCodeToken: user.qrCodeToken,
      photoUrl: user.photoUrl,
      phone: user.phone,
      birthDate: user.birthDate,
      emergencyContact: user.emergencyContact
        ? { name: user.emergencyContact.name, phone: user.emergencyContact.phone }
        : undefined,
      height: user.height,
      currentWeight: user.currentWeight,
      goal: user.goal,
      centerId: user.centerId?.toString(),
      membershipPlanId: user.membershipPlanId?.toString(),
      membershipStartDate: user.membershipStartDate,
      membershipEndDate: user.membershipEndDate,
      preferredPaymentMethod: user.preferredPaymentMethod,
      registrationSource: user.registrationSource,
    };
  }
}

// Escapa caracteres especiales de regex antes de meter un texto de búsqueda
// libre (query.search) en un `new RegExp(...)` — sin esto, un socio buscando
// "a.b" o mandando un paréntesis suelto podría romper la query o (en el peor
// caso) armar un patrón costoso.
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
