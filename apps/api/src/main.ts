import 'reflect-metadata';
import './config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { cfg } from './config';
import { AppError } from './common/errors';

// BigInt (размеры файлов, квоты) сериализуется в JSON числом: до 9 ПБ точность сохраняется
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function (this: bigint) {
  return Number(this);
};

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      // HSTS — только в продакшне за HTTPS (ТЗ §10.1)
      hsts: cfg.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
      contentSecurityPolicy: false,
    }),
  );
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        const first = errors[0];
        const message = first ? Object.values(first.constraints ?? {})[0] ?? 'Неверные данные' : 'Неверные данные';
        const code = /^[A-Z_]+$/.test(message) ? message : 'VALIDATION_FAILED';
        return new AppError(400, code, code === message ? 'Неверные данные' : message, {
          fields: errors.map((e) => e.property),
        });
      },
    }),
  );

  const doc = new DocumentBuilder()
    .setTitle('AIN Cloud API')
    .setDescription('API облачного хранилища 4K-медиа ain.kz. Ошибки возвращаются с машиночитаемым полем code.')
    .setVersion('0.1.0')
    .addCookieAuth('ain_sid')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc), { jsonDocumentUrl: 'api/docs/openapi.json' });

  app.enableShutdownHooks();
  await app.listen(cfg.port);
  new Logger('Bootstrap').log(`API: http://localhost:${cfg.port}/api  ·  OpenAPI: http://localhost:${cfg.port}/api/docs`);
}

bootstrap();
