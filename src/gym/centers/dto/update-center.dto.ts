import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsGoogleMapsUrl, IsSpanishPhone } from './center-field.validation.js';
import { GYM_CENTER_AMENITIES, type GymCenterAmenity } from '../../schemas/gym-center.schema.js';

class GymCenterScheduleSlotDto {
  @IsInt()
  @Min(0)
  @Max(6)
  day!: number;

  @IsString()
  @MinLength(1)
  openTime!: string;

  @IsString()
  @MinLength(1)
  closeTime!: string;
}

// Todos los campos opcionales a mano (mismo criterio que el resto del
// proyecto — ver UpdateGymClassDto). `isActive: false` es la forma de "dar
// de baja" una sede sin borrar el documento (referenciado por socios,
// clases y planes) — no hay DELETE para centros a propósito.
export class UpdateGymCenterDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  @IsSpanishPhone()
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid email address' })
  email?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GymCenterScheduleSlotDto)
  schedule?: GymCenterScheduleSlotDto[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(GYM_CENTER_AMENITIES, { each: true })
  amenities?: GymCenterAmenity[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];

  @IsOptional()
  @IsString()
  @IsGoogleMapsUrl()
  googleMapsUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
