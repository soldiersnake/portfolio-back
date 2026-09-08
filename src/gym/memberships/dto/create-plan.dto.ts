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

// Alta de un plan (solo admin/superadmin, ver memberships.controller.ts).
export class CreateGymMembershipPlanDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @IsPositive()
  price!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsIn(GYM_BILLING_CYCLES)
  billingCycle!: GymBillingCycle;

  @IsOptional()
  @IsBoolean()
  includesPool?: boolean;

  @IsOptional()
  @IsBoolean()
  includesSpa?: boolean;

  // null = ilimitado; undefined = no se manda (el schema no le pone default
  // más que null). Se acepta explícitamente `null` desde el body.
  @IsOptional()
  @IsNumber()
  @Min(0)
  classCreditsPerMonth?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  centerIds?: string[];
}
