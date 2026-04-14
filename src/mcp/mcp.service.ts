import { Injectable, Logger } from '@nestjs/common';
import { IncomingMessage, ServerResponse } from 'node:http';
import * as fs from 'fs';
import * as path from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - SSEServerTransport is marked as deprecated in newer SDKs, but we continue to use it here for stability.
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SimulationEngineService } from '../simulation/application/services/simulation-engine.service';
import { MockApplicationRegistryService } from '../simulation/application/services/mock-application-registry.service';
import { MockIdentityRegistryService } from '../simulation/application/services/mock-identity-registry.service';
import { UblGeneratorService } from '../simulation/application/services/ubl-generator.service';
import { AnafRateLimitStoreService } from '../simulation/infrastructure/persistence/anaf-rate-limit-store.service';
import { SimulationTypes } from '../simulation/domain/simulation.types';
import { CHEAT_HEADERS, CheatHeader } from './mcp.constants';

const SWAGGER_RESOURCE_URI = 'api://swagger.json';

// ── Rate-limit endpoint metadata ────────────────────────────────────────────────

interface QuotaEndpointMeta {
  keyPrefix: string;
  limit: number;
  discriminatorLabel: string;
  description: string;
}

const QUOTA_ENDPOINTS: Record<string, QuotaEndpointMeta> = {
  upload: {
    keyPrefix: 'upload:rasp',
    limit: 1000,
    discriminatorLabel: 'CUI',
    description: 'RASP uploads per day per CUI (/upload endpoint)',
  },
  stare: {
    keyPrefix: 'stare',
    limit: 100,
    discriminatorLabel: 'id_incarcare',
    description: 'Status queries per day per specific message (/stareMesaj endpoint)',
  },
  lista: {
    keyPrefix: 'lista',
    limit: 1500,
    discriminatorLabel: 'CUI',
    description: 'Simple message-list queries per day per CUI (/listaMesajeFactura endpoint)',
  },
  lista_paginata: {
    keyPrefix: 'lista_paginata',
    limit: 100_000,
    discriminatorLabel: 'CUI',
    description: 'Paginated message-list queries per day per CUI (/listaMesajePaginatieFactura endpoint)',
  },
  descarcare: {
    keyPrefix: 'descarcare',
    limit: 10,
    discriminatorLabel: 'message id',
    description: 'Downloads per day per specific message (/descarcare endpoint)',
  },
};

// ── Allowed resource file maps (prevents path traversal) ───────────────────────

const DOCS_BASE = path.join(process.cwd(), 'docs', 'anaf');

const MANUAL_FILES: Record<string, { fsPath: string; mimeType: string; name: string; description: string }> = {
  'api.md': {
    fsPath: path.join(DOCS_BASE, 'manual', 'api.md'),
    mimeType: 'text/markdown',
    name: 'ANAF API Technical Reference',
    description: 'Detailed technical documentation for all ANAF e-Factura REST endpoints.',
  },
  'registration.md': {
    fsPath: path.join(DOCS_BASE, 'manual', 'registration.md'),
    mimeType: 'text/markdown',
    name: 'ANAF API Registration Guide',
    description: 'Step-by-step guide for registering your application with the ANAF developer portal.',
  },
  'integration-workflow.md': {
    fsPath: path.join(DOCS_BASE, 'manual', 'integration-workflow.md'),
    mimeType: 'text/markdown',
    name: 'ANAF e-Factura Integration Lifecycle',
    description: 'End-to-end guide covering the Authorize → Upload → Poll → Download lifecycle with cheat-header reference.',
  },
};

