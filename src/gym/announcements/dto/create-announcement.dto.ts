import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { GYM_ANNOUNCEMENT_TYPES, type GymAnnouncementType } from '../../schemas/gym-announcement.schema.js';

// Alta de un anuncio/promo (solo admin/superadmin). Fase 1: solo se muestra
// dentro de la app (dashboard/listado de anuncios) — el envío real de push +
// email (ver notifyPush/notifyEmail en el schema) queda para la Fase 3 (ver
// PLANNING.md sección 5), así que por ahora este DTO no los expone: se
// guardan en `false` desde el service.
export class CreateGymAnnouncementDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsIn(GYM_ANNOUNCEMENT_TYPES)
  type!: GymAnnouncementType;

  // Solo tiene sentido si type = 'promo' — no se valida la combinación acá a
  // propósito (queda para cuando el frontend construya el formulario), el
  // service simplemente guarda lo que llegue.
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
