import { IsArray, IsEmail, IsIn, IsMongoId, IsOptional, IsString, MinLength } from 'class-validator';
import { GYM_ROLES, type GymRole } from '../../schemas/gym-user.schema.js';

// Alta manual de un socio por un admin/recepción (registrationSource =
// 'admin', accountStatus = 'pending_invite' — ver GymUsersService.createByAdmin
// y PLANNING.md sección 3). Sin contraseña: el socio la elige (o vincula
// Google) al aceptar el mail de invitación.
//
// centerId/membershipPlanId son opcionales por ahora: los submódulos
// centers/ y memberships/ todavía no existen (van en la "segunda tanda" del
// scaffolding), pero el campo ya vive en GymUser así que se acepta desde ya
// si el admin conoce el ObjectId — el frontend los va a completar con un
// selector recién cuando esos CRUDs existan.
//
// role/managedCenterIds: reutilizado por "Gestión de admins" para dar de
// alta un admin nuevo con el mismo flujo de invitación por mail — el service
// rechaza estos campos si quien pide el alta no es superadmin (ver
// GymUsersService.createByAdmin).
export class CreateGymMemberByAdminDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsMongoId()
  centerId?: string;

  @IsOptional()
  @IsMongoId()
  membershipPlanId?: string;

  @IsOptional()
  @IsIn(GYM_ROLES)
  role?: GymRole;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  managedCenterIds?: string[];
}
