import { IsDateString, IsMongoId } from 'class-validator';

// Reserva de un turno puntual de una clase recurrente — sessionDate es la
// fecha concreta (ej. "el spinning del lunes 14 de septiembre"), no el
// horario recurrente en sí (eso vive en GymClass.schedule).
export class BookGymClassDto {
  @IsMongoId()
  classId!: string;

  @IsDateString()
  sessionDate!: string;
}
