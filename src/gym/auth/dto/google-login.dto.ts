import { IsMongoId, IsOptional, IsString, MinLength } from 'class-validator';

// El ID token que devuelve Google Identity Services en el navegador. El
// backend lo verifica contra los servidores de Google antes de confiar en
// el email que contiene (mismo patrón que tienda-mueble, ver
// GymAuthService.loginWithGoogle).
export class GoogleLoginDto {
  @IsString()
  @MinLength(20)
  idToken!: string;

  // Mismo par centerId/ref que RegisterDto (ver comentario ahí) — solo se
  // usan si este login termina creando una cuenta nueva (autoregistro vía
  // Google); si el email ya existe, se ignoran (ver GymAuthService.loginWithGoogle).
  @IsOptional()
  @IsMongoId()
  centerId?: string;

  @IsOptional()
  @IsMongoId()
  ref?: string;
}
