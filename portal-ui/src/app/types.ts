export type PortalView =
  | 'dashboard'
  | 'apps'
  | 'oauth'
  | 'data'
  | 'inspector'
  | 'settings';

export type AlertType = 'success' | 'danger' | 'warning' | 'info';

export type RateLimitMode = 'off' | 'deterministic' | 'windowed';

export interface MockApplication {
  applicationName: string;
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
  createdAt: string;
  source: string;
}

export interface SimulationConfig {
  latencyMs: number;
  errorRate: number;
  trafficProbability: number;
  autoGenerateTraffic: boolean;
  strictVatLookup: boolean;
  rateLimitMode: RateLimitMode;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  rateLimitTrigger: boolean;
  strictOwnershipValidation: boolean;
}

export interface IdentityProfile {
  id: string;
  fullName: string;
  email: string;
  authorizedCuis: string[];
}

export interface CompanyProfile {
  name: string;
  cui: string;
  city: string;
  county?: string;
  countryCode?: string;
  vatPayer: boolean;
}

export interface StoredMessage {
  id: string;
  createdAt?: string;
  data_creare?: string;
  cif_emitent: string;
  cif_beneficiar: string;
  tip?: string;
  suma: number;
  currency: string;
  detalii?: string;
}

export interface MessageListEntry {
  id: string;
  cif_emitent: string;
  cif_beneficiar: string;
  tip?: string;
  detalii?: string;
  suma: number;
  currency: string;
  data_creare?: string;
}

export interface SeedPresetSummary {
  preset: 'anaf-core' | 'anaf-large';
  seededCompanies: number;
  totalKnownCompanies: number;
  seededMessages: number;
  totalMessages: number;
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

export interface AlertItem {
  id: number;
  type: AlertType;
  message: string;
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: boolean;
  headers?: Record<string, string>;
  requiresAuth?: boolean;
  suppressAutoAlert?: boolean;
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T;
}

export interface TokenDisplay {
  access: string;
  refresh: string;
}

export interface TokenInspectorData {
  identityId: string;
  clientId: string;
  scope: string;
  issuedAt: string;
  expiresAt: string;
  parseError?: string;
}

export type EsignSimulationMode =
  | 'ok'
  | 'incorrect_credentials'
  | 'network_issue'
  | 'server_error';
