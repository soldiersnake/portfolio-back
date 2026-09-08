import { IsString, MinLength } from 'class-validator';

export class UnsubscribeGymPushDto {
  @IsString()
  @MinLength(1)
  endpoint!: string;
}
