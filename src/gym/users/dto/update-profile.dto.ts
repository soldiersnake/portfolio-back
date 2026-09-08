import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { GYM_GOALS, type GymGoal } from '../../schemas/gym-user.schema.js';

class GymEmergencyContactDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

// Campos que el propio socio puede editar de su perfil. A propósito NO
// incluye role, accountStatus, registrationSource, membershipPlanId,
// centerId, membershipStatus ni las fechas de membresía — esos los maneja
// un admin (o la lógica de pagos más adelante), nunca el socio directamente.
export class UpdateGymProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => GymEmergencyContactDto)
  emergencyContact?: GymEmergencyContactDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  height?: number;

  @IsOptional()
  @IsIn(GYM_GOALS)
  goal?: GymGoal;
}
