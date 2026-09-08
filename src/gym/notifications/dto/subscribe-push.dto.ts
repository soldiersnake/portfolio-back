import { Type } from 'class-transformer';
import { IsString, MinLength, ValidateNested } from 'class-validator';

class GymPushSubscriptionKeysDto {
  @IsString()
  @MinLength(1)
  p256dh!: string;

  @IsString()
  @MinLength(1)
  auth!: string;
}

// Lo que devuelve PushSubscription.toJSON() en el navegador tras
// pushManager.subscribe() — se guarda tal cual en GymUser.pushSubscriptions
// (ver gym-user.schema.ts GymPushSubscription).
export class SubscribeGymPushDto {
  @IsString()
  @MinLength(1)
  endpoint!: string;

  @ValidateNested()
  @Type(() => GymPushSubscriptionKeysDto)
  keys!: GymPushSubscriptionKeysDto;
}
