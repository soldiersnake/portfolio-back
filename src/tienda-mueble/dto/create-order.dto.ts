import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

// Códigos postales españoles: 5 dígitos, los dos primeros son el código de
// provincia del INE (01-52, sin huecos: incluye Ceuta=51 y Melilla=52). No
// hace falta la tabla completa de provincias acá (eso vive en el frontend,
// para mostrarla en el formulario) — alcanza con este rango para rechazar
// códigos con formato inválido.
const SPANISH_POSTAL_CODE_REGEX = /^(0[1-9]|[1-4]\d|5[0-2])\d{3}$/;

// Móviles españoles: 9 dígitos, empiezan con 6 o 7, con o sin prefijo +34.
const SPANISH_MOBILE_REGEX = /^(?:\+34)?[67]\d{8}$/;

export class TiendaMuebleOrderItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  productId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsNumber()
  @IsPositive()
  @Max(1_000_000)
  price!: number;

  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  image?: string;
}

export class CreateTiendaMuebleOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TiendaMuebleOrderItemDto)
  items!: TiendaMuebleOrderItemDto[];

  // Datos de envío: sin esto no hay forma de coordinar la entrega, así que
  // son obligatorios para poder generar la sesión de pago.
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  shippingAddress!: string;

  @IsString()
  @Matches(SPANISH_POSTAL_CODE_REGEX, { message: 'postalCode debe ser un código postal español válido (5 dígitos)' })
  postalCode!: string;

  @IsString()
  @Matches(SPANISH_MOBILE_REGEX, { message: 'phone debe ser un móvil español válido (9 dígitos, empieza con 6 o 7)' })
  phone!: string;
}
