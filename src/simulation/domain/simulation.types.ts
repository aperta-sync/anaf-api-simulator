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
    // Seedable fields for realistic VAT lookup responses
    nrRegCom?: string;
    streetName?: string;
    streetNumber?: string;
    locality?: string;
    countyCode?: string;
  }

  export interface IdentityProfile {
    id: string;
    fullName: string;
    email: string;
    authorizedCuis: string[];
  }

  export interface SimulationConfig {
    latencyMs: number;
    errorRate: number;
    rateLimitMode: RateLimitMode;
    rateLimitWindowMs: number;
    rateLimitMaxRequests: number;
    rateLimitTrigger: boolean;
    trafficProbability: number;
    autoGenerateTraffic: boolean;
    strictVatLookup: boolean;
    strictOwnershipValidation: boolean;
    // ANAF mock processing delay (env: ANAF_MOCK_PROCESSING_DELAY_MS)
    processingDelayMs?: number;
  }

  export interface SeedCompanyRequest {
    cui: string;
    name: string;
    city: string;
    county: string;
    address: string;
    countryCode?: string;
    vatPayer?: boolean;
    nrRegCom?: string;
    streetName?: string;
    streetNumber?: string;
    locality?: string;
    countyCode?: string;
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

  // ANAF-standard 6-field message entry (used by listaMesajePaginatieFactura)
  export interface MessageListEntry {
    id: string;
    data_creare: string; // YYYYMMDDHHmm format
    cif: string;
    tip: string;
    id_solicitare: string; // upload index from supplier
    detalii: string;
  }

  // Legacy 11-field message entry (used by listaMesajeFactura for backwards compat)
  export interface MessageListEntryLegacy {
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

  export interface StoredInvoiceMessage extends MessageListEntry {
    issueDate: string;
    payableAmount: number;
    supplier: CompanyProfile;
    customer: CompanyProfile;
    lineDescription: string;
    createdAt: Date;
    // Legacy fields kept internally
    cif_emitent?: string;
    cif_beneficiar?: string;
    suma?: number;
    currency?: string;
    // Upload metadata
    id_solicitare: string;
    stare?: StareMesajValue;
    processingDelayMs?: number;
  }

  export type StareMesajValue = 'ok' | 'nok' | 'in prelucrare' | 'XML cu erori nepreluat de sistem';

  export interface UploadTrackingRecord {
    index_incarcare: string;
    createdAt: Date;
    cif: string;
    status: StareMesajValue;
    id_descarcare?: string;
    xml_content?: string;
    extern?: boolean;
    autofactura?: boolean;
    executare?: boolean;
  }

  export interface StareMesajResponse {
    index_incarcare: string;
    stare: StareMesajValue;
    id_descarcare?: string;
    mesaj?: string;
  }

  export interface PaginatieMesajeResponse {
    titlu?: string;
    serial?: string;
    cui?: string;
    mesaje: MessageListEntry[];
    count: number;
    page: number;
    per_page: number;
    filtru?: string;
    eroare?: string;
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
