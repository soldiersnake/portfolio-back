import { IsString, MinLength } from 'class-validator';

export class GoogleLoginDto {
  // El ID token que devuelve Google Identity Services en el navegador
  // (ver GoogleLoginButton en el frontend). El backend lo verifica contra
  // los servidores de Google antes de confiar en el email que contiene.
  @IsString()
  @MinLength(20)
  idToken!: string;
}
