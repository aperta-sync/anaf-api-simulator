# ANAF API Simulation Engine

A NestJS-based simulator for building and testing integrations with Romanian ANAF APIs, including OAuth2, e-Factura, and VAT lookup workflows.

This service is designed for local development and CI environments where you want realistic API behavior without requiring a physical digital certificate, live ANAF credentials, or an actual ANAF developer account.

## Introduction

The ANAF API Simulation Engine provides a high-fidelity digital twin of the key ANAF integration surfaces used by accounting and invoicing systems:

- OAuth2 authorization and token exchange
- e-Factura message polling and ZIP download flow
- Public VAT registry-style company lookup

It also includes a built-in developer portal to self-register mock OAuth applications and generate credentials on demand.

## Key Features

- Full OAuth2 Flow
  - Authorization Code grant flow
  - Token exchange endpoint
  - Refresh token support
  - Strict client credential and redirect URI validation
- e-Factura Simulation
  - Message list polling via `listaMesajeFactura`
  - Dynamic ZIP generation via `descarcare`
  - ZIP payload includes valid UBL 2.1 invoice XML and signature file
  - Identity-aware ownership firewall for CIF-scoped access checks
- Public VAT Registry Simulation
  - Mock VAT lookup for Romanian companies (v9 standard)
  - Deterministic company metadata generation
  - Strict lookup behavior with 404 `NOT_FOUND` response mode
- Developer Portal UI
  - Web dashboard for app registration
  - Self-service `client_id` and `client_secret` generation
  - Active application registry view
  - Mock identity ownership matrix for e-sign and CIF authorization testing
- Simulation Engine
  - Deterministic seed presets (`anaf-core`, `anaf-large`) for repeatable datasets
  - Optional synthetic runtime traffic generation (powered by background Cron)
  - Legal Date Drift simulation (invoice issue date appears 1 to 5 days before upload date)
  - Invoice network graph aggregation for inspector visualization
- Fault Injection
  - Configurable latency
  - Configurable random 500/504 faults
  - Configurable 429 rate-limit modes (deterministic and sliding-window)
- Storage Options
  - In-memory state store
  - Redis-backed state store (with automatic memory fallback)

## Replicated API Surface

The server mirrors key ANAF path structures used in production integrations.

| Capability             | Official ANAF Pattern                                     | Local Mock Equivalent                                      |
| ---------------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| OAuth2 Authorize       | `https://logincert.anaf.ro/anaf-oauth2/v1/authorize`      | `http://localhost:3003/anaf-oauth2/v1/authorize`           |
| OAuth2 Token           | `https://logincert.anaf.ro/anaf-oauth2/v1/token`          | `http://localhost:3003/anaf-oauth2/v1/token`               |
| e-Factura Message List | `https://api.anaf.ro/prod/FCTEL/rest/listaMesajeFactura`  | `http://localhost:3003/prod/FCTEL/rest/listaMesajeFactura` |
| e-Factura Download     | `https://api.anaf.ro/prod/FCTEL/rest/descarcare`          | `http://localhost:3003/prod/FCTEL/rest/descarcare`         |
| VAT Lookup (v9)        | `https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva` | `http://localhost:3003/api/PlatitorTvaRest/v9/tva`         |

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn
- Optional: Redis (for persistent state mode)

### Environment Variables

| Variable                     | Default     | Required | Description                                                          |
| ---------------------------- | ----------- | -------- | -------------------------------------------------------------------- |
| `ANAF_MOCK_PORT`             | `3003`      | No       | HTTP port for the mock server                                        |
| `ANAF_MOCK_STORE`            | `memory`    | No       | State backend: `memory` or `redis`                                   |
| `ANAF_MOCK_BOOTSTRAP_CUIS`   | _(empty)_   | No       | Comma-separated Romanian CUIs seeded on startup (checksum-validated) |
| `ANAF_MOCK_BOOTSTRAP_PRESET` | `anaf-core` | No       | Startup seed preset (`anaf-core`, `anaf-large`, or `none`)           |
| `ANAF_CLIENT_ID`             | _(empty)_   | No       | Optional app bootstrap client ID for OAuth                           |
| `ANAF_CLIENT_SECRET`         | _(empty)_   | No       | Optional app bootstrap client secret for OAuth                       |
| `ANAF_CALLBACK_URL`          | _(empty)_   | No       | Optional redirect URI used with env-bootstrapped OAuth app           |
| `REDIS_URL`                  | _(empty)_   | No       | Redis connection URL (used when `ANAF_MOCK_STORE=redis`)             |
| `REDIS_HOST`                 | `127.0.0.1` | No       | Redis host fallback                                                  |
| `REDIS_PORT`                 | `6379`      | No       | Redis port fallback                                                  |

## Simulation Settings Reference

You can configure these settings via the **Settings** tab in the Developer Console or the `PATCH /simulation/config` API.

| Setting                     | UI Label              | Description                                                                                                   |
| :-------------------------- | :-------------------- | :------------------------------------------------------------------------------------------------------------ |
| `latencyMs`                 | **Latency (ms)**      | Adds an artificial delay to every API response to test frontend loading states and timeouts.                  |
| `errorRate`                 | **Fail Rate (%)**     | The probability (0-100) that a request will randomly fail with a `500 Server Error` or `504 Timeout`.         |
| `trafficProbability`        | **Traffic Prob**      | The chance (0.0 to 1.0) that a background cron tick will generate new invoices for known companies.           |
| `strictVatLookup`           | **Strict VAT Lookup** | When **ON**, the VAT API only finds companies that were explicitly seeded or bootstrapped.                    |
| `strictOwnershipValidation` | **Strict Ownership**  | When **ON**, checking an inbox or downloading a ZIP requires an OAuth Token that "owns" the target CIF.       |
| `autoGenerateTraffic`       | **Synthetic Traffic** | Enables background generation of random invoices every minute to simulate an active SPV inbox.                |
| `rateLimitMode`             | **429 Throttle Mode** | Selects rate-limiting strategy: `off`, `deterministic` (every 5th request), or `windowed` (time-frame based). |
| `rateLimitMaxRequests`      | **Max Requests**      | For `windowed` mode, maximum requests allowed per client during the configured time frame.                    |
| `rateLimitWindowMs`         | **Window (seconds)**  | For `windowed` mode, time-frame length used for throttling decisions (stored as milliseconds in config).      |
| `rateLimitTrigger`          | **Legacy 429 Toggle** | Backward-compatible boolean alias. When enabled without an explicit mode, defaults to deterministic behavior. |

## Advanced Usage

### Runtime Configuration

```bash
curl -X PATCH http://localhost:3003/simulation/config \
  -H "Content-Type: application/json" \
  -d '{ "latencyMs": 500, "autoGenerateTraffic": true }'
```

### Inspector APIs (Internal)

- `GET /developer-portal/api/internal/companies`: List all simulated company profiles.
- `GET /developer-portal/api/internal/messages`: List all generated invoices globally.
- `GET /developer-portal/api/internal/identities`: List all mock identities and their ownership mappings.
- `GET /developer-portal/api/internal/graph?days=30`: Get directed traffic graph data.

---

_This simulator is intended for development and testing only._
