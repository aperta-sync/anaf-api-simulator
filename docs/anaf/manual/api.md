# ANAF RO e-Factura API Documentation

## Overview
The Romanian National System for Electronic Invoicing (RO e-Factura) provides web services for uploading, validating, and downloading electronic invoices. 

Detailed swagger definitions can be found on their portal, but this document summarizes the core REST endpoints based on the `anaf` reference text.

## Authentication Methods
ANAF APIs support two primarily authentication streams for all methods:
1. **Digital Certificate**: Utilizing the valid digital certificate registered in SPV.
2. **OAuth2 Standard**: Employing Oauth access tokens generated using the client app id and the digital certificate of the user.

## Environments
- **Production (Digital Certificate)**: `https://webserviceapl.anaf.ro/prod/FCTEL/rest/`
- **Production (OAuth2)**: `https://api.anaf.ro/prod/FCTEL/rest/`
- **Test (Digital Certificate)**: `https://webserviceapl.anaf.ro/test/FCTEL/rest/`
- **Test (OAuth2)**: `https://api.anaf.ro/test/FCTEL/rest/`

---

## Key Endpoints

### 1. Upload Invoice (B2B & B2C)
Used to upload the invoice XML.

- **B2B Endpoint:** `POST /upload`
- **B2C Endpoint:** `POST /uploadb2c`
- **Constraints:**
  - Maximum file size: **10 MB**.
- **Query Parameters:**
  - `standard` (Required): `UBL`, `CN` (Credit Note), `CII`, or `RASP` (Buyer message).
  - `cif` (Required): The CIF (numeric) to receive the error message if the seller can't be identified from the invoice. You must have SPV rights for this CIF.
  - `extern` (Optional): `DA` -> Used only if the buyer is outside Romania (no CUI/NIF).
  - `autofactura` (Optional): `DA` -> Used if the invoice is issued by the beneficiary on behalf of the supplier.
  - `executare` (Optional): `DA` -> Used if the invoice is deposited by an execution organ on behalf of a debtor.

### 2. Message Status (Stare Mesaj)
Used to query the processing state of a previously transmitted invoice.

- **Endpoint:** `GET /stareMesaj`
- **Query Parameters:**
  - `id_incarcare` (Required): The upload index received from the `/upload` response.
- **Response States (stare attribute):**
  - `ok`: Validated and processed successfully. The invoice was delivered to the buyer. You can download the response zip.
  - `nok`: Errors identified. Invoice rejected. You can download the response zip containing the error details.
  - `XML cu erori nepreluat de sistem`: Rejected immediately.
  - `in prelucrare`: Still processing.

### 3. Message List (Lista Mesaje)
Retrieve a list of available responses (processed messages/invoices) for download.

- **Standard Endpoint:** `GET /listaMesajeFactura`
  - `zile` (Required): Number of days to search back (**1 to 60**).
  - `cif` (Required): The requested CIF.
  - `filtru` (Optional): `E` (Errors), `T` (Sent Invoices), `P` (Received Invoices), `R` (Messages).
  - **Note:** If the list exceeds 500 items, you MUST use the paginated endpoint.
- **Paginated Endpoint:** `GET /listaMesajePaginatieFactura`
  - `startTime` (Required): Unix timestamp milliseconds.
  - `endTime` (Required): Unix timestamp milliseconds.
  - `cif` (Required): The requested CIF.
  - `pagina` (Required): Page number.
  - `filtru` (Optional): Same as above.


### 4. Download (Descarcare)
Download the actual response/invoice zip file.

- **Endpoint:** `GET /descarcare`
- **Query Parameters:**
  - `id` (Required): The message `id` acquired from the `/listaMesajeFactura` response.
- **Returns:** A ZIP file containing two XML files - the original invoice/errors and the electronic signature of the Ministry of Finance.

### 5. Utility Services (No Auth required for prod check)
- **Validation:** `POST https://webservicesp.anaf.ro/prod/FCTEL/rest/validare/{standard}` (Headers: `Content-Type: text/plain`).
- **XML to PDF:** `POST https://webservicesp.anaf.ro/prod/FCTEL/rest/transformare/{standard}/{novld}` (`novld` can be `DA` to skip validation).
- **Signature Validation:** `POST https://webservicesp.anaf.ro/api/validate/signature` (MultipartFile params: `file` and `signature`).
