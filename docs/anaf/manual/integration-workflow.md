# ANAF e-Factura Integration Lifecycle Guide

## Introduction

This guide describes the **complete 4-step lifecycle** for integrating with the ANAF e-Factura system (or this mock server). Every B2B/B2C electronic invoice submission follows the same sequence:

```
Step 1: Authorize   →   Step 2: Upload   →   Step 3: Poll Status   →   Step 4: Download
 /authorize + /token       /upload               /stareMesaj               /descarcare
```

> **Using the mock server?** All endpoints below are available at `http://localhost:3003`.  
> Use the `X-Simulate-*` headers listed in the [Cheat Headers](#cheat-headers) section to trigger edge-case scenarios without needing real certificates or specially crafted XML.
> 
> **CRITICAL:** `X-Simulate-*` headers are **NOT** part of the official ANAF API. They are a feature of this mock server for local development and CI testing. **NEVER** include these headers in production code or use them in comments describing production behavior.

---

## Step 1: Authorization (OAuth 2.0 Authorization Code Flow)

ANAF uses the **Authorization Code** grant type. The mock server fully implements this flow.

### 1a. Redirect the user to the authorization endpoint

```
GET /anaf-oauth2/v1/authorize
  ?client_id=<your_client_id>
  &redirect_uri=<your_callback_url>
  &response_type=code
  &token_content_type=jwt
```

In the mock, the user selects an e-sign identity (e.g., `id_ion_popescu`) and approves access. The authorization server redirects back to your `redirect_uri` with a short-lived `code` query parameter.

### 1b. Exchange the code for an access token

```
POST /anaf-oauth2/v1/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=<code_from_step_1a>
&redirect_uri=<same_redirect_uri>
&client_id=<your_client_id>
&client_secret=<your_client_secret>
```

**Response:**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "..."
}
```

Use the `access_token` as `Authorization: Bearer <token>` on all subsequent requests.

### Token Refresh

When the `access_token` expires, exchange the `refresh_token` using:
```
POST /anaf-oauth2/v1/token
grant_type=refresh_token&refresh_token=<refresh_token>&client_id=...&client_secret=...
```

---

## Step 2: Upload the Invoice

### B2B Upload (business-to-business)

```
POST /prod/FCTEL/rest/upload?standard=UBL&cif=<seller_CUI>
Authorization: Bearer <access_token>
Content-Type: application/xml  (or text/plain)

<body: raw invoice XML, max 10 MB>
```

### B2C Upload (business-to-consumer)

```
POST /prod/FCTEL/rest/uploadb2c?standard=UBL&cif=<seller_CUI>
Authorization: Bearer <access_token>

<body: raw invoice XML>
```

### Query Parameters

| Parameter    | Required | Values                       | Notes                                                          |
| :----------- | :------: | :--------------------------- | :------------------------------------------------------------- |
| `standard`   | Yes      | `UBL`, `CII`, `CN`, `RASP`  | `CN` = Credit Note, `RASP` = buyer reply                      |
| `cif`        | Yes      | Numeric CUI (no RO prefix)   | Error recipient CUI if the seller cannot be identified in XML  |
| `extern`     | No       | `DA`                         | Set if the buyer is outside Romania (no CUI/NIF)               |
| `autofactura`| No       | `DA`                         | Set if the invoice is issued by the buyer on behalf of seller   |
| `executare`  | No       | `DA`                         | Set if deposited by a judicial enforcement organ               |

### Size Limit

- Maximum file size: **10 MB**
- The server returns HTTP 413 if this limit is exceeded
- Simulate with `X-Simulate-Upload-Error: true` to force an upload rejection

### Successful Upload Response

```json
{
  "dateResponse": "202501011200",
  "ExecutionStatus": 0,
  "index_incarcare": "5001120362"
}
```

> **Save `index_incarcare`** — you will need it in Step 3 to poll for the processing result.

### Upload Error Response

```json
{
  "dateResponse": "202501011200",
  "ExecutionStatus": 1,
  "Errors": [
    { "errorMessage": "..." }
  ]
}
```

---

## Step 3: Poll for Processing Status

The ANAF system processes invoices asynchronously. Poll until you receive a terminal status.

```
GET /prod/FCTEL/rest/stareMesaj?id_incarcare=<index_incarcare_from_step_2>
Authorization: Bearer <access_token>
```

### Response States

| `stare` value                    | Meaning                                                            | Action                        |
| :-------------------------------- | :----------------------------------------------------------------- | :---------------------------- |
| `in prelucrare`                   | Still being processed                                              | Wait and poll again           |
| `ok`                              | Validated and delivered to buyer. `id_descarcare` is set           | Proceed to Step 4             |
| `nok`                             | Rejected. `id_descarcare` is set (contains error details)         | Proceed to Step 4 to see why  |
| `XML cu erori nepreluat de sistem`| Immediate rejection (malformed XML structure)                     | Fix XML, upload again         |

### Successful Terminal Response (XML)

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<header xmlns="mfp:anaf:dgti:efactura:stareMesajFactura:v1"
        stare="ok"
        id_descarcare="3001474425"/>
```

> **Save `id_descarcare`** — you will use this value in Step 4 to download the result ZIP.

### Rate Limit

