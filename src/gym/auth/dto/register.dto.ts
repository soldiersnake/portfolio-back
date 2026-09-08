import { IsEmail, IsMongoId, IsOptional, IsString, MinLength } from 'class-validator';

// Autoregistro del socio desde la app con email + contraseña
// (registrationSource = 'self', ver GymUser schema).
export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  // Presentes cuando el registro viene de un link de invitación compartido
  // desde una sede (ver AdminSedesPage "Compartir" / GymAuthService). centerId
  // preselecciona la sede del socio nuevo; ref es el userId de quien compartió
  // el link (ver referredByUserId en gym-user.schema.ts) — ambos opcionales,
  // un registro "normal" (sin pasar por un link compartido) no los manda.
  @IsOptional()
  @IsMongoId()
  centerId?: string;

  @IsOptional()
  @IsMongoId()
  ref?: string;
}
