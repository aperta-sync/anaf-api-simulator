import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiExcludeEndpoint,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import {
  GetMockApplicationQuery,
  GetInvoiceNetworkGraphQuery,
  ListMockIdentitiesQuery,
  ListInternalCompaniesQuery,
  ListInternalMessagesQuery,
  ListMockApplicationsQuery,
} from '../../application/developer-portal/developer-portal.queries';
import { SimulationTypes } from '../../domain/simulation.types';

@ApiTags('Developer Portal')
@Controller()
export class DeveloperPortalQueryHttpController {
  private static readonly ASSET_CONTENT_TYPES: Record<string, string> = {
    'console.css': 'text/css; charset=utf-8',
    'console.js': 'application/javascript; charset=utf-8',
  };

  private static readonly CONSOLE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mock API Console</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@700;800&family=JetBrains+Mono&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
    <link rel="stylesheet" href="/developer-portal/assets/console.css" />
  </head>
  <body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
    <script src="/developer-portal/assets/console.js" defer></script>
  </body>
</html>`;

  private static readonly CALLBACK_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Authorization Result</title>
    <style>
      body { font-family: Inter, system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; background: #f8fafc; margin: 0; }
      .card { background: white; padding: 2rem 2.25rem; border-radius: 1rem; box-shadow: 0 20px 32px -20px rgba(15,23,42,0.45); text-align: center; width: min(420px, 90vw); }
      .icon { width: 56px; height: 56px; margin: 0 auto 1rem; border-radius: 999px; display: grid; place-items: center; font-size: 1.75rem; font-weight: 800; }
      .icon.success { color: #047857; background: #d1fae5; }
      .icon.error { color: #b91c1c; background: #fee2e2; }
      h2 { margin: 0 0 0.5rem; font-size: 1.35rem; }
      p { margin: 0; color: #475569; line-height: 1.45; }
    </style>
  </head>
  <body>
    <div class="card">
      <div id="result-icon" class="icon success" aria-hidden="true">✓</div>
      <h2 id="result-title">Success</h2>
      <p id="result-message">Authorization complete. This window will close automatically.</p>
    </div>
    <script>
      (function () {
        const params = new URLSearchParams(window.location.search);
        const error = params.get('error');
        const errorDescription = params.get('error_description');

        const iconEl = document.getElementById('result-icon');
        const titleEl = document.getElementById('result-title');
        const messageEl = document.getElementById('result-message');

        if (error && iconEl && titleEl && messageEl) {
          iconEl.className = 'icon error';
          iconEl.textContent = '✕';
          titleEl.textContent = 'Authorization Failed';
          messageEl.textContent = errorDescription || ('OAuth error: ' + error);
        }

        const payload = {
          type: 'anaf-oauth-callback',
          code: params.get('code'),
          state: params.get('state'),
          error: error,
          error_description: errorDescription,
        };

        if (window.opener) {
          window.opener.postMessage(payload, window.location.origin);
          window.setTimeout(function () { window.close(); }, 1000);
        }
      })();
    </script>
  </body>
</html>`;

  private readonly assets: Record<string, string>;

  constructor(private readonly queryBus: QueryBus) {
    this.assets = {
      'console.css': this.loadAsset('console.css'),
      'console.js': this.loadAsset('console.js'),
    };
  }

  @Get(['/', '/apps', '/oauth', '/data', '/inspector', '/settings'])
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiExcludeEndpoint()
  renderConsole(): string {
    return DeveloperPortalQueryHttpController.CONSOLE_HTML;
  }

  @Get('developer-portal/assets/:assetName')
  @ApiExcludeEndpoint()
  serveAsset(
    @Param('assetName') assetName: string,
    @Res() response: Response,
  ): void {
    const contentType =
      DeveloperPortalQueryHttpController.ASSET_CONTENT_TYPES[assetName];
    const content = this.assets[assetName];
    if (!contentType || !content) throw new NotFoundException();
    response.setHeader('Content-Type', contentType);
    response.send(content);
  }

  @Get('developer-portal/oauth/callback')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiExcludeEndpoint()
  renderOAuthCallbackCapture(): string {
    return DeveloperPortalQueryHttpController.CALLBACK_HTML;
  }

  @Get('favicon.ico')
  @ApiExcludeEndpoint()
  serveFavicon(@Res() response: Response): void {
    response.status(204).send();
  }

