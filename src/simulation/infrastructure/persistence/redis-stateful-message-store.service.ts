import { Injectable, Logger } from '@nestjs/common';
import { StatefulMessageStorePort } from '../../application/ports/stateful-message-store.port';
import { StatefulMessageStoreService } from './stateful-message-store.service';
import { SimulationTypes } from '../../domain/simulation.types';

type RedisClient = {
  incr(key: string): Promise<number>;
  hset(key: string, field: string, value: string): Promise<number>;
  hget(key: string, field: string): Promise<string | null>;
  sadd(key: string, member: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
  del(key: string): Promise<number>;
};

/**
 * Redis-backed message store with automatic in-memory fallback.
 */
@Injectable()
export class RedisStatefulMessageStoreService implements StatefulMessageStorePort {
  private readonly logger = new Logger(RedisStatefulMessageStoreService.name);
  private readonly memoryFallback = new StatefulMessageStoreService();
  private readonly redisClient?: RedisClient;
  private readonly redisEnabled: boolean;
  private readonly ALL_MESSAGES_KEY = 'anaf:mock:all_messages';

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
      this.logger.log('ANAF mock store running in Redis mode');
    } catch (error) {
      this.redisEnabled = false;
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `ANAF_MOCK_STORE=redis requested but Redis client is unavailable (${reason}). Falling back to memory mode.`,
      );
    }
  }

  /**
   * Allocates a monotonic message id in Redis or fallback store.
   *
   * @returns New message identifier.
   */
  async allocateId(): Promise<string> {
    if (!this.redisEnabled || !this.redisClient) {
      return this.memoryFallback.allocateId();
    }

    const sequence = await this.redisClient.incr('anaf:mock:message:sequence');
    return `SIM-${Date.now()}-${String(sequence).padStart(5, '0')}`;
  }

  /**
   * Persists one message in Redis indexes or fallback store.
   *
   * @param message Message entity to persist.
   */
  async save(message: SimulationTypes.StoredInvoiceMessage): Promise<void> {
    if (!this.redisEnabled || !this.redisClient) {
      await this.memoryFallback.save(message);
      return;
    }

    const dataKey = this.messageDataKey(message.id);
    const beneficiaryKey = this.beneficiaryKey(message.cif_beneficiar);

    await this.redisClient.hset(dataKey, 'payload', JSON.stringify(message));
    await this.redisClient.sadd(beneficiaryKey, message.id);
    await this.redisClient.sadd(this.ALL_MESSAGES_KEY, message.id);
  }

  /**
   * Persists a batch of messages.
   *
   * @param messages Message entities to persist.
   */
  async saveMany(
    messages: SimulationTypes.StoredInvoiceMessage[],
  ): Promise<void> {
    await Promise.all(messages.map((message) => this.save(message)));
  }

  /**
   * Finds a message by id.
   *
   * @param id Message identifier.
   * @returns Stored message or undefined.
   */
  async findById(
    id: string,
  ): Promise<SimulationTypes.StoredInvoiceMessage | undefined> {
    if (!this.redisEnabled || !this.redisClient) {
      return this.memoryFallback.findById(id);
    }

    const raw = await this.redisClient.hget(this.messageDataKey(id), 'payload');
    if (!raw) {
      return undefined;
    }

    return this.hydrateMessage(raw);
  }

  /**
   * Lists messages for one beneficiary CUI.
   *
   * @param cifBeneficiar Beneficiary numeric CUI.
   * @returns Messages sorted by newest first.
   */
  async listForBeneficiary(
    cifBeneficiar: string,
  ): Promise<SimulationTypes.StoredInvoiceMessage[]> {
    if (!this.redisEnabled || !this.redisClient) {
      return this.memoryFallback.listForBeneficiary(cifBeneficiar);
    }

    const ids = await this.redisClient.smembers(
      this.beneficiaryKey(cifBeneficiar),
    );
    const messages = await Promise.all(ids.map((id) => this.findById(id)));
    return messages
      .filter(
        (message): message is SimulationTypes.StoredInvoiceMessage =>
          message !== undefined,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Lists all stored messages.
   *
   * @returns Messages sorted by newest first.
   */
  async listAll(): Promise<SimulationTypes.StoredInvoiceMessage[]> {
    if (!this.redisEnabled || !this.redisClient) {
      return this.memoryFallback.listAll();
    }

    const ids = await this.redisClient.smembers(this.ALL_MESSAGES_KEY);
    const messages = await Promise.all(ids.map((id) => this.findById(id)));
    return messages
      .filter(
        (message): message is SimulationTypes.StoredInvoiceMessage =>
          message !== undefined,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Builds Redis hash key for one message payload.
   *
   * @param messageId Message identifier.
   * @returns Redis key string.
   */
  private messageDataKey(messageId: string): string {
    return `anaf:mock:message:${messageId}`;
  }

  /**
   * Builds Redis set key for one beneficiary.
   *
   * @param cifBeneficiar Beneficiary numeric CUI.
   * @returns Redis key string.
   */
  private beneficiaryKey(cifBeneficiar: string): string {
    return `anaf:mock:beneficiary:${cifBeneficiar}`;
  }

  /**
   * Converts serialized Redis payload into runtime message entity.
   *
   * @param raw Serialized message JSON.
   * @returns Hydrated message with Date instance.
   */
  private hydrateMessage(raw: string): SimulationTypes.StoredInvoiceMessage {
    const parsed = JSON.parse(raw) as Omit<
      SimulationTypes.StoredInvoiceMessage,
      'createdAt'
    > & {
      createdAt: string;
    };

    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt),
    };
  }
}
