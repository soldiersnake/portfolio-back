import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

class GymClassScheduleDto {
  @IsInt()
  @Min(0)
  @Max(6)
  day!: number;

  @IsString()
  @MinLength(1)
  startTime!: string;

  @IsString()
  @MinLength(1)
  endTime!: string;
}

// Alta de una clase (definición + horario recurrente, ej. "Spinning" los
// lunes 18-19hs) — solo admin/superadmin, scoping por centro igual que
// memberships/plans (ver GymClassesService.create).
export class CreateGymClassDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsMongoId()
  centerId!: string;

  @IsOptional()
  @IsString()
  instructorName?: string;

  @IsInt()
  @Min(1)
  capacity!: number;

  @ValidateNested()
  @Type(() => GymClassScheduleDto)
  schedule!: GymClassScheduleDto;

  // 'pool' | 'spa' — se valida contra includesPool/includesSpa del plan del
  // socio al reservar (ver GymClassesService.bookClass). Sin enum estricto
  // acá a propósito: si más adelante se suma otro feature del plan, no hace
  // falta tocar el DTO, solo el mapeo en el service.
  @IsOptional()
  @IsIn(['pool', 'spa'])
  requiresPlanFeature?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
