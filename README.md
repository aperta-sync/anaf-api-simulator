# ANAF API Simulation Engine (Digital Twin)

A NestJS-based high-fidelity simulator for building and testing integrations with Romanian ANAF APIs, including OAuth2, e-Factura, and VAT lookup workflows.

This service is designed for local development and CI environments where you want realistic API behavior without requiring a physical digital certificate, live ANAF credentials, or an actual ANAF developer account.

## Features

- **Full OAuth2 Flow:** Authorization Code grant flow, Token exchange, and Refresh support.
- **e-Factura Simulation:** Message list polling (`listaMesajeFactura`) and ZIP generation (`descarcare`) with valid UBL 2.1 XML.
- **VAT Registry Simulation:** Mock VAT lookup (v9 standard) with deterministic company data.
- **Developer Portal UI:** Built-in dashboard at `/console` for app registration and identity management.
- **Fault Injection:** Configurable latency, random 500/504 errors, and 429 rate-limiting modes.
- **Traffic Generation:** Background cron tasks to simulate active SPV inboxes.
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

_This tool is intended for development and testing only._
