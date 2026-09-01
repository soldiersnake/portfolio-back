import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRecommendationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  @MaxLength(180)
  email!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(3000)
  message!: string;

  /**
   * Honeypot field: legitimate guests never see or fill this input
   * (hidden via CSS in the frontend form). Bots that blindly fill every
   * field will populate it, letting us silently drop the submission.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;
}
