import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { GYM_ANNOUNCEMENT_TYPES, type GymAnnouncementType } from '../../schemas/gym-announcement.schema.js';

// Todos los campos opcionales a mano (mismo criterio que en el resto del
// proyecto, ver update-product.dto.ts): un PATCH manda cualquier subconjunto.
export class UpdateGymAnnouncementDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsIn(GYM_ANNOUNCEMENT_TYPES)
  type?: GymAnnouncementType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  promoPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  promoDurationDays?: number;

  @IsOptional()
  @IsDateString()
  publishAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
