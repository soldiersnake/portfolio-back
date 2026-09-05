import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// Un solo DTO cubre las dos consultas del sitio de ArquitecturaBosque: el
// formulario general de "Contacto" (sin `modelo`) y el mini-formulario
// "Consultar por este modelo" que aparece en cada página de detalle (con
// `modelo` seteado al nombre del modelo, ej. "Modelo Premier"). El service
// arma el asunto y los templates de email según si `modelo` viene o no.
export class CreateArquitecturaContactDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre!: string;

  @IsEmail()
  @MaxLength(180)
  email!: string;

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
  @MaxLength(120)
  modelo?: string;

  /**
   * Honeypot field (mismo patrón que ContactModule / TiendaMuebleModule /
   * AudifonosModule): oculto vía CSS en el frontend, si viene lleno es un bot.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;
}
