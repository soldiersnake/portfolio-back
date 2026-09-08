/**
 * Carga los 3 centros hardcodeados del MVP de GymBro (ver PLANNING.md
 * sección 2.3 — la pantalla de "Gestión de sedes" queda para la Fase 4).
 *
 * Es idempotente: si un centro con el mismo `name` ya existe, lo actualiza
 * en vez de duplicarlo — se puede correr de nuevo sin miedo.
 *
 * A diferencia de seed-tienda-mueble.ts, este script NO importa
 * `GymCenterSchema` ni la clase `GymCenter` — usa el driver nativo de Mongo
 * (`db.collection('gym_centers')`) directamente. Motivo: `GymCenterSchema`
 * tiene un `@Prop({ type: [GymCenterScheduleSlot] })` (array de subdocumento
 * de clase), y ese patrón específico rompe cuando el archivo se carga con
 * `tsx` (que es como corre este script vía `npm run seed:gym-centers`) —
 * `tsx`/esbuild transpila los decoradores de un modo incompatible con la
 * introspección en runtime de `@nestjs/mongoose`, tirando
 * `TypeError: Class constructor GymCenterScheduleSlot cannot be invoked
 * without 'new'`. Confirmado con un repro mínimo — no es un bug del schema,
 * es una incompatibilidad puntual `tsx` + `@nestjs/mongoose` con este
 * patrón. La app real (`nest start`/`nest build`) no usa `tsx`, así que no
 * le pasa esto — pero cualquier script nuevo que se corra con `tsx` y
 * necesite un schema con este patrón (array de subdocumento de clase)
 * debería evitar importar el schema decorado, igual que acá.
 *
 * Uso: npm run seed:gym-centers   (desde portfolio-app/backend)
 * Requiere MONGODB_URI en .env (mismo que usa el resto del backend).
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const centers = [
  {
    name: 'GymBro Ruzafa',
    address: 'Calle Sueca 12',
    city: 'Valencia',
    phone: '+34 960 000 001',
    email: 'ruzafa@gymbro.example',
    schedule: [
      { day: 1, openTime: '07:00', closeTime: '22:30' },
      { day: 2, openTime: '07:00', closeTime: '22:30' },
      { day: 3, openTime: '07:00', closeTime: '22:30' },
      { day: 4, openTime: '07:00', closeTime: '22:30' },
      { day: 5, openTime: '07:00', closeTime: '21:00' },
      { day: 6, openTime: '09:00', closeTime: '14:00' },
    ],
    amenities: ['pileta', 'lockers', 'estacionamiento'],
    photos: [],
    isActive: true,
  },
  {
    name: 'GymBro Benimaclet',
    address: 'Avenida de Alfahuir 34',
    city: 'Valencia',
    phone: '+34 960 000 002',
    email: 'benimaclet@gymbro.example',
    schedule: [
      { day: 1, openTime: '06:30', closeTime: '22:00' },
      { day: 2, openTime: '06:30', closeTime: '22:00' },
      { day: 3, openTime: '06:30', closeTime: '22:00' },
      { day: 4, openTime: '06:30', closeTime: '22:00' },
      { day: 5, openTime: '06:30', closeTime: '20:30' },
      { day: 6, openTime: '09:00', closeTime: '13:00' },
    ],
    amenities: ['spa', 'lockers'],
    photos: [],
    isActive: true,
  },
  {
    name: 'GymBro Patraix',
    address: 'Calle Padre Porta 8',
    city: 'Valencia',
    phone: '+34 960 000 003',
    email: 'patraix@gymbro.example',
    schedule: [
      { day: 1, openTime: '08:00', closeTime: '21:30' },
      { day: 2, openTime: '08:00', closeTime: '21:30' },
      { day: 3, openTime: '08:00', closeTime: '21:30' },
      { day: 4, openTime: '08:00', closeTime: '21:30' },
      { day: 5, openTime: '08:00', closeTime: '21:00' },
    ],
    amenities: ['estacionamiento'],
    photos: [],
    isActive: true,
  },
];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set — check your .env file.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Could not get a handle on the database after connecting.');
  }
  const collection = db.collection('gym_centers');

  const now = new Date();
  for (const center of centers) {
    await collection.updateOne(
      { name: center.name },
      { $set: { ...center, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
    console.log(`Upserted: ${center.name}`);
  }

  await mongoose.disconnect();
  console.log(`Done — ${centers.length} centers seeded.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
