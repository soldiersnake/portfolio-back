import { IsMongoId, IsString, MinLength } from 'class-validator';

// Check-in escaneando el QR del carnet digital del socio (método
// 'qr_scan_app' — cámara del celu/tablet del admin/recepción, sin hardware,
// ver PLANNING.md sección 3).
export class ScanGymCheckInDto {
  @IsString()
  @MinLength(1)
  qrCodeToken!: string;

  @IsMongoId()
  centerId!: string;
}
