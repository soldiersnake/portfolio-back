import { IsOptional, IsString, MinLength } from 'class-validator';

// El socio dado de alta manualmente por un admin (accountStatus =
// 'pending_invite') completa su acceso a la app con el link del mail de
// invitación, eligiendo una de las dos formas de loguearse: contraseña
// propia, o vincular su cuenta de Google. Se exige al menos una de las dos
// en GymAuthService.acceptInvite (no es práctico expresar "al menos uno de
// estos dos campos" solo con decoradores de class-validator).
export class AcceptInviteDto {
  @IsString()
  @MinLength(10)
  inviteToken!: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsString()
  @MinLength(20)
  googleIdToken?: string;
}
