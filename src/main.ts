import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // rawBody: true guarda el body sin parsear en request.rawBody para *todas*
  // las rutas (además de seguir parseando JSON normalmente en request.body),
  // sin tener que armar middleware aparte. Lo necesita el webhook de Stripe
  // (ver OrdersController) para verificar la firma HMAC contra los bytes
  // exactos que mandó Stripe.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // Render (y cualquier PaaS) pone un proxy/load balancer delante: sin esto
  // request.ip es la IP del proxy y TODOS los usuarios comparten el mismo
  // contador del RateLimitGuard (5 requests y nadie más puede loguearse).
  // Con 'trust proxy' Express toma la IP real del header X-Forwarded-For.
  app.set('trust proxy', true);

  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  app.enableCors({
    origin: frontendUrl.split(',').map((origin) => origin.trim()),
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
