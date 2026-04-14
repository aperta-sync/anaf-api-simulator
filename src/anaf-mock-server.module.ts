import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { McpModule } from './mcp/mcp.module';
import { DeveloperPortalCommandHttpController } from './simulation/developer-portal/commands/developer-portal.command.http.controller';
import { DeveloperPortalIdentityCommandHttpController } from './simulation/developer-portal/commands/developer-portal.identity.command.http.controller';
import { OAuthCommandHttpController } from './simulation/oauth/commands/oauth.command.http.controller';
import { SimulationCommandHttpController } from './simulation/simulation/commands/simulation.command.http.controller';
import { FaultInjectorMiddleware } from './simulation/infrastructure/middleware/fault-injector.middleware';
import { MockApplicationRegistryService } from './simulation/application/services/mock-application-registry.service';
import { MockIdentityRegistryService } from './simulation/application/services/mock-identity-registry.service';
import { OAuthTokenService } from './simulation/application/services/oauth-token.service';
import { RedisControlStateStoreService } from './simulation/infrastructure/persistence/redis-control-state-store.service';
import { RedisStatefulMessageStoreService } from './simulation/infrastructure/persistence/redis-stateful-message-store.service';
import { SimulationEngineService } from './simulation/application/services/simulation-engine.service';
import { StatefulMessageStoreService } from './simulation/infrastructure/persistence/stateful-message-store.service';
import { STATEFUL_MESSAGE_STORE } from './simulation/application/ports/stateful-message-store.port';
import { TrafficGeneratorService } from './simulation/application/services';
import { UblGeneratorService } from './simulation/application/services/ubl-generator.service';
import { ZipArchiveService } from './simulation/application/services/zip-archive.service';
import { RomanianCompanyNameGenerator } from './simulation/application/services/romanian-company-name.generator';
import { SIMULATION_CQRS_HANDLERS } from './simulation/application/cqrs.handlers';
import { DeveloperPortalQueryHttpController } from './simulation/developer-portal/queries/developer-portal.query.http.controller';
import { MessagesCommandHttpController } from './simulation/messages/commands/messages.command.http.controller';
import { MessagesQueryHttpController } from './simulation/messages/queries/messages.query.http.controller';
import { SimulationQueryHttpController } from './simulation/simulation/queries/simulation.query.http.controller';
import { VatQueryHttpController } from './simulation/vat/queries/vat.query.http.controller';
import { UPLOAD_TRACKING_STORE } from './simulation/application/ports/upload-tracking-store.port';
import { UploadTrackingStoreService } from './simulation/infrastructure/persistence/upload-tracking-store.service';
import { RedisUploadTrackingStoreService } from './simulation/infrastructure/persistence/redis-upload-tracking-store.service';
import { ANAF_RATE_LIMIT_STORE } from './simulation/application/ports/anaf-rate-limit-store.port';
import { AnafRateLimitStoreService } from './simulation/infrastructure/persistence/anaf-rate-limit-store.service';
import { AnafRateLimitService } from './simulation/application/services/anaf-rate-limit.service';

@Module({
  imports: [CqrsModule, ScheduleModule.forRoot(), McpModule],
  controllers: [
    DeveloperPortalCommandHttpController,
    DeveloperPortalIdentityCommandHttpController,
    OAuthCommandHttpController,
    SimulationCommandHttpController,
    MessagesCommandHttpController,
    DeveloperPortalQueryHttpController,
    MessagesQueryHttpController,
    SimulationQueryHttpController,
    VatQueryHttpController,
  ],
  providers: [
    MockApplicationRegistryService,
    MockIdentityRegistryService,
    OAuthTokenService,
    RedisControlStateStoreService,
    SimulationEngineService,
    TrafficGeneratorService,
    StatefulMessageStoreService,
    RedisStatefulMessageStoreService,
    {
      provide: STATEFUL_MESSAGE_STORE,
      useFactory: (
        inMemoryStore: StatefulMessageStoreService,
        redisStore: RedisStatefulMessageStoreService,
      ) => {
        const mode = (process.env.ANAF_MOCK_STORE ?? 'memory').toLowerCase();
        return mode === 'redis' ? redisStore : inMemoryStore;
      },
      inject: [StatefulMessageStoreService, RedisStatefulMessageStoreService],
    },
    UploadTrackingStoreService,
    RedisUploadTrackingStoreService,
    {
      provide: UPLOAD_TRACKING_STORE,
      useFactory: (
        inMemoryStore: UploadTrackingStoreService,
        redisStore: RedisUploadTrackingStoreService,
      ) => {
        const mode = (process.env.ANAF_MOCK_STORE ?? 'memory').toLowerCase();
        return mode === 'redis' ? redisStore : inMemoryStore;
      },
      inject: [UploadTrackingStoreService, RedisUploadTrackingStoreService],
    },
    AnafRateLimitStoreService,
    AnafRateLimitService,
    {
      provide: ANAF_RATE_LIMIT_STORE,
      useExisting: AnafRateLimitStoreService,
    },
    UblGeneratorService,
    ZipArchiveService,
    RomanianCompanyNameGenerator,
    ...SIMULATION_CQRS_HANDLERS,
  ],
})
export class AnafMockServerModule implements NestModule {
  /**
   * Applies fault injector middleware across all incoming routes.
   *
   * @param consumer Nest middleware consumer.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(FaultInjectorMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
