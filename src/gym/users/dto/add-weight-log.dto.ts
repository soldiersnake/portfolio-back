import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class AddGymWeightLogDto {
  @IsNumber()
  @Min(0)
  weight!: number;

  @IsOptional()
  @IsDateString()
  recordedAt?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
