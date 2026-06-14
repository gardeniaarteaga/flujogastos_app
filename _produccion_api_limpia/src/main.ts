import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost',
  'http://127.0.0.1',
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'https://flujogastosapp-production.up.railway.app',
];

const DEFAULT_ALLOWED_HEADERS = ['Content-Type', 'Authorization', 'x-user-id'];

const normalizeOrigin = (origin: string): string => origin.trim().replace(/\/+$/, '');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3001);
  const configuredOrigins = process.env.CORS_ORIGINS?.split(',') ?? DEFAULT_ALLOWED_ORIGINS;
  const configuredHeaders = process.env.CORS_ALLOWED_HEADERS?.split(',') ?? DEFAULT_ALLOWED_HEADERS;
  const allowedOrigins = new Set(
    configuredOrigins.map(normalizeOrigin).filter((origin) => origin.length > 0),
  );
  const allowedHeaders = configuredHeaders
    .map((header) => header.trim())
    .filter((header) => header.length > 0);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.has(normalizeOrigin(origin))) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} not allowed by CORS`), false);
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders,
    optionsSuccessStatus: 204,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(port);
}

void bootstrap();
