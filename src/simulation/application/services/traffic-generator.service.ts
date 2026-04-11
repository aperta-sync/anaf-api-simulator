import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { SimulationEngineService } from './simulation-engine.service';
import {
  STATEFUL_MESSAGE_STORE,
  StatefulMessageStorePort,
} from '../ports/stateful-message-store.port';
import { SimulationTypes } from '../../domain/simulation.types';

type MessageFilter = 'P' | 'T' | 'E' | 'R';

interface SeedMessageTemplate {
  supplierCui: string;
  customerCui: string;
  amount: number;
  currency: string;
  daysAgo: number;
  hourOffset: number;
  lineDescription: string;
  tip: string;
}

/**
 * Serves persisted e-Factura traffic and deterministic seed datasets.
 */
@Injectable()
export class TrafficGeneratorService implements OnModuleInit {
  private static readonly LINE_DESCRIPTIONS = [
    'Servicii IT lunare',
    'Servicii consultanta fiscala',
    'Abonament mentenanta platforma',
    'Licente software enterprise',
    'Servicii integrare API',
    'Audit financiar operational',
    'Servicii logistica si transport',
    'Suport tehnic dedicat',
  ];

  private static readonly ERROR_TIP_MARKERS = [
    'ERORI',
    'ERROR',
    'INVALID',
    'RESPINS',
  ];

  private static readonly RESPONSE_TIP_MARKERS = [
    'MESAJ CUMPARATOR',
    'RASPUNS CUMPARATOR',
    'BUYER RESPONSE',
  ];

  /**
   * Creates an instance of TrafficGeneratorService.
   * @param simulationEngine Value for simulationEngine.
   * @param messageStore Value for messageStore.
   */
  constructor(
    private readonly simulationEngine: SimulationEngineService,
    @Inject(STATEFUL_MESSAGE_STORE)
    private readonly messageStore: StatefulMessageStorePort,
  ) {}

  /**
   * Seeds startup traffic from the configured bootstrap preset.
   */
  async onModuleInit(): Promise<void> {
    const preset = this.resolveBootstrapPreset();
    if (!preset) {
      return;
    }

    await this.seedPresetMessages(preset);
  }

