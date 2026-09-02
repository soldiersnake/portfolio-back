import { IsBoolean, IsIn, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { PRODUCT_CATEGORIES, type ProductCategory } from '../schemas/product.schema.js';

export class CreateProductDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsIn(PRODUCT_CATEGORIES)
  category!: ProductCategory;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  tagline!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(3000)
  description!: string;

  // Llega como multipart/form-data (junto con la imagen), por eso el
  // @Type(() => Number): todos los campos del form llegan como string.
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Max(1_000_000)
  price!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10_000)
  stock!: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  featured?: boolean;
}
