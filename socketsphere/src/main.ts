import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation (HTTP). For WebSockets you'll use @MessageBody + ValidationPipe (shown later).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.enableCors();
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Listening on http://localhost:${port}`);
}
bootstrap();
