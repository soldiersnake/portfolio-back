import { IsBoolean } from 'class-validator';

export class UpdatePaymentSettingsDto {
  @IsBoolean()
  allowAdminManualPayments!: boolean;
}
