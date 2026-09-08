import type { Types } from 'mongoose';
import type { GymAccountStatus, GymRole } from '../schemas/gym-user.schema.js';

// Lo que JwtAuthGuard deja en request.gymUser después de verificar el JWT y
// buscar el GymUser fresco en Mongo (a diferencia de tienda-mueble, acá el
// JWT solo lleva el userId — ver PLANNING.md "ronda de decisiones sobre
// auth" — así el rol, los centros gestionados o el estado de cuenta se
// reflejan al instante si un admin los cambia, sin esperar a que expire un
// token viejo).
export interface GymRequestUser {
  id: Types.ObjectId;
  email: string;
  firstName: string;
  lastName: string;
  role: GymRole;
  managedCenterIds: Types.ObjectId[];
  accountStatus: GymAccountStatus;
}