const OFFICIAL_FILES: Record<string, { fsPath: string; mimeType: string; name: string; description: string }> = {
  'limiteApeluriAPI.txt': {
    fsPath: path.join(DOCS_BASE, 'scraped', 'technical', 'limiteApeluriAPI.txt'),
    mimeType: 'text/plain',
    name: 'ANAF Official Rate Limits',
    description: 'Official ANAF rate limit specifications for all e-Factura endpoints.',
  },
  'swagger/upload.json': {
    fsPath: path.join(DOCS_BASE, 'scraped', 'technical', 'swagger', 'upload.json'),
    mimeType: 'application/json',
    name: 'ANAF Official Swagger — Upload',
    description: 'Official ANAF OpenAPI specification for the invoice upload endpoint.',
  },
  'swagger/staremesaj.json': {
    fsPath: path.join(DOCS_BASE, 'scraped', 'technical', 'swagger', 'staremesaj.json'),
    mimeType: 'application/json',
    name: 'ANAF Official Swagger — Stare Mesaj',
    description: 'Official ANAF OpenAPI specification for the message status endpoint.',
  },
  'swagger/descarcare.json': {
    fsPath: path.join(DOCS_BASE, 'scraped', 'technical', 'swagger', 'descarcare.json'),
    mimeType: 'application/json',
    name: 'ANAF Official Swagger — Descarcare',
    description: 'Official ANAF OpenAPI specification for the invoice download endpoint.',
  },
  'swagger/listamesaje.json': {
    fsPath: path.join(DOCS_BASE, 'scraped', 'technical', 'swagger', 'listamesaje.json'),
    mimeType: 'application/json',
    name: 'ANAF Official Swagger — Lista Mesaje',
    description: 'Official ANAF OpenAPI specification for the message list endpoint.',
  },
  'swagger/validare.json': {
    fsPath: path.join(DOCS_BASE, 'scraped', 'technical', 'swagger', 'validare.json'),
    mimeType: 'application/json',
    name: 'ANAF Official Swagger — Validare',
    description: 'Official ANAF OpenAPI specification for the XML validation endpoint.',
  },
  'swagger/validaresemnatura.json': {
    fsPath: path.join(DOCS_BASE, 'scraped', 'technical', 'swagger', 'validaresemnatura.json'),
    mimeType: 'application/json',
    name: 'ANAF Official Swagger — Validare Semnatura',
    description: 'Official ANAF OpenAPI specification for the signature validation endpoint.',
  },
  'swagger/xmltopdf.json': {
    fsPath: path.join(DOCS_BASE, 'scraped', 'technical', 'swagger', 'xmltopdf.json'),
    mimeType: 'application/json',
    name: 'ANAF Official Swagger — XML to PDF',
    description: 'Official ANAF OpenAPI specification for the XML-to-PDF transformation endpoint.',
  },
};