  /**
   * Lists messages for a CUI using ANAF-like filter semantics.
   *
   * `filtru` values:
   * - `P` incoming invoices for beneficiary CIF
   * - `T` outgoing invoices for issuer CIF
   * - `E` error/system messages
   * - `R` buyer response messages
   *
   * @param rawCui Query CUI.
   * @param zile Lookback period in days.
   * @param filtru Optional ANAF filter.
   * @returns Filtered and sorted message list entries.
   */
  async listMessages(
    rawCui: string,
    zile: number,
    filtru?: string,
  ): Promise<SimulationTypes.MessageListEntry[]> {
    const normalized = this.simulationEngine.normalizeCui(rawCui);

    // Keep optional synthetic traffic for backwards compatibility, disabled by default.
    if (this.simulationEngine.getConfig().autoGenerateTraffic) {
      await this.appendOccasionalNewTraffic(normalized.numeric);
    }

    const filter = this.normalizeFilter(filtru);
    const threshold = new Date(Date.now() - zile * 24 * 60 * 60 * 1000);
    const allMessages =
      filter === 'P'
        ? await this.messageStore.listForBeneficiary(normalized.numeric)
        : await this.messageStore.listAll();

    return allMessages
      .filter((message) => message.createdAt >= threshold)
      .filter((message) =>
        this.matchesFilter(message, normalized.numeric, filter),
      )
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      )
      .map((message) => ({
        id: message.id,
        data_creare: message.data_creare,
        creation_date: message.creation_date,
        cif_emitent: message.cif_emitent,
        cif_beneficiar: message.cif_beneficiar,
        cif: message.cif,
        tip: message.tip,
        detalii: message.detalii,
        suma: message.suma,
        currency: message.currency,
      }));
  }

  /**
   * Retrieves one stored invoice message by id.
   *
   * @param id Message identifier.
   * @returns Stored message when present.
   */
  async getStoredMessageById(
    id: string,
  ): Promise<SimulationTypes.StoredInvoiceMessage | undefined> {
    return this.messageStore.findById(id);
  }

  /**
   * Lists all stored invoice messages.
   *
   * @returns Full message collection from backing store.
   */
  async listAllMessages(): Promise<SimulationTypes.StoredInvoiceMessage[]> {
    return this.messageStore.listAll();
  }

  /**
   * Creates and persists a StoredInvoiceMessage from an upload operation.
   */
  async createMessageFromUpload(
    supplier: SimulationTypes.CompanyProfile,
    customer: SimulationTypes.CompanyProfile,
    amount: number,
    xmlContent: string,
  ): Promise<string> {
    const messageId = await this.messageStore.allocateId();
    const now = new Date();
    const issueDate = new Date(now.getTime());
    issueDate.setUTCDate(issueDate.getUTCDate() - (1 + Math.floor(Math.random() * 4)));

    const message: SimulationTypes.StoredInvoiceMessage = {
      id: messageId,
      data_creare: now.toISOString(),
      creation_date: now.toISOString(),
      cif_emitent: supplier.numericCui,
      cif_beneficiar: customer.numericCui,
      cif: supplier.numericCui,
      tip: 'FACTURA TRIMISA',
      detalii: `Factura incarcata de ${supplier.name} catre ${customer.name}`,
      suma: amount,
      currency: 'RON',
      issueDate: issueDate.toISOString().slice(0, 10),
      payableAmount: amount,
      supplier,
      customer,
      lineDescription: 'Factura incarcata prin upload',
      createdAt: now,
    };

    await this.messageStore.save(message);
    return messageId;
  }

  /**
   * Seeds deterministic message traffic for one preset profile.
   *
   * @param preset Seed preset name.
   * @returns Number of newly inserted messages.
   */
  async seedPresetMessages(
    preset: SimulationTypes.SeedPresetName,
  ): Promise<number> {
    const companies = this.simulationEngine.getKnownCompanies();
    const companyMap = new Map(
      companies.map((company) => [company.numericCui, company]),
    );
    const existingMessages = await this.messageStore.listAll();
    const existingFingerprints = new Set(
      existingMessages.map((message) => this.buildMessageFingerprint(message)),
    );

    const templates =
      preset === 'anaf-large'
        ? this.buildLargeSeedTemplates(companies)
        : this.buildCoreSeedTemplates(companies);

    const pending: SimulationTypes.StoredInvoiceMessage[] = [];

    for (const template of templates) {
      const supplier = companyMap.get(template.supplierCui);
      const customer = companyMap.get(template.customerCui);
      if (!supplier || !customer) {
        continue;
      }

      const fingerprint = this.buildTemplateFingerprint(template);
      if (existingFingerprints.has(fingerprint)) {
        continue;
      }

      const message = await this.buildPresetMessage(
        template,
        supplier,
        customer,
      );
      pending.push(message);
      existingFingerprints.add(fingerprint);
    }

    if (pending.length > 0) {
      await this.messageStore.saveMany(pending);
    }

    return pending.length;
  }

  /**
   * Builds an aggregated invoice traffic graph for inspector visualization.
   *
   * @param windowDays Lookback window in days.
   * @returns Directed network graph with company nodes and flow edges.
   */
  async buildInvoiceNetworkGraph(
    windowDays: number,
  ): Promise<SimulationTypes.InvoiceNetworkGraph> {
    const threshold = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const messages = (await this.messageStore.listAll()).filter(
      (message) => message.createdAt >= threshold,
    );

    const companyByCui = new Map(
      this.simulationEngine
        .getKnownCompanies()
        .map((company) => [company.numericCui, company]),
    );

    const nodes = new Map<string, SimulationTypes.InvoiceNetworkNode>();
    const edges = new Map<string, SimulationTypes.InvoiceNetworkEdge>();

    for (const message of messages) {
      const supplier = companyByCui.get(message.cif_emitent);
      const customer = companyByCui.get(message.cif_beneficiar);

      const sourceNode = this.ensureNode(
        nodes,
        message.cif_emitent,
        supplier?.name,
        supplier,
      );
      const targetNode = this.ensureNode(
        nodes,
        message.cif_beneficiar,
        customer?.name,
        customer,
      );

      sourceNode.totalOut += Number(message.suma);
      targetNode.totalIn += Number(message.suma);

      const edgeId = this.buildEdgeId(
        sourceNode.id,
        targetNode.id,
        message.currency,
      );
      const existingEdge = edges.get(edgeId);

      if (existingEdge) {
        existingEdge.invoiceCount += 1;
        existingEdge.totalAmount = Number(
          (existingEdge.totalAmount + Number(message.suma)).toFixed(2),
        );
      } else {
        edges.set(edgeId, {
          id: edgeId,
          source: sourceNode.id,
          target: targetNode.id,
          invoiceCount: 1,
          totalAmount: Number(Number(message.suma).toFixed(2)),
          currency: message.currency,
        });
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      windowDays,
      nodes: [...nodes.values()].sort((left, right) =>
        left.label.localeCompare(right.label, 'ro'),
      ),
      edges: [...edges.values()].sort(
        (left, right) => right.totalAmount - left.totalAmount,
      ),
    };
  }

  /**
   * Lists messages with time-range filtering and pagination.
   */
  async listMessagesPaginated(
    rawCui: string,
    startTimeMs: number,
    endTimeMs: number,
    page: number,
    filtru?: string,
  ): Promise<SimulationTypes.MessageListPaginationResponse> {
    const normalized = this.simulationEngine.normalizeCui(rawCui);
    const filter = this.normalizeFilter(filtru);
    const startThreshold = new Date(startTimeMs);
    const endThreshold = new Date(endTimeMs);
    const pageSize = 50;

    const allMessages =
      filter === 'P'
        ? await this.messageStore.listForBeneficiary(normalized.numeric)
        : await this.messageStore.listAll();

    const filtered = allMessages
      .filter(
        (message) =>
          message.createdAt >= startThreshold &&
          message.createdAt <= endThreshold,
      )
      .filter((message) =>
        this.matchesFilter(message, normalized.numeric, filter),
      )
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      );

    const totalRecords = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const startIndex = (currentPage - 1) * pageSize;
    const pageSlice = filtered.slice(startIndex, startIndex + pageSize);

    const mesaje = pageSlice.map((message) => ({
      id: message.id,
      data_creare: message.data_creare,
      creation_date: message.creation_date,
      cif_emitent: message.cif_emitent,
      cif_beneficiar: message.cif_beneficiar,
      cif: message.cif,
      tip: message.tip,
      detalii: message.detalii,
      suma: message.suma,
      currency: message.currency,
    }));

    if (totalRecords === 0) {
      return {
        cod: 200,
        message: `Nu exista mesaje in intervalul ${startTimeMs} - ${endTimeMs}`,
        mesaje: [],
        numar_inregistrari_in_pagina: 0,
        numar_total_inregistrari_per_pagina: pageSize,
        numar_total_inregistrari: 0,
        numar_total_pagini: 0,
        index_pagina_curenta: currentPage,
      };
    }

    return {
      cod: 200,
      message: 'SUCCESS',
      mesaje,
      numar_inregistrari_in_pagina: mesaje.length,
      numar_total_inregistrari_per_pagina: pageSize,
      numar_total_inregistrari: totalRecords,
      numar_total_pagini: totalPages,
      index_pagina_curenta: currentPage,
    };
  }

  /**
   * Adds optional synthetic near-real-time traffic for legacy scenarios.
   *
   * @param cifBeneficiar Beneficiary numeric CUI.
   */
  private async appendOccasionalNewTraffic(
    cifBeneficiar: string,
  ): Promise<void> {
    const chance = Math.random();
    const probability = this.simulationEngine.getConfig().trafficProbability;

    if (chance > probability) {
      return;
    }

    const customer = this.simulationEngine.getCompany(cifBeneficiar);
    if (!customer) {
      return;
    }

    const newCount = this.randomInt(1, 2);
    const generated: SimulationTypes.StoredInvoiceMessage[] = [];

    for (let index = 0; index < newCount; index += 1) {
      const createdAt = new Date(
        Date.now() - this.randomInt(0, 2) * 60 * 60 * 1000,
      );
      const message = await this.buildGeneratedMessage(customer, createdAt);
      if (message) {
        generated.push(message);
      }
    }

    if (generated.length > 0) {
      await this.messageStore.saveMany(generated);
    }
  }

  /**
   * Builds one synthetic message in optional auto-generation mode.
   *
   * @param customer Beneficiary profile.
   * @param createdAt Message creation timestamp.
   * @returns Generated message or undefined when supplier cannot be resolved.
   */
  private async buildGeneratedMessage(
    customer: SimulationTypes.CompanyProfile,
    createdAt: Date,
  ): Promise<SimulationTypes.StoredInvoiceMessage | undefined> {
    const supplier = this.pickSupplier(customer.numericCui);
    if (!supplier) {
      return undefined;
    }

    const amount = this.randomAmount();
    const messageId = await this.messageStore.allocateId();
    const legalDriftDays = this.randomInt(1, 5);
    const issueDateTime = new Date(createdAt.getTime());
    issueDateTime.setUTCDate(issueDateTime.getUTCDate() - legalDriftDays);

    return {
      id: messageId,
      data_creare: createdAt.toISOString(),
      creation_date: createdAt.toISOString(),
      cif_emitent: supplier.numericCui,
      cif_beneficiar: customer.numericCui,
      cif: supplier.numericCui,
      tip: 'FACTURA PRIMITA',
      detalii: `Factura de la ${supplier.name} catre ${customer.name}`,
      suma: amount,
      currency: 'RON',
      issueDate: issueDateTime.toISOString().slice(0, 10),
      payableAmount: amount,
      supplier,
      customer,
      lineDescription: 'Servicii profesionale lunare',
      createdAt,
    };
  }

  /**
   * Picks a supplier company distinct from beneficiary.
   *
   * @param cifBeneficiar Beneficiary numeric CUI.
   * @returns Supplier profile when available.
   */
  private pickSupplier(
    cifBeneficiar: string,
  ): SimulationTypes.CompanyProfile | undefined {
    const candidates = this.simulationEngine
      .getKnownCompanies()
      .filter((company) => company.numericCui !== cifBeneficiar);

    if (!candidates.length) {
      return undefined;
    }

    return candidates[this.randomInt(0, candidates.length - 1)];
  }

  /**
   * Builds deterministic core traffic templates around default companies.
   *
   * @param companies Known companies.
   * @returns Core preset message templates.
   */
  private buildCoreSeedTemplates(
    companies: SimulationTypes.CompanyProfile[],
  ): SeedMessageTemplate[] {
    const byCui = new Map(
      companies.map((company) => [company.numericCui, company]),
    );

    const required = [
      '10000008',
      '10079193',
      '10158386',
      '10237579',
      '10316761',
    ];
    const available = required.filter((cui) => byCui.has(cui));

    if (available.length < 2) {
      return [];
    }

    return [
      {
        supplierCui: available[1],
        customerCui: available[0],
        amount: 1540.25,
        currency: 'RON',
        daysAgo: 2,
        hourOffset: 9,
        lineDescription: 'Servicii transport intern',
        tip: 'FACTURA PRIMITA',
      },
      {
        supplierCui: available[2 % available.length],
        customerCui: available[0],
        amount: 4820.8,
        currency: 'RON',
        daysAgo: 4,
        hourOffset: 12,
        lineDescription: 'Licente software ERP',
        tip: 'FACTURA PRIMITA',
      },
      {
        supplierCui: available[3 % available.length],
        customerCui: available[0],
        amount: 980.4,
        currency: 'RON',
        daysAgo: 7,
        hourOffset: 14,
        lineDescription: 'Mentenanta preventiva',
        tip: 'FACTURA PRIMITA',
      },
      {
        supplierCui: available[4 % available.length],
        customerCui: available[1],
        amount: 2635.55,
        currency: 'RON',
        daysAgo: 5,
        hourOffset: 11,
        lineDescription: 'Servicii consultanta fiscala',
        tip: 'FACTURA PRIMITA',
      },
      {
        supplierCui: available[0],
        customerCui: available[2 % available.length],
        amount: 3120,
        currency: 'RON',
        daysAgo: 9,
        hourOffset: 10,
        lineDescription: 'Servicii integrare API',
        tip: 'FACTURA TRIMITA',
      },
      {
        supplierCui: available[1],
        customerCui: available[3 % available.length],
        amount: 675.3,
        currency: 'RON',
        daysAgo: 11,
        hourOffset: 8,
        lineDescription: 'Consumabile operationale',
        tip: 'FACTURA PRIMITA',
      },
      {
        supplierCui: available[2 % available.length],
        customerCui: available[4 % available.length],
        amount: 7412.2,
        currency: 'RON',
        daysAgo: 15,
        hourOffset: 16,
        lineDescription: 'Servicii cloud enterprise',
        tip: 'FACTURA PRIMITA',
      },
      {
        supplierCui: available[3 % available.length],
        customerCui: available[2 % available.length],
        amount: 1295.9,
        currency: 'RON',
        daysAgo: 18,
        hourOffset: 13,
        lineDescription: 'Abonament suport premium',
        tip: 'FACTURA TRIMITA',
      },
      {
        supplierCui: available[2 % available.length],
        customerCui: available[0],
        amount: 0,
        currency: 'RON',
        daysAgo: 3,
        hourOffset: 9,
        lineDescription: 'Mesaj eroare validare XML',
        tip: 'ERORI FACTURA',
      },
      {
        supplierCui: available[0],
        customerCui: available[1],
        amount: 0,
        currency: 'RON',
        daysAgo: 6,
        hourOffset: 10,
        lineDescription: 'Raspuns cumparator pentru factura',
        tip: 'MESAJ CUMPARATOR',
      },
    ];
  }

  /**
   * Builds a broad deterministic traffic set for graph-heavy test datasets.
   *
   * @param companies Known companies.
   * @returns Large preset message templates.
   */
  private buildLargeSeedTemplates(
    companies: SimulationTypes.CompanyProfile[],
  ): SeedMessageTemplate[] {
    if (companies.length < 2) {
      return [];
    }

    const total = Math.max(180, companies.length * 3);
    const templates: SeedMessageTemplate[] = [];

    for (let index = 0; index < total; index += 1) {
      const supplier = companies[index % companies.length];
      let customer = companies[(index * 7 + 3) % companies.length];

      if (customer.numericCui === supplier.numericCui) {
        customer = companies[(index * 11 + 5) % companies.length];
      }

      if (customer.numericCui === supplier.numericCui) {
        continue;
      }

      const tip =
        index % 19 === 0
          ? 'ERORI FACTURA'
          : index % 17 === 0
            ? 'MESAJ CUMPARATOR'
            : index % 6 === 0
              ? 'FACTURA TRIMITA'
              : 'FACTURA PRIMITA';

      templates.push({
        supplierCui: supplier.numericCui,
        customerCui: customer.numericCui,
        amount: Number((200 + ((index * 173) % 12_000) / 10).toFixed(2)),
        currency: 'RON',
        daysAgo: index % 50,
        hourOffset: 8 + (index % 10),
        lineDescription:
          tip === 'ERORI FACTURA'
            ? 'Mesaj eroare validare factura'
            : tip === 'MESAJ CUMPARATOR'
              ? 'Raspuns cumparator pentru factura'
              : TrafficGeneratorService.LINE_DESCRIPTIONS[
                  index % TrafficGeneratorService.LINE_DESCRIPTIONS.length
                ],
        tip,
      });
    }

    return templates;
  }

  /**
   * Builds one persisted message entity from a deterministic seed template.
   *
   * @param template Seed template.
   * @param supplier Issuer company profile.
   * @param customer Beneficiary company profile.
   * @returns Stored invoice message.
   */
  private async buildPresetMessage(
    template: SeedMessageTemplate,
    supplier: SimulationTypes.CompanyProfile,
    customer: SimulationTypes.CompanyProfile,
  ): Promise<SimulationTypes.StoredInvoiceMessage> {
    const createdAt = new Date();
    createdAt.setUTCHours(template.hourOffset, 20, 0, 0);
    createdAt.setUTCDate(createdAt.getUTCDate() - template.daysAgo);

    const issueDate = new Date(createdAt.getTime());
    issueDate.setUTCDate(issueDate.getUTCDate() - (1 + (template.daysAgo % 5)));

    const messageId = await this.messageStore.allocateId();

    return {
      id: messageId,
      data_creare: createdAt.toISOString(),
      creation_date: createdAt.toISOString(),
      cif_emitent: supplier.numericCui,
      cif_beneficiar: customer.numericCui,
      cif: supplier.numericCui,
      tip: template.tip,
      detalii: `${template.lineDescription} | ${supplier.name} -> ${customer.name}`,
      suma: template.amount,
      currency: template.currency,
      issueDate: issueDate.toISOString().slice(0, 10),
      payableAmount: template.amount,
      supplier,
      customer,
      lineDescription: template.lineDescription,
      createdAt,
    };
  }

  /**
   * Matches one stored message against query CIF and ANAF filter semantics.
   *
   * @param message Stored message.
   * @param numericCui Normalized query CUI.
   * @param filter Normalized filter.
   * @returns True when message should be included in response.
   */
  private matchesFilter(
    message: SimulationTypes.StoredInvoiceMessage,
    numericCui: string,
    filter: MessageFilter,
  ): boolean {
    if (filter === 'T') {
      return message.cif_emitent === numericCui;
    }

    if (filter === 'E') {
      return this.isErrorMessageType(message.tip);
    }

    if (filter === 'R') {
      return this.isBuyerResponseMessageType(message.tip);
    }

    return message.cif_beneficiar === numericCui;
  }

  /**
   * Normalizes ANAF `filtru` query values.
   *
   * @param filtru Optional raw filter.
   * @returns Uppercase filter value with `P` fallback.
   */
  private normalizeFilter(filtru?: string): MessageFilter {
    const value = (filtru ?? 'P').trim().toUpperCase();
    if (value === 'T' || value === 'E' || value === 'R') {
      return value;
    }
    return 'P';
  }

  /**
   * Detects ANAF-style error/system message types.
   */
  private isErrorMessageType(tip: string): boolean {
    const normalized = tip.trim().toUpperCase();
    return TrafficGeneratorService.ERROR_TIP_MARKERS.some((marker) =>
      normalized.includes(marker),
    );
  }

  /**
   * Detects ANAF-style buyer response message types.
   */
  private isBuyerResponseMessageType(tip: string): boolean {
    const normalized = tip.trim().toUpperCase();
    return TrafficGeneratorService.RESPONSE_TIP_MARKERS.some((marker) =>
      normalized.includes(marker),
    );
  }

  /**
   * Creates stable graph edge identifiers.
   *
   * @param source Source node id.
   * @param target Target node id.
   * @param currency Transaction currency.
   * @returns Edge identifier.
   */
  private buildEdgeId(
    source: string,
    target: string,
    currency: string,
  ): string {
    return `${source}__${target}__${currency.toUpperCase()}`;
  }

  /**
   * Creates a message fingerprint for idempotent seed insertion.
   *
   * @param message Stored message.
   * @returns Stable fingerprint string.
   */
  private buildMessageFingerprint(
    message: SimulationTypes.StoredInvoiceMessage,
  ): string {
    return [
      message.cif_emitent,
      message.cif_beneficiar,
      message.tip,
      message.lineDescription,
      Number(message.suma).toFixed(2),
    ].join('|');
  }

  /**
   * Creates a template fingerprint for idempotent seed insertion.
   *
   * @param template Seed message template.
   * @returns Stable fingerprint string.
   */
  private buildTemplateFingerprint(template: SeedMessageTemplate): string {
    return [
      template.supplierCui,
      template.customerCui,
      template.tip,
      template.lineDescription,
      Number(template.amount).toFixed(2),
    ].join('|');
  }

  /**
   * Ensures one graph node exists and returns it.
   *
   * @param nodes Node map.
   * @param numericCui Company numeric CUI.
   * @param preferredLabel Preferred display name.
   * @param profile Optional profile metadata.
   * @returns Existing or newly created node reference.
   */
  private ensureNode(
    nodes: Map<string, SimulationTypes.InvoiceNetworkNode>,
    numericCui: string,
    preferredLabel: string | undefined,
    profile?: SimulationTypes.CompanyProfile,
  ): SimulationTypes.InvoiceNetworkNode {
    const nodeId = `cui-${numericCui}`;
    const existing = nodes.get(nodeId);
    if (existing) {
      return existing;
    }

    const node: SimulationTypes.InvoiceNetworkNode = {
      id: nodeId,
      cui: numericCui,
      label: preferredLabel || `Companie ${numericCui}`,
      city: profile?.city,
      county: profile?.county,
      countryCode: profile?.countryCode,
      totalIn: 0,
      totalOut: 0,
    };

    nodes.set(nodeId, node);
    return node;
  }

  /**
   * Resolves startup seed preset from environment with core fallback.
   *
   * @returns Preset name or undefined when disabled.
   */
  private resolveBootstrapPreset(): SimulationTypes.SeedPresetName | undefined {
    const configured = (process.env.ANAF_MOCK_BOOTSTRAP_PRESET ?? 'anaf-core')
      .trim()
      .toLowerCase();

    if (!configured || configured === 'none') {
      return undefined;
    }

    if (configured === 'anaf-large' || configured === 'large') {
      return 'anaf-large';
    }

    return 'anaf-core';
  }

  /**
   * Generates a random invoice amount in RON.
   *
   * @returns Amount rounded to two decimals.
   */
  private randomAmount(): number {
    const amount = 80 + Math.random() * 19_000;
    return Number(amount.toFixed(2));
  }

  /**
   * Generates a random integer inside an inclusive range.
   *
   * @param min Minimum inclusive value.
   * @param max Maximum inclusive value.
   * @returns Random integer between min and max.
   */
  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
