import { ForbiddenException } from '@nestjs/common';
import type { Types } from 'mongoose';
import type { GymRequestUser } from './gym-request-user.interface.js';

// Reemplaza al "centers-scope.guard" mencionado en PLANNING.md sección 3 por
// un helper simple: a diferencia de RolesGuard (que solo mira el rol), acá
// hace falta el centerId concreto de la operación — y cada endpoint lo recibe
// de un lugar distinto (param, body o el propio documento cargado), así que
// resolverlo a mano en el service es más simple que forzar un guard genérico
// a adivinar de dónde sacarlo.
//
// Regla: superadmin siempre pasa; admin y recepción necesitan tener ese
// centro en managedCenterIds (recepción se crea/asigna igual que un admin,
// ver GymUsersService.createByAdmin/updateMemberRole, solo cambia qué rutas
// tiene habilitadas); member nunca (este helper no es para endpoints de
// socios, esos ya filtran por su propio userId).
export function assertCenterAccess(user: GymRequestUser, centerId: Types.ObjectId): void {
  if (user.role === 'superadmin') {
    return;
  }
  if (
    (user.role === 'admin' || user.role === 'recepcion') &&
    user.managedCenterIds.some((managedId) => managedId.equals(centerId))
  ) {
    return;
  }
  throw new ForbiddenException('You do not have access to this center.');
}
