import { IsMongoId } from 'class-validator';

// Check-in cargado a mano por el admin/recepción (método 'manual' — ej.
// cuando el socio no tiene el celu a mano para mostrar el QR).
export class ManualGymCheckInDto {
  @IsMongoId()
  userId!: string;

  @IsMongoId()
  centerId!: string;
}
