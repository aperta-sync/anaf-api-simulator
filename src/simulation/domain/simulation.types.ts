export namespace SimulationTypes {
  export type SeedPresetName = 'anaf-core' | 'anaf-large';
  export type RateLimitMode = 'off' | 'deterministic' | 'windowed';

  export interface RegisteredMockApplication {
    applicationName: string;
    clientId: string;
    clientSecret: string;
    redirectUris: string[];
    createdAt: string;
    source: 'portal' | 'env';
  }

  export interface PublicMockApplication {
    applicationName: string;
    clientId: string;
    redirectUris: string[];
    createdAt: string;
    source: 'portal' | 'env';
  }

  export interface OAuthErrorResponse {
    error: string;
    error_description: string;
  }

  export interface CompanyProfile {
    cui: string;
    numericCui: string;
    name: string;
    city: string;
    county: string;
    address: string;
    countryCode?: string;
    vatPayer: boolean;
  }

  export interface IdentityProfile {
    id: string;
    fullName: string;
    email: string;
    authorizedCuis: string[];
  }

  export interface SimulationConfig {
    latencyMs: number;
    processingDelayMs: number;
    errorRate: number;
    rateLimitMode: RateLimitMode;
    rateLimitWindowMs: number;
    rateLimitMaxRequests: number;
    rateLimitTrigger: boolean;
    trafficProbability: number;
    autoGenerateTraffic: boolean;
    strictVatLookup: boolean;
    strictOwnershipValidation: boolean;
  }

  export interface SeedCompanyRequest {
    cui: string;
    name: string;
    city: string;
    county: string;
    address: string;
    countryCode?: string;
    vatPayer?: boolean;
  }

  export interface SeedPresetSummary {
    preset: SeedPresetName;
    seededCompanies: number;
    totalKnownCompanies: number;
    seededMessages: number;
    totalMessages: number;
  }

  export interface OAuthTokenResponse {
    access_token: string;
    refresh_token?: string;
    token_type: 'Bearer';
    expires_in: number;
    scope: string;
  }

  export interface VatLookupRequest {
    cui: string | number;
    data: string;
  }

  export interface VatFoundRecord {
    date_generale: {
      cui: number;
      denumire: string;
      adresa: string;
      nrRegCom: string;
      telefon: string;
      codPostal: string;
      data_inregistrare: string;
      cod_CAEN: string;
    };
    inregistrare_scop_Tva: {
      scpTVA: boolean;
      data_inceput_ScpTVA: string;
      data_anulare_ScpTVA: string | null;
    };
    inregistrare_RTVAI: {
      statusRTVAI: boolean;
      dataInregistrare: string;
      dataAnulare: string | null;
    };
  }

  export interface VatLookupResponse {
    cod: number;
    message: string;
    found: VatFoundRecord[];
    notFound: string[];
  }

  export interface MessageListEntry {
    id: string;
    data_creare: string;
    creation_date: string;
    cif_emitent: string;
    cif_beneficiar: string;
    cif: string;
    tip: string;
    detalii: string;
    suma: number;
    currency: string;
  }

  export interface MessageListResponse {
    cod: number;
    message: string;
    mesaje: MessageListEntry[];
  }

  export type UploadStandard = 'UBL' | 'CII' | 'CN' | 'RASP';

  export type UploadStatus =
    | 'in prelucrare'
    | 'ok'
    | 'nok'
    | 'XML cu erori nepreluat de sistem';

  export interface UploadedInvoiceRecord {
    indexIncarcare: string;
    cif: string;
    standard: UploadStandard;
    xmlContent: string;
    uploadedAt: Date;
    processingCompleteAt: Date;
    messageId: string | null;
    status: UploadStatus;
    errors: string[];
  }

  export interface MessageListPaginationResponse extends MessageListResponse {
    numar_inregistrari_in_pagina: number;
    numar_total_inregistrari_per_pagina: number;
    numar_total_inregistrari: number;
    numar_total_pagini: number;
    index_pagina_curenta: number;
  }

  export interface StoredInvoiceMessage extends MessageListEntry {
    issueDate: string;
    payableAmount: number;
    supplier: CompanyProfile;
    customer: CompanyProfile;
    lineDescription: string;
    createdAt: Date;
  }

  export interface InvoiceNetworkNode {
    id: string;
    cui: string;
    label: string;
    city?: string;
    county?: string;
    countryCode?: string;
    totalIn: number;
    totalOut: number;
  }

  export interface InvoiceNetworkEdge {
    id: string;
    source: string;
    target: string;
    invoiceCount: number;
    totalAmount: number;
    currency: string;
  }

  export interface InvoiceNetworkGraph {
    generatedAt: string;
    windowDays: number;
    nodes: InvoiceNetworkNode[];
    edges: InvoiceNetworkEdge[];
  }
}
