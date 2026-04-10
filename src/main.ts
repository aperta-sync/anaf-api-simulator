import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AnafMockServerModule } from './anaf-mock-server.module';

/**
 * Bootstraps the ANAF mock server HTTP application.
 */
async function bootstrap() {
  const logger = new Logger('AnafMockServer');
  const app = await NestFactory.create(AnafMockServerModule);
  const localOriginPattern =
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || localOriginPattern.test(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  });

  const port = Number(process.env.ANAF_MOCK_PORT ?? 3003);
  await app.listen(port);

  logger.log(`ANAF mock server running on port ${port}`);
}

bootstrap();