ANAF allows at most **100 status queries per day per specific `id_incarcare`**. Poll at reasonable intervals (e.g., every 5–30 seconds during active integration, not tighter).

---

## Step 4: Download the Result ZIP

```
GET /prod/FCTEL/rest/descarcare?id=<id_descarcare_from_step_3>
Authorization: Bearer <access_token>
```

**Response:** A binary ZIP file (e.g., `3001474425.zip`).

### ZIP Contents

The ZIP always contains two XML files:

| File                   | Content                                                    |
| :--------------------- | :--------------------------------------------------------- |
| `<id>.xml`             | The processed invoice or validation error report           |
| `<id>_semnatura.xml`   | The digital signature of the Ministry of Finance (MFP)    |

For **successful** invoices (`stare=ok`): the `.xml` is the original UBL invoice as received by the buyer.  
For **rejected** invoices (`stare=nok`): the `.xml` is an ANAF error report listing the EN 16931 / ANAF validation failures.

### Rate Limit

ANAF allows at most **10 downloads per day per specific `id`**.

---

## Cheat Headers

**CRITICAL:** `X-Simulate-*` headers are **NOT** part of the official ANAF API. They are a feature of this mock server for local development and CI testing. **NEVER** include these headers in production code or use them in comments describing production behavior.

| Header                          | Effect (MOCK ONLY - NOT FOR PRODUCTION)                                   | Applies To                                                                          |
| :------------------------------ | :------------------------------------------------------------------------ | :---------------------------------------------------------------------------------- |
| `x-simulate-upload-error`       | Forces a generic upload validation error (`ExecutionStatus=1`)            | `POST /upload`, `POST /uploadb2c`                                                   |
| `x-simulate-technical-error`    | Forces a technical server error response (HTTP 500)                       | `POST /upload`, `POST /uploadb2c`                                                   |
| `x-simulate-xml-validation-error` | Simulates an XML schema parse failure (`SAXParseException`)             | `POST /upload`, `POST /uploadb2c`                                                   |
| `x-simulate-executare-registry` | CIF not registered in the judicial enforcement registry                   | `POST /upload`, `POST /uploadb2c`                                                   |
| `x-simulate-no-spv`             | Missing SPV authorization — returns empty message list                    | `GET /listaMesajeFactura`, `GET /listaMesajePaginatieFactura`, `GET /stareMesaj`    |
| `x-simulate-wrong-certificate`  | Certificate mismatch error                                                | `GET /listaMesajeFactura`, `GET /listaMesajePaginatieFactura`                       |
| `x-simulate-no-download-rights` | Missing download rights for the invoice ZIP                               | `GET /descarcare`                                                                   |
| `x-simulate-invalid-xml`        | Returns an unparseable XML response for status polling                    | `GET /stareMesaj`                                                                   |
| `x-simulate-nok`                | Forces a `nok` processing result regardless of actual state               | `GET /stareMesaj`                                                                   |
| `x-simulate-no-query-rights`    | Missing query rights for the requested `id_incarcare`                     | `GET /stareMesaj`                                                                   |
| `x-simulate-cui-notfound`       | Forces all VAT lookups to return "not found" for any CUI                  | `POST /api/PlatitorTvaRest/v9/tva`                                                 |

---

## Pre-seeded Test Companies

The mock server boots with the following companies pre-registered. You can use any of these CUIs directly:

| CUI            | Company Name                         | City        | VAT Payer |
| :------------- | :----------------------------------- | :---------- | :-------: |
| `RO10000008`   | Aperta Sync Consulting SRL           | Bucuresti   | Yes       |
| `RO10079193`   | Delta Logistics Solutions SRL        | Cluj-Napoca | Yes       |
| `RO10158386`   | Transilvania Energy Partners SRL     | Brasov      | Yes       |
| `RO10237579`   | Nordic Parts Distribution SRL        | Oradea      | Yes       |
| `RO10316761`   | Vest Service Hub SRL                 | Sibiu       | Yes       |

> **Non-strict mode (default):** Any valid Romanian CUI checksum will be accepted and a synthetic company profile is auto-generated on first lookup. Use the `list_mock_companies` MCP tool to see all known companies.

---

## Pre-seeded OAuth Applications

Configure your OAuth client using the environment variables:

```bash
ANAF_CLIENT_ID=your_client_id
ANAF_CLIENT_SECRET=your_client_secret
ANAF_CALLBACK_URL=http://localhost:3000/callback
```

Use the `list_mock_applications` MCP tool to see all registered OAuth clients.

---

## Pre-seeded E-Sign Identities

The mock server has 5 pre-seeded identities that can authorize on behalf of companies:

| Identity ID          | Full Name         | Default CUIs             |
| :------------------- | :---------------- | :----------------------- |
| `id_ion_popescu`     | Ion Popescu       | RO10000008 (shared)      |
| `id_elena_ionescu`   | Elena Ionescu     | RO10000008 (shared)      |
| `id_mihai_stanescu`  | Mihai Stanescu    | Auto-assigned            |
| `id_andreea_marin`   | Andreea Marin     | Auto-assigned            |
| `id_radu_dumitrescu` | Radu Dumitrescu   | Auto-assigned            |

Use the `list_mock_identities` MCP tool to see current CUI ownership assignments.
