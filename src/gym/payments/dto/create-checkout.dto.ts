import { IsMongoId } from 'class-validator';

// Body compartido por los dos endpoints de checkout (Stripe y Mercado
// Pago) — el proveedor lo determina la ruta, no el body (ver
// PaymentsController), mismo patrón que tienda-mueble/orders.
export class CreateGymCheckoutDto {
  @IsMongoId()
  membershipPlanId!: string;
}
