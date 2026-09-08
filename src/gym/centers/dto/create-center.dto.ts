import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
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

// Alta de una sede nueva (solo superadmin, ver centers.controller.ts — en el
// MVP los 3 centros están hardcodeados vía seed script, esto reemplaza ese
// hardcode para cuando se sume una sede más — ver PLANNING.md sección 2.3 y
// Fase 4 del roadmap). Sin `photos` con upload propio por ahora: se acepta
// una lista de URLs a mano (mismo criterio que `imageUrl` en anuncios antes
// de sumar upload — el admin puede subir a ImageKit desde afuera y pegar el
// link, o se suma upload dedicado más adelante si hace falta).
export class CreateGymCenterDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
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

  // Link de Google Maps de la sede (ver comentario en gym-center.schema.ts)
  // — sin validación de formato estricta a propósito, puede ser un link
  // corto o largo, ambos sirven igual como <a href>.
  @IsOptional()
  @IsString()
  googleMapsUrl?: string;
}
