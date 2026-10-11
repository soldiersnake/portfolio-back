/**
 * Crea (o actualiza) un gimnasio en el directorio de la plataforma
 * (`gymbro_platform.tenants`). Idempotente: si el slug ya existe, actualiza
 * nombre/dbName/estado sin tocar branding, legal ni stripe.
 *
 * Uso (desde portfolio-app/backend):
 *   npm run tenant:create -- okinawa "Okinawa Gym"            # dbName = slug
 *   npm run tenant:create -- okinawa "Okinawa Gym" okinawa     # dbName explícito
 *
 * En PowerShell el `--` puede perderse: si el script no recibe argumentos,
 * correlo directo con `npx tsx scripts/create-gym-tenant.ts okinawa "Okinawa Gym"`.
 *
 * Usa GYM_MONGODB_URI del .env (cae a MONGODB_URI). Igual que
 * seed-gym-centers.ts, usa el driver nativo en vez del schema decorado
 * (incompatibilidad tsx + @nestjs/mongoose con subdocumentos de clase).
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const PLATFORM_DB = 'gymbro_platform';
const SLUG_RE = /^[a-z0-9-]{2,40}$/;

async function main() {
  const [slugArg, name, dbNameArg] = process.argv.slice(2);
  const slug = slugArg?.toLowerCase();
  if (!slug || !name || !SLUG_RE.test(slug)) {
    console.error('Uso: create-gym-tenant <slug> "<nombre>" [dbName]   (slug: minúsculas, números y guiones)');
    process.exit(1);
  }
  const dbName = dbNameArg || slug;

  const uri = process.env.GYM_MONGODB_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('Neither GYM_MONGODB_URI nor MONGODB_URI is set — check your .env file.');
    process.exit(1);
  }

  const conn = await mongoose.createConnection(uri, { dbName: PLATFORM_DB }).asPromise();
  const tenants = conn.db!.collection('tenants');
  await tenants.createIndex({ slug: 1 }, { unique: true });
  await tenants.createIndex({ dbName: 1 }, { unique: true });
  await tenants.createIndex({ 'stripe.accountId': 1 }, { unique: true, sparse: true });

  const now = new Date();
  const result = await tenants.updateOne(
    { slug },
    {
      $set: { name, dbName, updatedAt: now },
      $setOnInsert: {
        slug,
        status: 'trial',
        branding: {},
        legal: { privacyPolicyVersion: '1' },
        stripe: { chargesEnabled: false, detailsSubmitted: false },
        createdAt: now,
      },
    },
    { upsert: true },
  );

  console.log(result.upsertedCount ? `Creado tenant "${slug}" → base "${dbName}"` : `Actualizado tenant "${slug}" → base "${dbName}"`);
  await conn.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
