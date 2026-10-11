// Conexiones de Mongoose de GymBro (ver app.module.ts y gymbro/ROADMAP_SAAS.md).
//
// - GYM_DB_CONNECTION ('gym'): datos operativos de UN gimnasio (socios,
//   sedes, clases, pagos…). Hoy apunta a una sola base, elegida por
//   GYM_DB_NAME (ej. "okinawa"); en la Fase D del roadmap pasa a elegirse
//   por request según el subdominio (una base por gimnasio).
// - GYM_PLATFORM_CONNECTION ('gym_platform'): la base central
//   `gymbro_platform`, con el directorio de gimnasios (`tenants`). Tiene que
//   estar separada porque para saber qué base de gimnasio abrir primero hay
//   que saber qué gimnasio es.
//
// Ambas usan el mismo cluster (GYM_MONGODB_URI). Todo @InjectModel(...) y
// MongooseModule.forFeature(...) del módulo gym tiene que pasar el nombre de
// conexión correcto; si no, Nest busca el modelo en la conexión por defecto
// (MONGODB_URI, la del resto del portfolio) y falla al arrancar.
export const GYM_DB_CONNECTION = 'gym';
export const GYM_PLATFORM_CONNECTION = 'gym_platform';
export const GYM_PLATFORM_DB_NAME = 'gymbro_platform';
