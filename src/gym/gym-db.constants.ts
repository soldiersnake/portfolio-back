// Nombre de la conexión de Mongoose dedicada a GymBro (ver app.module.ts).
// GymBro vive en el mismo backend que el resto del portfolio, pero sus datos
// van a su propia base/cluster (GYM_MONGODB_URI) — así los datos reales del
// gimnasio cliente quedan aislados de las demos del portfolio, y mañana se
// puede separar el módulo a su propio backend sin migrar nada.
// Todo @InjectModel(...) y MongooseModule.forFeature(...) del módulo gym
// tiene que pasar este nombre; si no, Nest busca el modelo en la conexión
// por defecto (MONGODB_URI) y falla al arrancar.
export const GYM_DB_CONNECTION = 'gym';
