import { Injectable } from '@nestjs/common';

/**
 * Generates deterministic synthetic Romanian company names from CUI values.
 */
@Injectable()
export class RomanianCompanyNameGenerator {
  private readonly prefixes = [
    'Carpatia',
    'Danubius',
    'Transilvania',
    'Miorita',
    'Valahia',
    'Ardeal',
    'Bucovina',
    'Oltenia',
    'Codrii',
    'Dobrogea',
  ];

  private readonly suffixes = [
    'Comert',
    'Industries',
    'Servicii',
    'Logistic',
    'Construct',
    'Solutions',
    'Holding',
    'Global',
    'Dynamics',
    'Consulting',
  ];

  /**
   * Generates a company name from a numeric CUI.
   *
   * @param numericCui Numeric CUI string.
   * @returns Deterministic synthetic company name.
   */
  generateFromCui(numericCui: string): string {
    const hash = this.hash(numericCui);
    const prefix = this.prefixes[hash % this.prefixes.length];
    const suffix = this.suffixes[Math.floor(hash / 7) % this.suffixes.length];
    return `${prefix} ${suffix} SRL`;
  }

  /**
   * Computes deterministic hash value for name generation.
   *
   * @param input Hash input.
   * @returns Positive deterministic integer hash.
   */
  private hash(input: string): number {
    let value = 17;
    for (let index = 0; index < input.length; index += 1) {
      value = (value * 31 + input.charCodeAt(index)) % 2_147_483_647;
    }
    return value;
  }
}
