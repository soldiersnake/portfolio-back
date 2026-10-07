/**
 * Copia todas las colecciones `gym_*` de la base vieja (compartida con el
 * resto del portfolio) a la base dedicada de GymBro.
 *
 * Uso (desde portfolio-app/backend):
 *   1. Agregá temporalmente al .env:
 *        GYM_MIGRATE_SOURCE_URI=<URI vieja, la MONGODB_URI de Render, con /MARIAN_PORTFOLIO>
 *        GYM_MIGRATE_TARGET_URI=<URI nueva, la GYM_MONGODB_URI de Render, con /GYMBRO>
 *   2. npm run migrate:gym          → muestra qué copiaría (no escribe nada)
 *      npm run migrate:gym:run      → copia de verdad
 *   3. Borrá esas dos líneas del .env.
 *
 * Es seguro correrlo más de una vez: los documentos que ya existen en
 * destino (mismo _id) no se tocan ni se duplican; solo se agregan los que
 * faltan. No borra nada en origen.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const DUPLICATE_KEY = 11000;

async function main() {
  const sourceUri = process.env.GYM_MIGRATE_SOURCE_URI;
  const targetUri = process.env.GYM_MIGRATE_TARGET_URI;
  const dryRun = !process.argv.includes('--run');

  if (!sourceUri || !targetUri) {
    console.error('Faltan GYM_MIGRATE_SOURCE_URI y/o GYM_MIGRATE_TARGET_URI en el .env.');
    process.exit(1);
  }
  if (sourceUri === targetUri) {
    console.error('Origen y destino son la misma URI — revisá el .env.');
    process.exit(1);
  }

  const source = await mongoose.createConnection(sourceUri).asPromise();
  const target = await mongoose.createConnection(targetUri).asPromise();
  const sourceDb = source.db!;
  const targetDb = target.db!;

  console.log(`Origen:  ${sourceDb.databaseName}`);
  console.log(`Destino: ${targetDb.databaseName}`);
  if (sourceDb.databaseName === 'test' || targetDb.databaseName === 'test') {
    console.warn('OJO: alguna URI no tiene nombre de base (quedó "test"). Agregá /MARIAN_PORTFOLIO o /GYMBRO antes del "?".');
  }
  console.log(dryRun ? '\nModo prueba (no escribe nada). Corré npm run migrate:gym:run para copiar.\n' : '\nCopiando...\n');

  const collections = (await sourceDb.listCollections().toArray())
    .map((c) => c.name)
    .filter((name) => name.startsWith('gym_'))
    .sort();

  for (const name of collections) {
    const docs = await sourceDb.collection(name).find().toArray();
    const alreadyThere = await targetDb.collection(name).countDocuments();

    if (dryRun) {
      console.log(`${name}: ${docs.length} en origen, ${alreadyThere} ya en destino`);
      continue;
    }

    // Índices primero (unique de email, qrCodeToken, etc.) para que el
    // destino quede igual que el origen.
    const indexes = (await sourceDb.collection(name).indexes()).filter((i) => i.name !== '_id_');
    for (const { key, v: _v, ns: _ns, ...options } of indexes) {
      await targetDb.collection(name).createIndex(key, options).catch((e: Error) =>
        console.warn(`  índice ${options.name} en ${name}: ${e.message}`),
      );
    }

    let inserted = 0;
    let skipped = 0;
    if (docs.length > 0) {
      try {
        const result = await targetDb.collection(name).insertMany(docs, { ordered: false });
        inserted = result.insertedCount;
      } catch (error) {
        const err = error as { code?: number; result?: { insertedCount: number }; writeErrors?: { code: number; errmsg?: string }[] };
        inserted = err.result?.insertedCount ?? 0;
        const writeErrors = err.writeErrors ?? [];
        skipped = writeErrors.filter((w) => w.code === DUPLICATE_KEY).length;
        const other = writeErrors.filter((w) => w.code !== DUPLICATE_KEY);
        if (other.length > 0 || (writeErrors.length === 0 && err.code !== DUPLICATE_KEY)) throw error;
        // Duplicado por email (no por _id) = alguien se registró en la base
        // nueva antes de la copia: queda el de destino, avisamos.
        for (const w of writeErrors) {
          if (w.errmsg && !w.errmsg.includes('_id_')) console.warn(`  conflicto en ${name}: ${w.errmsg}`);
        }
      }
    }
    console.log(`${name}: ${inserted} copiados, ${skipped} ya existían`);
  }

  await source.close();
  await target.close();
  console.log(dryRun ? '\nListo (prueba).' : '\nListo — copia terminada.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
