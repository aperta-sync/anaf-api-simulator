# ANAF API Simulation Engine (Digital Twin)

[![CI](https://github.com/aperta-sync/anaf-api-simulator/actions/workflows/ci.yml/badge.svg)](https://github.com/aperta-sync/anaf-api-simulator/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/aperta-sync/anaf-api-simulator?style=social)](https://github.com/aperta-sync/anaf-api-simulator/stargazers)
![Badge](https://hitscounter.dev/api/hit?url=https%3A%2F%2Fgithub.com%2Faperta-sync%2Fanaf-api-simulator&label=Views&icon=github&color=%230d6efd&message=&style=flat&tz=UTC)

A NestJS-based high-fidelity simulator for building and testing integrations with Romanian ANAF APIs, including OAuth2, e-Factura, and VAT lookup workflows.

This service is designed for local development and CI environments where you want realistic API behavior without requiring a physical digital certificate, live ANAF credentials, or an actual ANAF developer account.

## Features

- **Full OAuth2 Flow:** Authorization Code grant flow, Token exchange, and Refresh support.
- **e-Factura Simulation:** 100% OpenAPI compliant implementations of `/upload`, `/uploadb2c`, `/stareMesaj`, `/listaMesajeFactura`, `/listaMesajePaginatieFactura`, and `/descarcare`.
- **ANAF-Specific Rate Limiting:** Enforces official daily quotas (e.g., 1000 RASP/day, 100,000 paginated list queries/day) with exact ANAF error messages.
- **Strict Validation:** Replicates ANAF's unique HTTP 200 XML/JSON error responses for file sizes (>10MB), invalid timestamps (60-day limits), and missing parameters.
- **Fault Injection:** Configurable latency, random 500/504 errors, and generic 429 rate-limiting modes for edge-case testing.
- **Traffic Generation:** Background tasks to simulate active SPV inboxes with realistic inter-company invoice flow.
- **VAT Registry Simulation:** Mock VAT lookup (v9 standard) with deterministic company data.
- **Developer Portal UI:** Built-in dashboard at `/console` for app registration and identity management.
- **Flexible Storage:** In-memory state by default, or Redis-backed for persistent simulation across restarts.

---

## Getting Started

### Local Development

1. **Install Dependencies:**
   ```bash
   npm install
   ```
2. **Run in Watch Mode:**
   ```bash
   npm run start:dev
   ```
   Open `http://localhost:3003/console` to manage the mock environment.

### Docker Usage

The project includes a multi-stage **lightweight Dockerfile** (Alpine-based) optimized for production.

1. **Build the image locally:**
   ```bash
   docker build -t anaf-mock-server:latest .
   ```
2. **Run with default settings:**
   ```bash
   docker run -p 3003:3003 anaf-mock-server:latest
   ```
3. **Run with custom Simulation Settings:**
   ```bash
   docker run -p 3003:3003 \
     -e ANAF_MOCK_LATENCY_MS=500 \
     -e ANAF_MOCK_ERROR_RATE=5 \
     -e ANAF_MOCK_STRICT_OWNERSHIP=true \
     anaf-mock-server:latest
   ```

## Documentation

The project maintains a high-fidelity sync with official ANAF documentation.

- **[Official Docs](docs/anaf/official/)**: Original PDFs and registration procedures.
- **[Manual Guides](docs/anaf/manual/)**: Human-readable summaries of API endpoints and OAuth2 registration.
- **[Scraped Assets](docs/anaf/scraped/)**:
  - **Swagger JSONs**: `docs/anaf/scraped/technical/swagger/` contains automated OpenAPI extractions.
  - **Technical Specs**: `docs/anaf/scraped/technical/` contains raw HTML and text limit files.

### CI/CD Documentation Parity

Our GitHub Action `Check ANAF Documentation Parity` ensures the codebase stays in sync. If ANAF updates their documentation, the pipeline will fail, alerting us to update the mock server.

To update the scraped documentation locally, run:

```bash
node scripts/anaf-scraper.mjs
```

### Simulating Edge Cases (Cheat Headers)

You can trigger specific ANAF error responses by sending custom HTTP headers with your requests. This is useful for testing your application's error-handling logic.

| Header                         | Value  | Description                                                       |
| :----------------------------- | :----- | :---------------------------------------------------------------- |
| `X-Simulate-Upload-Error`      | `true` | Returns a generic upload validation error XML.                    |
| `X-Simulate-Xml-Validation`    | `true` | Returns a SAXParseException (invalid XML) error XML.              |
| `X-Simulate-No-Spv`            | `true` | Returns "Nu exista niciun CIF pentru care sa aveti drept in SPV". |
| `X-Simulate-Wrong-Certificate` | `true` | Returns an `ANAF_CUI_MISMATCH` 403 error.                         |
| `X-Simulate-Technical-Error`   | `true` | Returns a "Cod: SIM-001" technical error XML.                     |

---

## Configuration Reference

The server behavior is controlled by environment variables. These can be set in a `.env` file or passed directly to Docker.

### Core Server Settings

| Variable            | Default  | Description                              |
| :------------------ | :------- | :--------------------------------------- |
| `ANAF_MOCK_PORT`    | `3003`   | HTTP port the server listens on.         |
| `ANAF_MOCK_STORE`   | `memory` | State backend: `memory` or `redis`.      |
| `ANAF_MOCK_VERSION` | `0.1.0`  | Injected version string shown in the UI. |

### Simulation Settings

| Variable                     | Default | Description                                                                |
| :--------------------------- | :------ | :------------------------------------------------------------------------- |
| `ANAF_MOCK_LATENCY_MS`       | `200`   | Artificial delay (ms) for every API response.                              |
| `ANAF_MOCK_ERROR_RATE`       | `0`     | Probability (0-100) of random 500/504 failures.                            |
| `ANAF_MOCK_RATE_LIMIT_MODE`  | `off`   | Throttle strategy: `off`, `deterministic`, or `windowed`.                  |
| `ANAF_MOCK_STRICT_OWNERSHIP` | `true`  | When enabled, OAuth tokens must "own" the target CIF to download invoices. |
| `ANAF_MOCK_STRICT_VAT`       | `false` | When enabled, only explicitly seeded companies are found.                  |
| `ANAF_MOCK_AUTO_TRAFFIC`     | `false` | Automatically generates random invoices every minute.                      |

### Redis Settings (Required if store is `redis`)

| Variable     | Default     | Description                                                  |
| :----------- | :---------- | :----------------------------------------------------------- |
| `REDIS_URL`  |             | Full connection string (e.g. `redis://user:pass@host:port`). |
| `REDIS_HOST` | `127.0.0.1` | Fallback host if `REDIS_URL` is missing.                     |
| `REDIS_PORT` | `6379`      | Fallback port if `REDIS_URL` is missing.                     |

### Bootstrap & Seeding

| Variable                     | Default     | Description                                                 |
| :--------------------------- | :---------- | :---------------------------------------------------------- |
| `ANAF_MOCK_BOOTSTRAP_PRESET` | `anaf-core` | Startup seed dataset: `anaf-core`, `anaf-large`, or `none`. |
| `ANAF_MOCK_BOOTSTRAP_CUIS`   |             | Comma-separated Romanian CUIs to seed on startup.           |

---

## Advanced Usage

### Runtime Configuration API

You can change the simulation behavior on the fly without restarting:

```bash
curl -X PATCH http://localhost:3003/simulation/config \
  -H "Content-Type: application/json" \
  -d '{ "latencyMs": 500, "errorRate": 10 }'
```

### Testing

- **Unit Tests:** `npm run test`
- **E2E Tests:** `npm run test:e2e` (Uses an in-memory server to verify full flows).

---

## Contributing

We welcome contributions from the community to make this simulator more robust! To maintain stability, our `master` branch is protected. Please follow this standard workflow:

1. **Open an Issue:** Before writing code, please open an issue using our **Bug Report** or **Feature Request** templates to discuss your proposed changes.
2. **Create a Branch:** Check out a new feature branch from `master` (e.g., `git checkout -b feat/new-spv-endpoint`).
3. **Commit & Push:** Make your changes and push them to your branch. Ensure your code passes all linting and local tests (`npm run test`).
4. **Open a Pull Request:** Submit a PR against the `master` branch using the provided PR template.
5. **CI/CD Validation:** Our automated CI pipeline will trigger to run tests and validate the Docker build. The CI status must be **green** before a maintainer can review and merge your PR.

---

_This tool is intended for development and testing only._
