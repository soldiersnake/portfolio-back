import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { GYM_BILLING_CYCLES, type GymBillingCycle } from '../../schemas/gym-membership-plan.schema.js';

// Todos los campos opcionales a mano (mismo criterio que
// tienda-mueble/dto/update-product.dto.ts, sin sumar @nestjs/mapped-types
// solo por esto): un PATCH manda cualquier subconjunto de campos.
export class UpdateGymMembershipPlanDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  price?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsIn(GYM_BILLING_CYCLES)
  billingCycle?: GymBillingCycle;

  @IsOptional()
  @IsBoolean()
  includesPool?: boolean;

  @IsOptional()
  @IsBoolean()
  includesSpa?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  classCreditsPerMonth?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  centerIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
