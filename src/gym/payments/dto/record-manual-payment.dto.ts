import { IsMongoId, IsNumber, IsOptional, Min } from 'class-validator';

// Body del alta de pago manual (efectivo, transferencia, etc.) que un admin
// registra desde la ficha del socio. amount es opcional — si no se manda se
// usa el precio del plan tal cual está configurado.
export class RecordManualPaymentDto {
  @IsMongoId()
  membershipPlanId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;
}
