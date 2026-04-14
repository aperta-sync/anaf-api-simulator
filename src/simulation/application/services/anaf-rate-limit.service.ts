import { Inject, Injectable } from '@nestjs/common';
import {
  ANAF_RATE_LIMIT_STORE,
  AnafRateLimitResult,
  AnafRateLimitStorePort,
} from '../ports/anaf-rate-limit-store.port';

/**
 * ANAF-specific rate limit enforcement per limiteApeluriAPI.txt.
 *
 * Limits:
 * - /upload RASP: 1000 files/day/CUI
 * - /stare: 100 queries/day per specific id_incarcare
 * - /lista simple: 1500 queries/day/CUI
 * - /lista paginated: 100000 queries/day/CUI
 * - /descarcare: 10 downloads/day per specific message id
 */
@Injectable()
export class AnafRateLimitService {
  constructor(
    @Inject(ANAF_RATE_LIMIT_STORE)
    private readonly store: AnafRateLimitStorePort,
  ) {}

  private todayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  async checkUploadRasp(cui: string): Promise<AnafRateLimitResult> {
    return this.store.checkAndIncrement(
      `upload:rasp:${cui}:${this.todayKey()}`,
      1000,
    );
  }

  async checkStare(idIncarcare: string): Promise<AnafRateLimitResult> {
    return this.store.checkAndIncrement(
      `stare:${idIncarcare}:${this.todayKey()}`,
      100,
    );
  }

  async checkListaSimple(cui: string): Promise<AnafRateLimitResult> {
    return this.store.checkAndIncrement(
      `lista:${cui}:${this.todayKey()}`,
      1500,
    );
  }

  async checkListaPaginated(cui: string): Promise<AnafRateLimitResult> {
    return this.store.checkAndIncrement(
      `lista_paginata:${cui}:${this.todayKey()}`,
      100_000,
    );
  }

  async checkDescarcare(messageId: string): Promise<AnafRateLimitResult> {
    return this.store.checkAndIncrement(
      `descarcare:${messageId}:${this.todayKey()}`,
      10,
    );
  }
}
