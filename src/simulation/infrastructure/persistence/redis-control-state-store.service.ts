import { Injectable, Logger } from '@nestjs/common';

type RedisClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<'OK' | null>;
};

/**
 * Redis-backed JSON control-state persistence helper.
 */
@Injectable()
export class RedisControlStateStoreService {
  private readonly logger = new Logger(RedisControlStateStoreService.name);
  private readonly redisClient?: RedisClient;
  private readonly redisEnabled: boolean;

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
      this.logger.log('ANAF control-state persistence enabled (Redis mode)');
    } catch (error) {
      this.redisEnabled = false;
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Control-state Redis client is unavailable (${reason}). Falling back to volatile in-memory state.`,
      );
    }
  }

  /**
   * Reads and parses a JSON value by key.
   *
   * @param key Redis key.
   * @returns Parsed value or undefined when missing/unavailable.
   */
  async readJson<T>(key: string): Promise<T | undefined> {
    if (!this.redisEnabled || !this.redisClient) {
      return undefined;
    }

    try {
      const raw = await this.redisClient.get(key);
      if (!raw) {
        return undefined;
      }

      return JSON.parse(raw) as T;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to read control-state key ${key} from Redis (${reason}).`,
      );
      return undefined;
    }
  }

  /**
   * Stores a JSON value by key.
   *
   * @param key Redis key.
   * @param value JSON-serializable value.
   */
  async writeJson<T>(key: string, value: T): Promise<void> {
    if (!this.redisEnabled || !this.redisClient) {
      return;
    }

    try {
      await this.redisClient.set(key, JSON.stringify(value));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to persist control-state key ${key} to Redis (${reason}).`,
      );
    }
  }
}