const RESOURCE_FILES: Record<string, { fsPath: string; mimeType: string; name: string; description: string }> = {
  'sample-ubl.xml': {
    fsPath: path.join(DOCS_BASE, 'resources', 'sample-ubl.xml'),
    mimeType: 'application/xml',
    name: 'Golden Sample UBL 2.1 Invoice',
    description: 'A minimal valid UBL 2.1 invoice that passes ANAF schema validation. Ready to upload as-is for integration tests.',
  },
  'error-codes.md': {
    fsPath: path.join(DOCS_BASE, 'resources', 'error-codes.md'),
    mimeType: 'text/markdown',
    name: 'ANAF Error Code Reference',
    description: 'Mapping of Romanian ANAF error messages to English explanations and suggested fixes.',
  },
};

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);
  private readonly activeTransports = new Map<string, SSEServerTransport>();

  private engine: SimulationEngineService | null = null;
  private swaggerDoc: object | null = null;
  private appRegistry: MockApplicationRegistryService | null = null;
  private identityRegistry: MockIdentityRegistryService | null = null;
  private ublGenerator: UblGeneratorService | null = null;
  private rateLimitStore: AnafRateLimitStoreService | null = null;

  /** Cached error catalogue built lazily from scraped Swagger files. */
  private errorCatalogueCache: object | null = null;

  initialize(
    engine: SimulationEngineService,
    swaggerDoc: object,
    appRegistry?: MockApplicationRegistryService,
    identityRegistry?: MockIdentityRegistryService,
    ublGenerator?: UblGeneratorService,
    rateLimitStore?: AnafRateLimitStoreService,
  ): void {
    this.engine = engine;
    this.swaggerDoc = swaggerDoc;
    this.appRegistry = appRegistry ?? null;
    this.identityRegistry = identityRegistry ?? null;
    this.ublGenerator = ublGenerator ?? null;
    this.rateLimitStore = rateLimitStore ?? null;
    this.logger.log('McpService initialized with simulation engine and Swagger document');
  }

  async connectSse(endpoint: string, res: ServerResponse): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - SSEServerTransport is marked as deprecated in newer SDKs, but we continue to use it here for stability.
    const transport = new SSEServerTransport(endpoint, res);
    const server = this.createServer();

    await server.connect(transport);

    const sessionId = transport.sessionId;
    this.activeTransports.set(sessionId, transport);
    this.logger.log(`MCP SSE session opened: ${sessionId}`);

    transport.onclose = () => {
      this.activeTransports.delete(sessionId);
      this.logger.log(`MCP SSE session closed: ${sessionId}`);
    };
  }

  async handleMessage(
    sessionId: string,
    req: IncomingMessage,
    res: ServerResponse,
    parsedBody: unknown,
  ): Promise<void> {
    const transport = this.activeTransports.get(sessionId);
    if (!transport) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `No active MCP session found for sessionId: ${sessionId}` }));
      return;
    }
    await transport.handlePostMessage(req, res, parsedBody);
  }

  // ── Public accessors (tested directly in unit tests) ───────────────────────

  getSimulationConfig(): object {
    this.assertInitialized();
    return this.engine!.getConfig();
  }

  listCheatHeaders(): CheatHeader[] {
    return CHEAT_HEADERS;
  }

  getSwaggerSpec(): object {
    this.assertInitialized();
    return this.swaggerDoc!;
  }

  listMockCompanies(): SimulationTypes.CompanyProfile[] {
    this.assertInitialized();
    return this.engine!.getKnownCompanies();
  }

  getMockCompany(cui: string): SimulationTypes.CompanyProfile | undefined {
    this.assertInitialized();
    return this.engine!.getCompany(cui);
  }

  listMockApplications(): SimulationTypes.PublicMockApplication[] {
    this.assertInitialized();
    if (!this.appRegistry) {
      return [];
    }
    return this.appRegistry.listApplications();
  }

  listMockIdentities(): SimulationTypes.IdentityProfile[] {
    this.assertInitialized();
    if (!this.identityRegistry) {
      return [];
    }
    return this.identityRegistry.listIdentities();
  }

  generateUblXml(
    supplierCui: string,
    customerCui: string,
    amount: number,
    currency: string,
    lineDescription: string,
  ): string {
    this.assertInitialized();

    const supplier = this.resolveCompanyOrPlaceholder(supplierCui, 'Supplier Company SRL', 'Str. Furnizor 1, Bucuresti', 'Bucuresti', 'Bucuresti');
    const customer = this.resolveCompanyOrPlaceholder(customerCui, 'Customer Company SRL', 'Str. Client 1, Cluj-Napoca', 'Cluj-Napoca', 'Cluj');

    const today = new Date().toISOString().slice(0, 10);

    const message: SimulationTypes.StoredInvoiceMessage = {
      id: `MCP-${Date.now()}`,
      data_creare: today.replace(/-/g, ''),
      creation_date: today,
      cif_emitent: supplier.numericCui,
      cif_beneficiar: customer.numericCui,
      cif: supplier.numericCui,
      id_solicitare: `MCP-${Date.now()}`,
      tip: 'FACTURA PRIMITA',
      detalii: lineDescription,
      suma: amount,
      currency,
      issueDate: today,
      payableAmount: amount,
      supplier,
      customer,
      lineDescription,
      createdAt: new Date(),
    };

    if (this.ublGenerator) {
      return this.ublGenerator.generateInvoiceXml(message);
    }

    // Minimal fallback when UblGeneratorService is unavailable
    return this.buildFallbackUblXml(supplier, customer, amount, currency, lineDescription, today);
  }

  getErrorCatalogue(): object {
    if (this.errorCatalogueCache) {
      return this.errorCatalogueCache;
    }

    this.errorCatalogueCache = this.buildErrorCatalogue();
    return this.errorCatalogueCache;
  }

  checkQuotaUsage(
    endpoint: string,
    discriminator: string,
  ): object {
    this.assertInitialized();

    const meta = QUOTA_ENDPOINTS[endpoint];
    if (!meta) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unknown endpoint "${endpoint}". Valid values: ${Object.keys(QUOTA_ENDPOINTS).join(', ')}`,
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const key = `${meta.keyPrefix}:${discriminator}:${today}`;
    const currentCount = this.rateLimitStore ? this.rateLimitStore.peekCount(key) : 0;
    const remaining = Math.max(0, meta.limit - currentCount);

    return {
      endpoint,
      discriminator,
      discriminatorLabel: meta.discriminatorLabel,
      description: meta.description,
      date: today,
      currentCount,
      limit: meta.limit,
      remaining,
      limitReached: currentCount >= meta.limit,
      storageKey: key,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private assertInitialized(): void {
    if (!this.engine || !this.swaggerDoc) {
      throw new McpError(
        ErrorCode.InternalError,
        'McpService has not been initialized. Call initialize() after app bootstrap.',
      );
    }
  }

  private resolveCompanyOrPlaceholder(
    cui: string,
    fallbackName: string,
    fallbackAddress: string,
    fallbackCity: string,
    fallbackCounty: string,
  ): SimulationTypes.CompanyProfile {
    const found = this.engine!.getCompany(cui);
    if (found) {
      return found;
    }

    const normalized = this.engine!.normalizeCui(cui);
    return {
      cui: normalized.ro,
      numericCui: normalized.numeric,
      name: fallbackName,
      address: fallbackAddress,
      city: fallbackCity,
      county: fallbackCounty,
      countryCode: 'RO',
      vatPayer: true,
    };
  }

  private buildFallbackUblXml(
    supplier: SimulationTypes.CompanyProfile,
    customer: SimulationTypes.CompanyProfile,
    amount: number,
    currency: string,
    lineDescription: string,
    issueDate: string,
  ): string {
    const escape = (s: string) =>
      s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c] ?? c));

    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:anaf.ro:efactura:1.0</cbc:ProfileID>
  <cbc:ID>MCP-GENERATED</cbc:ID>
  <cbc:IssueDate>${escape(issueDate)}</cbc:IssueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${escape(currency)}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${escape(supplier.name)}</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escape(supplier.cui)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${escape(customer.name)}</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escape(customer.cui)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:LegalMonetaryTotal>
    <cbc:PayableAmount currencyID="${escape(currency)}">${amount.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${escape(currency)}">${amount.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>${escape(lineDescription)}</cbc:Name></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="${escape(currency)}">${amount.toFixed(2)}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
  }

  private buildErrorCatalogue(): object {
    const swaggerDir = path.join(DOCS_BASE, 'scraped', 'technical', 'swagger');
    const catalogue: Record<string, { endpoint: string; errorMessages: string[] }> = {};

    let swaggerFiles: string[] = [];
    try {
      swaggerFiles = fs.readdirSync(swaggerDir).filter((f) => f.endsWith('.json'));
    } catch {
      return { errors: [], note: 'Swagger directory could not be read' };
    }

    for (const file of swaggerFiles) {
      const endpoint = path.basename(file, '.json');
      const errors: string[] = [];

      try {
        const raw = fs.readFileSync(path.join(swaggerDir, file), 'utf-8');
        const swagger = JSON.parse(raw) as Record<string, unknown>;
        this.extractErrorMessages(swagger, errors);
      } catch {
        // Skip unreadable files
        continue;
      }

      if (errors.length > 0) {
        catalogue[endpoint] = { endpoint, errorMessages: [...new Set(errors)] };
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      endpoints: Object.values(catalogue),
      totalErrors: Object.values(catalogue).reduce((sum, e) => sum + e.errorMessages.length, 0),
    };
  }

  private extractErrorMessages(node: unknown, results: string[]): void {
    if (!node || typeof node !== 'object') {
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        this.extractErrorMessages(item, results);
      }
      return;
    }

    const obj = node as Record<string, unknown>;

    // Extract from JSON fields: "eroare", "message", "errorMessage"
    for (const key of ['eroare', 'message', 'errorMessage']) {
      if (typeof obj[key] === 'string' && obj[key]) {
        results.push(obj[key] as string);
      }
    }

    // Extract errorMessage from XML strings (e.g., <Errors errorMessage="..."/>)
    for (const value of Object.values(obj)) {
      if (typeof value === 'string') {
        const xmlMatches = value.matchAll(/errorMessage="([^"]+)"/g);
        for (const match of xmlMatches) {
          results.push(match[1]);
        }
      } else {
        this.extractErrorMessages(value, results);
      }
    }
  }

  private readDocFile(fsPath: string): string {
    try {
      return fs.readFileSync(fsPath, 'utf-8');
    } catch {
      throw new McpError(ErrorCode.InternalError, `Could not read documentation file at: ${fsPath}`);
    }
  }

  // ── MCP Server factory ──────────────────────────────────────────────────────

  private createServer(): Server {
    const server = new Server(
      { name: 'anaf-mock-server', version: '1.0.0' },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
        instructions:
          'ANAF e-Factura Mock Server MCP interface. ' +
          'Use get_simulation_config to inspect current simulation settings, ' +
          'list_cheat_headers to discover available simulation override headers, ' +
          'get_swagger_spec to retrieve the full OpenAPI specification, ' +
          'list_mock_companies / get_company to explore registered test companies, ' +
          'list_mock_applications to see OAuth clients, ' +
          'list_mock_identities to see e-sign identity ownership, ' +
          'generate_ubl_xml to get a valid invoice XML template, ' +
          'get_error_catalogue to inspect all known Romanian error messages, and ' +
          'check_quota_usage to see daily rate-limit consumption.',
      },
    );

    // ── ListTools ─────────────────────────────────────────────────────────────

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_simulation_config',
          description:
            'Returns the current simulation engine configuration, including latency, ' +
            'error rates, rate limit settings, and strict ownership mode.',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
        {
          name: 'list_cheat_headers',
          description:
            'Lists all X-Simulate-* cheat headers supported by the mock server, ' +
            'with a description of what each header does and which endpoints it applies to.',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
        {
          name: 'get_swagger_spec',
          description:
            'Returns the full OpenAPI 3.x specification for the ANAF mock API as a JSON object.',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
        {
          name: 'list_mock_companies',
          description:
            'Returns all companies currently registered in the simulation engine. ' +
            'Each company profile includes its CUI, name, city, county, address, and VAT status. ' +
            'Use the CUI values as the `cif` parameter when uploading invoices.',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
        {
          name: 'get_company',
          description:
            'Retrieves a specific company profile by its Romanian CUI (e.g., "RO10000008" or "10000008"). ' +
            'Returns null if the CUI is not registered and strict VAT lookup is enabled.',
          inputSchema: {
            type: 'object',
            properties: {
              cui: {
                type: 'string',
                description: 'Romanian CUI — with or without the "RO" prefix.',
              },
            },
            required: ['cui'],
          },
        },
        {
          name: 'list_mock_applications',
          description:
            'Returns all registered mock OAuth applications. ' +
            'Each entry includes the clientId, redirectUris, and registration source. ' +
            'Use these clientId values in the /authorize and /token flows.',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
        {
          name: 'list_mock_identities',
          description:
            'Returns all mock e-sign identities and the CUIs they are currently authorized to manage. ' +
            'When a user selects an identity in the OAuth consent screen, the resulting access token ' +
            'can only upload/query invoices for the CUIs listed in that identity\'s authorizedCuis.',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
        {
          name: 'generate_ubl_xml',
          description:
            'Generates a valid ANAF-compliant UBL 2.1 invoice XML string. ' +
            'Looks up the supplier and customer company profiles by CUI from the simulation engine. ' +
            'Returns ready-to-upload XML that can be sent to POST /upload?standard=UBL.',
          inputSchema: {
            type: 'object',
            properties: {
              supplierCui: {
                type: 'string',
                description: 'CUI of the supplier (seller) company.',
              },
              customerCui: {
                type: 'string',
                description: 'CUI of the customer (buyer) company.',
              },
              amount: {
                type: 'number',
                description: 'Invoice payable amount (excluding VAT). Defaults to 1000.',
                default: 1000,
              },
              currency: {
                type: 'string',
                description: 'ISO 4217 currency code. Defaults to "RON".',
                default: 'RON',
              },
              lineDescription: {
                type: 'string',
                description: 'Description of the invoice line item.',
                default: 'Services rendered',
              },
            },
            required: ['supplierCui', 'customerCui'],
          },
        },
        {
          name: 'get_error_catalogue',
          description:
            'Scans all scraped official ANAF Swagger JSON files and returns a structured catalogue ' +
            'of every known Romanian error message, grouped by endpoint. ' +
            'Useful for understanding what error strings to expect when integration tests trigger error paths.',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
        {
          name: 'check_quota_usage',
          description:
            'Returns the current daily rate-limit consumption for a specific ANAF endpoint. ' +
            'Shows how many calls have been made today and how many remain before the limit is reached.',
          inputSchema: {
            type: 'object',
            properties: {
              endpoint: {
                type: 'string',
                enum: ['upload', 'stare', 'lista', 'lista_paginata', 'descarcare'],
                description:
                  'The ANAF endpoint to check. ' +
                  '"upload" tracks RASP uploads per CUI. ' +
                  '"stare" tracks status queries per id_incarcare. ' +
                  '"lista" tracks simple list queries per CUI. ' +
                  '"lista_paginata" tracks paginated list queries per CUI. ' +
                  '"descarcare" tracks downloads per message id.',
              },
              discriminator: {
                type: 'string',
                description:
                  'The CUI (for upload/lista/lista_paginata) or the specific message id (for stare/descarcare).',
              },
            },
            required: ['endpoint', 'discriminator'],
          },
        },
      ],
    }));

    // ── CallTool ──────────────────────────────────────────────────────────────

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const toolArgs = (args ?? {}) as Record<string, unknown>;

      if (name === 'get_simulation_config') {
        return { content: [{ type: 'text' as const, text: JSON.stringify(this.getSimulationConfig(), null, 2) }] };
      }

      if (name === 'list_cheat_headers') {
        return { content: [{ type: 'text' as const, text: JSON.stringify(this.listCheatHeaders(), null, 2) }] };
      }

      if (name === 'get_swagger_spec') {
        return { content: [{ type: 'text' as const, text: JSON.stringify(this.getSwaggerSpec(), null, 2) }] };
      }

      if (name === 'list_mock_companies') {
        return { content: [{ type: 'text' as const, text: JSON.stringify(this.listMockCompanies(), null, 2) }] };
      }

      if (name === 'get_company') {
        const cui = String(toolArgs['cui'] ?? '');
        if (!cui) {
          throw new McpError(ErrorCode.InvalidRequest, 'The "cui" argument is required.');
        }
        const company = this.getMockCompany(cui);
        return { content: [{ type: 'text' as const, text: JSON.stringify(company ?? null, null, 2) }] };
      }

      if (name === 'list_mock_applications') {
        return { content: [{ type: 'text' as const, text: JSON.stringify(this.listMockApplications(), null, 2) }] };
      }

      if (name === 'list_mock_identities') {
        return { content: [{ type: 'text' as const, text: JSON.stringify(this.listMockIdentities(), null, 2) }] };
      }

      if (name === 'generate_ubl_xml') {
        const supplierCui = String(toolArgs['supplierCui'] ?? '');
        const customerCui = String(toolArgs['customerCui'] ?? '');
        const amount = typeof toolArgs['amount'] === 'number' ? toolArgs['amount'] : 1000;
        const currency = String(toolArgs['currency'] ?? 'RON');
        const lineDescription = String(toolArgs['lineDescription'] ?? 'Services rendered');

        if (!supplierCui || !customerCui) {
          throw new McpError(ErrorCode.InvalidRequest, 'Both "supplierCui" and "customerCui" are required.');
        }

        const xml = this.generateUblXml(supplierCui, customerCui, amount, currency, lineDescription);
        return { content: [{ type: 'text' as const, text: xml }] };
      }

      if (name === 'get_error_catalogue') {
        return { content: [{ type: 'text' as const, text: JSON.stringify(this.getErrorCatalogue(), null, 2) }] };
      }

      if (name === 'check_quota_usage') {
        const endpoint = String(toolArgs['endpoint'] ?? '');
        const discriminator = String(toolArgs['discriminator'] ?? '');
        if (!endpoint || !discriminator) {
          throw new McpError(ErrorCode.InvalidRequest, 'Both "endpoint" and "discriminator" are required.');
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(this.checkQuotaUsage(endpoint, discriminator), null, 2) }] };
      }

      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    });

    // ── ListResources ─────────────────────────────────────────────────────────

    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: SWAGGER_RESOURCE_URI,
          name: 'ANAF Mock API — OpenAPI Specification',
          description: 'Full OpenAPI 3.x specification for the ANAF e-Factura mock server.',
          mimeType: 'application/json',
        },
        {
          uri: 'docs://readme.md',
          name: 'Project README',
          description: 'High-level documentation, features, and setup instructions for the ANAF mock server.',
          mimeType: 'text/markdown',
        },
        ...Object.entries(MANUAL_FILES).map(([filename, meta]) => ({
          uri: `docs://manual/${filename}`,
          name: meta.name,
          description: meta.description,
          mimeType: meta.mimeType,
        })),
        ...Object.entries(OFFICIAL_FILES).map(([filename, meta]) => ({
          uri: `docs://official/${filename}`,
          name: meta.name,
          description: meta.description,
          mimeType: meta.mimeType,
        })),
        ...Object.entries(RESOURCE_FILES).map(([filename, meta]) => ({
          uri: `docs://resources/${filename}`,
          name: meta.name,
          description: meta.description,
          mimeType: meta.mimeType,
        })),
      ],
    }));

    // ── ReadResource ──────────────────────────────────────────────────────────

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      if (uri === SWAGGER_RESOURCE_URI) {
        return {
          contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(this.getSwaggerSpec(), null, 2) }],
        };
      }

      if (uri === 'docs://readme.md') {
        const readmePath = path.join(process.cwd(), 'README.md');
        const text = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf-8') : 'README not found.';
        return { contents: [{ uri, mimeType: 'text/markdown', text }] };
      }

      // docs://manual/{filename}
      const manualMatch = uri.match(/^docs:\/\/manual\/(.+)$/);
      if (manualMatch) {
        const filename = manualMatch[1];
        const meta = MANUAL_FILES[filename];
        if (!meta) {
          throw new McpError(ErrorCode.InvalidRequest, `Unknown manual document: ${filename}`);
        }
        return { contents: [{ uri, mimeType: meta.mimeType, text: this.readDocFile(meta.fsPath) }] };
      }

      // docs://official/{filename} or docs://official/swagger/{filename}
      const officialMatch = uri.match(/^docs:\/\/official\/(.+)$/);
      if (officialMatch) {
        const filename = officialMatch[1];
        const meta = OFFICIAL_FILES[filename];
        if (!meta) {
          throw new McpError(ErrorCode.InvalidRequest, `Unknown official document: ${filename}`);
        }
        return { contents: [{ uri, mimeType: meta.mimeType, text: this.readDocFile(meta.fsPath) }] };
      }

      // docs://resources/{filename}
      const resourceMatch = uri.match(/^docs:\/\/resources\/(.+)$/);
      if (resourceMatch) {
        const filename = resourceMatch[1];
        const meta = RESOURCE_FILES[filename];
        if (!meta) {
          throw new McpError(ErrorCode.InvalidRequest, `Unknown resource document: ${filename}`);
        }
        return { contents: [{ uri, mimeType: meta.mimeType, text: this.readDocFile(meta.fsPath) }] };
      }

      throw new McpError(ErrorCode.InvalidRequest, `Unknown resource URI: ${uri}`);
    });

    // ── ListPrompts ───────────────────────────────────────────────────────────

    server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: [
        {
          name: 'anaf_integration_assistant',
          description: 'Instructs the AI to act as an expert assistant for integrating with the ANAF e-Factura mock server.',
        },
      ],
    }));

    // ── GetPrompt ─────────────────────────────────────────────────────────────

    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name } = request.params;

      if (name === 'anaf_integration_assistant') {
        return {
          description: 'Initializes the AI with deep context about the ANAF Mock Server architecture.',
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text:
                  'You are an expert Romanian API integration developer. Your current task is to help the user integrate ' +
                  'with the `anaf-mock-server` (a high-fidelity digital twin of the real ANAF e-Factura system).\n\n' +
                  'Start by reading the `docs://manual/integration-workflow.md` resource for the complete 4-step lifecycle ' +
                  '(Authorize → Upload → Poll → Download). Then read `api://swagger.json` for the exact OpenAPI specs.\n\n' +
                  'Use these tools to explore the sandbox:\n' +
                  '- `list_mock_companies` — discover available test CUIs\n' +
                  '- `list_mock_applications` — find valid OAuth clientIds\n' +
                  '- `list_mock_identities` — see which identities own which CUIs\n' +
                  '- `generate_ubl_xml` — generate a ready-to-upload UBL invoice\n' +
                  '- `get_error_catalogue` — understand all possible Romanian error strings\n' +
                  '- `check_quota_usage` — monitor daily rate-limit consumption\n\n' +
                  'When writing integration code, remind the user that `X-Simulate-*` headers ' +
                  '(listed via `list_cheat_headers`) can trigger edge-case scenarios like 10 MB limits, ' +
                  'NOK processing, or missing SPV authorization without needing special test data.',
              },
            },
          ],
        };
      }

      throw new McpError(ErrorCode.MethodNotFound, `Unknown prompt: ${name}`);
    });

    return server;
  }
}
