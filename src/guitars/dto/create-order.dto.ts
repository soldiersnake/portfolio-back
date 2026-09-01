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
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class OrderItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  guitarId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsNumber()
  @IsPositive()
  @Max(100000)
  price!: number;

  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  image?: string;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  // Tope defensivo: un pedido real nunca va a tener más items que el
  // catálogo completo, esto solo evita payloads absurdos.
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}
