import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
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

// Todos los campos opcionales a mano (mismo criterio que en el resto del
// proyecto): un PATCH manda cualquier subconjunto. centerId no es editable a
// propósito — mover una clase de sede es lo bastante raro/disruptivo (rompe
// reservas ya hechas) como para tratarlo como "borrar y crear de nuevo" en
// vez de un update silencioso.
export class UpdateGymClassDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  instructorName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => GymClassScheduleDto)
  schedule?: GymClassScheduleDto;

  @IsOptional()
  @IsIn(['pool', 'spa'])
  requiresPlanFeature?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
