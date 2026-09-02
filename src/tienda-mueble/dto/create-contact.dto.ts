import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTiendaMuebleContactDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre!: string;

  @IsEmail()
  @MaxLength(180)
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  asunto!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  mensaje!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  pais?: string;

  @IsOptional()
  @IsIn(['cliente', 'proveedor'])
  tipo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  categoria?: string;

  /**
   * Honeypot field (mismo patrón que ContactModule / RecommendationsModule /
   * AudifonosModule): oculto vía CSS en el frontend, si viene lleno es un bot.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;
}
