import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateContactDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  @MaxLength(180)
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  subject!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  message!: string;

  /**
   * Honeypot field: legitimate users never see or fill this input
   * (it's hidden via CSS in the frontend form). Bots that blindly fill
   * every field will populate it, letting us silently drop the submission.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;
}
