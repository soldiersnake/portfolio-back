import { randomBytes } from 'node:crypto';

// Tokens opacos (no correlativos, no basados en el _id) usados tanto para el
// QR del carnet digital como para el link de invitación por mail. hex de 32
// bytes = 64 caracteres, suficiente entropía para no ser adivinable.
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex');
}
