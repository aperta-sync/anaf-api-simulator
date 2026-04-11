import { Injectable, Logger } from '@nestjs/common';
import { UploadTrackingStorePort } from '../../application/ports/upload-tracking-store.port';
import { UploadTrackingStoreService } from './upload-tracking-store.service';
import { SimulationTypes } from '../../domain/simulation.types';

type RedisClient = {
  incr(key: string): Promise<number>;
  hset(key: string, field: string, value: string): Promise<number>;
  hget(key: string, field: string): Promise<string | null>;
};

/**
 * Redis-backed upload tracking store with automatic in-memory fallback.
 */
@Injectable()
export class RedisUploadTrackingStoreService implements UploadTrackingStorePort {
  private readonly logger = new Logger(RedisUploadTrackingStoreService.name);
  private readonly memoryFallback = new UploadTrackingStoreService();
  private readonly redisClient?: RedisClient;
  private readonly redisEnabled: boolean;
  private readonly SEQUENCE_KEY = 'anaf:mock:upload:sequence';

  /**
   * Initializes Redis client when redis mode is requested and available.
   */
  constructor() {
    const mode = (process.env.ANAF_MOCK_STORE ?? 'memory').toLowerCase();

    if (mode !== 'redis') {
      this.redisEnabled = false;
      return;
    }

    try {
      const RedisCtor = require('ioredis') as new (
        options?: string | Record<string, unknown>,
      ) => RedisClient;

      const redisUrl = process.env.REDIS_URL;
      if (redisUrl) {
        this.redisClient = new RedisCtor(redisUrl);
      } else {
        this.redisClient = new RedisCtor({
          host: process.env.REDIS_HOST ?? '127.0.0.1',
          port: Number(process.env.REDIS_PORT ?? '6379'),
        });
      }

      this.redisEnabled = true;
      this.logger.log('ANAF mock upload tracking store running in Redis mode');
    } catch (error) {
      this.redisEnabled = false;
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `ANAF_MOCK_STORE=redis requested but Redis client is unavailable (${reason}). Falling back to memory mode.`,
      );
    }
  }

  /**
   * Allocates a monotonic upload index in Redis or fallback store.
   *
   * @returns New upload index string.
   */
  async allocateUploadIndex(): Promise<string> {
    if (!this.redisEnabled || !this.redisClient) {
      return this.memoryFallback.allocateUploadIndex();
    }

    const sequence = await this.redisClient.incr(this.SEQUENCE_KEY);
    return `${Date.now()}${String(sequence).padStart(4, '0')}`;
  }

  /**
   * Persists one upload record in Redis or fallback store.
   *
   * @param record Upload record to persist.
   */
  async save(record: SimulationTypes.UploadedInvoiceRecord): Promise<void> {
    if (!this.redisEnabled || !this.redisClient) {
      await this.memoryFallback.save(record);
      return;
    }

    const dataKey = this.uploadDataKey(record.indexIncarcare);
    await this.redisClient.hset(dataKey, 'payload', JSON.stringify(record));
  }

  /**
   * Finds an upload record by its upload index.
   *
   * @param indexIncarcare Upload index identifier.
   * @returns Hydrated upload record or undefined.
   */
  async findByUploadIndex(
    indexIncarcare: string,
  ): Promise<SimulationTypes.UploadedInvoiceRecord | undefined> {
    if (!this.redisEnabled || !this.redisClient) {
      return this.memoryFallback.findByUploadIndex(indexIncarcare);
    }

    const raw = await this.redisClient.hget(
      this.uploadDataKey(indexIncarcare),
      'payload',
    );
    if (!raw) {
      return undefined;
    }

    return this.hydrateRecord(raw);
  }

  /**
   * Builds Redis hash key for one upload record payload.
   *
   * @param indexIncarcare Upload index identifier.
   * @returns Redis key string.
   */
  private uploadDataKey(indexIncarcare: string): string {
    return `anaf:mock:upload:${indexIncarcare}`;
  }

  /**
   * Converts serialized Redis payload into runtime upload record entity.
   *
   * @param raw Serialized upload record JSON.
   * @returns Hydrated record with Date instances.
   */
  private hydrateRecord(
    raw: string,
  ): SimulationTypes.UploadedInvoiceRecord {
    const parsed = JSON.parse(raw) as Omit<
      SimulationTypes.UploadedInvoiceRecord,
      'uploadedAt' | 'processingCompleteAt'
    > & {
      uploadedAt: string;
      processingCompleteAt: string;
    };

    return {
      ...parsed,
      uploadedAt: new Date(parsed.uploadedAt),
      processingCompleteAt: new Date(parsed.processingCompleteAt),
    };
  }
}
