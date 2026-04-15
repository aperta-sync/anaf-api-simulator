import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AnafMockServerModule } from './anaf-mock-server.module';
import { McpService } from './mcp/mcp.service';
import { SimulationEngineService } from './simulation/application/services/simulation-engine.service';
import { MockApplicationRegistryService } from './simulation/application/services/mock-application-registry.service';
import { MockIdentityRegistryService } from './simulation/application/services/mock-identity-registry.service';
import { UblGeneratorService } from './simulation/application/services/ubl-generator.service';
import { AnafRateLimitStoreService } from './simulation/infrastructure/persistence/anaf-rate-limit-store.service';

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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ANAF e-Factura Mock API')
    .setDescription(
      'High-fidelity mock of the Romanian ANAF e-Factura REST API.\n\n' +
      '**Production base URL:** `https://api.anaf.ro`\n\n' +
      'Use the `X-Simulate-*` headers listed on each endpoint to force specific ANAF error scenarios ' +
      'without needing real certificates or uploaded invoices.',
    )
    .setVersion('0.5.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'ANAF OAuth2 access token' },
      'bearer',
    )
    .addTag('e-Factura / Upload', 'Invoice upload endpoints — mirrors https://api.anaf.ro/prod/FCTEL/rest')
    .addTag('e-Factura / Messages', 'Message listing, download and status — mirrors https://api.anaf.ro/prod/FCTEL/rest')
    .addTag('OAuth 2.0', 'ANAF OAuth2 authorization and token endpoints — mirrors https://api.anaf.ro/anaf-oauth2/v1')
    .addTag('VAT Registry', 'VAT payer lookup — mirrors https://api.anaf.ro/api/PlatitorTvaRest/v9')
    .addTag('Simulation Control', 'Mock-only endpoints: adjust latency, error-rate, rate-limits and seed data')
    .addTag('Developer Portal', 'Mock-only internal API for the developer portal console')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('swagger', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  app.get(McpService).initialize(
    app.get(SimulationEngineService),
    document,
    app.get(MockApplicationRegistryService),
    app.get(MockIdentityRegistryService),
    app.get(UblGeneratorService),
    app.get(AnafRateLimitStoreService),
  );

  const port = Number(process.env.ANAF_MOCK_PORT ?? 3003);
  await app.listen(port);

  logger.log(`ANAF mock server running on port ${port}`);
  logger.log(`Swagger UI available at http://localhost:${port}/swagger`);
  logger.log(`MCP endpoint: http://localhost:${port}/mcp`);
}

bootstrap();
