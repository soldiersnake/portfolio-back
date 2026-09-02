import { IsBoolean, IsIn, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { PRODUCT_CATEGORIES, type ProductCategory } from '../schemas/product.schema.js';

// Todos los campos opcionales a mano (en vez de PartialType de
// @nestjs/mapped-types, para no sumar una dependencia extra solo por esto):
// un PATCH puede mandar cualquier subconjunto de campos.
export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(PRODUCT_CATEGORIES)
  category?: ProductCategory;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  tagline?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(3000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Max(1_000_000)
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10_000)
  stock?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  featured?: boolean;
}
