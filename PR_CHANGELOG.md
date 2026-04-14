# Changelog: e-Factura Core Endpoints & ANAF Compliance

🎉 **A massive thank you to our contributors @octavianparalescu and @D2758695161!** 🎉

This release is built entirely on the fantastic foundation laid out by your pull requests. Thank you both for your hard work in reverse-engineering the ANAF API, setting up the CQRS handlers, and implementing the core e-Factura endpoints (`/upload`, `/stareMesaj`, `/listaMesajePaginatieFactura`). Your initiative in aligning the message schemas and upload tracking logic was spot on and made this release possible!

Based on your initial implementations, we've polished the endpoints to achieve 100% fidelity with the official ANAF OpenAPI (Swagger) specifications.

## 🚀 Features (Thanks to @octavianparalescu & @D2758695161)

*   **POST `/upload` & `/uploadb2c`**:
    *   Accepts raw XML invoice body (UTF-8) and returns ANAF-format XML (`mfp:anaf:dgti:spv:respUploadFisier:v1`) with `index_incarcare` and `ExecutionStatus`.
    *   Supports `extern`, `autofactura`, `executare` query parameters.
    *   Enforces a strict **10 MB** file size limit.
*   **GET `/stareMesaj`**:
    *   Lazy processing completion check based on `processingDelayMs` config.
    *   Returns all 4 official `stare` values: `ok`, `nok`, `in prelucrare`, `XML cu erori nepreluat de sistem`.
    *   Includes `id_descarcare` for both `ok` and `nok` (per ANAF spec).
    *   Always returns HTTP 200 (no 404 for unknown index, returns specific ANAF XML error instead).
*   **GET `/listaMesajeFactura` & `/listaMesajePaginatieFactura`**:
    *   Time-range filtering (`startTime`/`endTime` in ms since epoch) with pagination (`pagina`, `perPage`) and `filtru` validation.
    *   ANAF-standard response envelope (`mesaje`, `serial`, `cui`, `titlu`, plus pagination fields).
    *   Enforces ANAF business rules: `startTime` cannot be older than 60 days.
*   **Infrastructure**:
    *   Upload tracking store with monotonic sequence allocation for `index_incarcare`.
    *   `processingDelayMs` config (env: `ANAF_MOCK_PROCESSING_DELAY_MS`, default 3000ms).

## 🛡️ ANAF Compliance & Refinements

Building on the contributors' work, the following refinements were made to perfectly match the real ANAF API behavior:

*   **Automated Documentation Sync**: Added a scraper (`docs/anaf/scraped/`) and GitHub Actions workflow to automatically extract OpenAPI JSONs from ANAF's portal daily.
*   **Rate Limiting (`AnafRateLimitService`)**: Implemented specific ANAF daily quotas returning exact Romanian error strings:
    *   `/upload` (RASP): 1000 files/day/CUI
    *   `/stareMesaj`: 100 queries/day per specific `id_incarcare`
    *   `/listaMesajeFactura`: 1500 queries/day/CUI
    *   `/listaMesajePaginatieFactura`: 100,000 queries/day/CUI
    *   `/descarcare`: 10 downloads/day per specific message id
*   **Relaxed DTOs & HTTP 200 Errors**: Removed strict NestJS `class-validator` rules so invalid inputs bypass generic 400 Bad Request errors. The mock server now manually captures these and returns the highly specific, localized Romanian error strings via `HTTP 200 OK`, exactly as the real ANAF API does.
*   **Schema Alignment**: Message entry fields strictly reduced to the ANAF-standard 6 fields. Date formats updated to `YYYYMMDDHHmm`.

## 🧪 Testing & Edge Cases

*   **Simulation Cheat Headers**: Added custom headers (e.g., `X-Simulate-Upload-Error`, `X-Simulate-No-Spv`, `X-Simulate-Technical-Error`) to easily trigger specific ANAF error states for client testing.
*   **Exhaustive Unit Tests**: Added 77 new unit tests to cover *every single* "unhappy path" and error response example defined in the scraped ANAF Swagger JSONs.
