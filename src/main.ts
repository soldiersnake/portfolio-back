import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // rawBody: true guarda el body sin parsear en request.rawBody para *todas*
  // las rutas (además de seguir parseando JSON normalmente en request.body),
  // sin tener que armar middleware aparte. Lo necesita el webhook de Stripe
  // (ver OrdersController) para verificar la firma HMAC contra los bytes
  // exactos que mandó Stripe.
  const app = await NestFactory.create(AppModule, { rawBody: true });

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
