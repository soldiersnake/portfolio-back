import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class SubscribeNewsletterDto {
  @IsEmail()
  @MaxLength(180)
  email!: string;

  /**
   * Honeypot field: legitimate visitors never see or fill this input
   * (hidden via CSS in the frontend form). Bots that blindly fill every
   * field will populate it, letting us silently drop the submission.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;
}