  @Get('developer-portal/api/internal/companies')
  @ApiOperation({ summary: 'List all seeded companies', description: 'Returns all company profiles currently in the mock registry.' })
  @ApiResponse({ status: 200, description: 'Array of CompanyProfile objects wrapped in {companies}' })
  async listAllCompanies() {
    return {
      companies: await this.queryBus.execute(new ListInternalCompaniesQuery()),
    };
  }

  @Get('developer-portal/api/internal/messages')
  @ApiOperation({ summary: 'List all stored invoice messages', description: 'Returns all invoice messages currently stored in the mock registry.' })
  @ApiResponse({ status: 200, description: 'Array of StoredInvoiceMessage objects wrapped in {messages}' })
  async listAllMessages() {
    return {
      messages: await this.queryBus.execute(new ListInternalMessagesQuery()),
    };
  }

  @Get('developer-portal/api/internal/identities')
  @ApiOperation({ summary: 'List all mock signer identities', description: 'Returns the signer identities available in the mock, including their authorized CUI list.' })
  @ApiResponse({ status: 200, description: 'Array of IdentityProfile objects wrapped in {identities}' })
  async listMockIdentities() {
    return {
      identities: await this.queryBus.execute(new ListMockIdentitiesQuery()),
    };
  }

  @Get('developer-portal/api/internal/graph')
  @ApiOperation({ summary: 'Get invoice network graph', description: 'Returns a force-directed graph of invoice relationships between companies for the given time window.' })
  @ApiQuery({ name: 'days', required: false, description: 'Time window in days (1–90, default 30)', example: '30' })
  @ApiResponse({ status: 200, description: 'InvoiceNetworkGraph object with nodes and edges' })
  async getInvoiceNetworkGraph(@Query('days') days?: string) {
    const windowDays = Math.min(
      90,
      Math.max(1, Number.parseInt(days ?? '30', 10)),
    );
    return {
      graph: await this.queryBus.execute(
        new GetInvoiceNetworkGraphQuery(windowDays),
      ),
    };
  }

  @Get('developer-portal/api/apps')
  @ApiOperation({ summary: 'List all registered mock applications' })
  @ApiResponse({ status: 200, description: 'Array of RegisteredMockApplication objects wrapped in {applications}' })
  async listApplications() {
    const apps = await this.queryBus.execute(new ListMockApplicationsQuery());
    return { applications: apps.map((app) => this.toApiModel(app)) };
  }

  @Get('developer-portal/api/apps/:clientId')
  @ApiOperation({ summary: 'Get a mock application by client ID' })
  @ApiParam({ name: 'clientId', description: 'OAuth client identifier' })
  @ApiResponse({ status: 200, description: 'RegisteredMockApplication wrapped in {application}' })
  @ApiResponse({ status: 404, description: 'Not Found' })
  async getApplication(@Param('clientId') clientId: string) {
    const existing = await this.queryBus.execute(
      new GetMockApplicationQuery(clientId),
    );
    if (!existing) throw new NotFoundException();
    return { application: this.toApiModel(existing) };
  }

  private toApiModel(app: SimulationTypes.RegisteredMockApplication) {
    return {
      applicationName: app.applicationName,
      clientId: app.clientId,
      clientSecret: app.clientSecret,
      redirectUris: app.redirectUris,
      createdAt: app.createdAt,
      source: app.source,
    };
  }

  private resolveAssetPath(assetName: string): string | undefined {
    const candidates = [
      join(__dirname, '..', '..', 'presentation', 'http', 'assets', assetName),
      join(
        __dirname,
        '..',
        '..',
        '..',
        'presentation',
        'http',
        'assets',
        assetName,
      ),
      join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'simulation',
        'presentation',
        'http',
        'assets',
        assetName,
      ),
      join(
        process.cwd(),
        'dist',
        'simulation',
        'presentation',
        'http',
        'assets',
        assetName,
      ),
      join(
        process.cwd(),
        'src',
        'simulation',
        'presentation',
        'http',
        'assets',
        assetName,
      ),
      join(process.cwd(), 'assets', assetName),
    ];
    return candidates.find((candidate) => existsSync(candidate));
  }

  private loadAsset(assetName: string): string {
    const resolved = this.resolveAssetPath(assetName);
    if (!resolved)
      throw new Error(
        `Required developer portal asset is missing: ${assetName}`,
      );
    return readFileSync(resolved, 'utf-8');
  }
}
