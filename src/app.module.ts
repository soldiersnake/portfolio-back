import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ContactModule } from './contact/contact.module.js';
import { RecommendationsModule } from './recommendations/recommendations.module.js';
import { GuitarsModule } from './guitars/guitars.module.js';
import { AudifonosModule } from './audifonos/audifonos.module.js';
import { TiendaMuebleModule } from './tienda-mueble/tienda-mueble.module.js';
import { ArquitecturaModule } from './arquitectura/arquitectura.module.js';
import { GymModule } from './gym/gym.module.js';
import { GYM_DB_CONNECTION, GYM_PLATFORM_CONNECTION, GYM_PLATFORM_DB_NAME } from './gym/gym-db.constants.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
    }),
    // Conexión aparte para GymBro (ver gym/gym-db.constants.ts). Si
    // GYM_MONGODB_URI no está definida cae a MONGODB_URI, así en dev local
    // sigue funcionando todo contra la misma base sin tocar el .env.
    MongooseModule.forRootAsync({
      connectionName: GYM_DB_CONNECTION,
      inject: [ConfigService],
      // dbName pisa el nombre de base de la URI: así la misma URI del
      // cluster sirve para la base del gimnasio y para gymbro_platform. Si
      // GYM_DB_NAME no está, se usa la base de la URI (comportamiento previo).
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('GYM_MONGODB_URI') || config.get<string>('MONGODB_URI'),
        dbName: config.get<string>('GYM_DB_NAME') || undefined,
      }),
    }),
    // Base central de la plataforma: directorio de gimnasios (tenants).
    MongooseModule.forRootAsync({
      connectionName: GYM_PLATFORM_CONNECTION,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('GYM_MONGODB_URI') || config.get<string>('MONGODB_URI'),
        dbName: GYM_PLATFORM_DB_NAME,
      }),
    }),
    ContactModule,
    RecommendationsModule,
    GuitarsModule,
    AudifonosModule,
    TiendaMuebleModule,
    ArquitecturaModule,
    GymModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
