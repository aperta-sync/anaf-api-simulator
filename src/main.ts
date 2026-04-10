import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AnafMockServerModule } from './anaf-mock-server.module';

/**
 * Bootstraps the ANAF mock server HTTP application.
 */
async function bootstrap() {
  const logger = new Logger('AnafMockServer');
  const app = await NestFactory.create(AnafMockServerModule);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  });

  const port = Number(process.env.ANAF_MOCK_PORT ?? 3003);
  await app.listen(port);

  logger.log(`ANAF mock server running on port ${port}`);
}

bootstrap();
