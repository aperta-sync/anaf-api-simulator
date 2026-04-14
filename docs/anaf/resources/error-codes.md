# ANAF e-Factura Error Code Reference

This document maps Romanian ANAF error messages to their English explanations and suggested fixes.

---

## Upload Errors (`/upload`, `/uploadb2c`)

| Romanian Error Message | English Explanation | Suggested Fix |
| :--- | :--- | :--- |
| `Eroare la validarea xml-ului. SAXParseException: ...` | The XML failed schema validation due to a parse error | Validate the invoice XML against the UBL 2.1 schema before uploading |
| `Nu sunteti autorizat pentru aceasta operatiune` | The authenticated identity is not authorized to upload for this CUI | Ensure the OAuth token belongs to an identity with SPV rights for the `cif` parameter |
| `Fisierul are o dimensiune mai mare de 10 MB` | The uploaded file exceeds the 10 MB size limit | Reduce invoice size; compress or split if necessary |
| `CIF-ul nu este inregistrat in registrul de executare judiciara` | The CIF is not registered in the judicial enforcement registry | Only use `executare=DA` when the submitter is a registered enforcement organ |
| `Tipul de standard nu este recunoscut` | The `standard` query parameter value is not recognized | Use one of: `UBL`, `CII`, `CN`, `RASP` |
| `Parametrul cif este obligatoriu` | The `cif` query parameter is missing | Add the numeric CUI to the query string |
| `Parametrul standard este obligatoriu` | The `standard` query parameter is missing | Add `standard=UBL` (or other valid value) to the query string |

---

## Message Status Errors (`/stareMesaj`)

| Romanian Error Message | English Explanation | Suggested Fix |
| :--- | :--- | :--- |
| `Nu aveti dreptul de interogare pentru id_incarcare= {id}` | The authenticated identity does not have query rights for this upload index | Use the identity/token that performed the original upload |
| `Nu exista niciun CIF pentru care sa aveti drept` | No authorized CIF exists for this token | The OAuth token has no associated SPV-authorized CIFs |
| `Id_incarcare introdus= {x} nu este un numar intreg` | The `id_incarcare` value is not a valid integer | Pass a numeric `id_incarcare` value from the upload response |
| `Nu exista factura cu id_incarcare= {id}` | No invoice was found for this upload index | Verify the `id_incarcare` value from the upload response |
| `Parametrul id_incarcare este obligatoriu` | The `id_incarcare` query parameter is missing | Add `?id_incarcare=<value>` to the request |
| `S-au facut deja {n} descarcari de mesaj in cursul zilei` | The daily query limit for this `id_incarcare` has been reached (max: 100/day) | Wait until the next calendar day (Europe/Bucharest timezone) |

---

## Download Errors (`/descarcare`)

| Romanian Error Message | English Explanation | Suggested Fix |
| :--- | :--- | :--- |
| `Nu aveti dreptul sa descarcati aceasta factura` | The authenticated identity does not have download rights for this message | Use the identity/token belonging to the buyer or seller of the invoice |
| `Id descarcare introdus= {x} nu este un numar intreg` | The `id` value is not a valid integer | Pass the numeric `id_descarcare` value from the `stareMesaj` response |
| `Pentru id={x} nu exista inregistrata nici o factura` | No invoice exists for the given download ID | Verify the `id` value obtained from the message list or status endpoint |
| `S-au facut deja 10 descarcari de mesaj in cursul zilei` | The daily download limit for this message ID has been reached (max: 10/day) | Wait until the next calendar day |
| `Parametrul id este obligatoriu` | The `id` query parameter is missing | Add `?id=<value>` to the request |

---

## Message List Errors (`/listaMesajeFactura`, `/listaMesajePaginatieFactura`)

| Romanian Error Message | English Explanation | Suggested Fix |
| :--- | :--- | :--- |
| `Nu exista mesaje pentru CIF-ul solicitat` | No messages found for the requested CIF in the given time window | Expand the `zile` parameter or check that the CIF has uploaded invoices |
| `Numarul de zile trebuie sa fie cuprins intre 1 si 60` | The `zile` parameter must be between 1 and 60 | Pass a value in the range `1–60` |
| `Certificatul nu corespunde CIF-ului` | The digital certificate does not match the requested CIF | Use the certificate registered in SPV for this CIF |
| `Nu aveti autorizatie pentru CIF-ul solicitat` | The authenticated identity lacks SPV authorization for this CIF | Grant SPV access to the identity for this CIF |
| `Lista depaseste 500 de mesaje. Folositi paginatia` | The result exceeds 500 messages; use the paginated endpoint | Switch to `GET /listaMesajePaginatieFactura` |

---

## EN 16931 / UBL Validation Rule Codes

These codes appear inside the downloaded error ZIP file when `stare=nok`:

| Rule Code | Description |
| :--- | :--- |
| `BR-01` | A commercial invoice shall have a specification identifier |
| `BR-02` | A commercial invoice shall have an invoice number |
| `BR-03` | A commercial invoice shall have an invoice issue date |
| `BR-04` | A commercial invoice shall have an invoice type code |
| `BR-05` | A commercial invoice shall have an invoice currency code |
| `BR-06` | A commercial invoice shall have a VAT identifier for the seller |
| `BR-07` | A commercial invoice shall have a VAT identifier for the buyer |
| `BR-CO-01` | The sum of invoice line net amounts must equal the sum of line extension amounts |
| `BR-CO-10` | The sum of invoice line net amounts plus invoice allowances must equal the tax exclusive amount |
| `BR-CO-15` | The tax inclusive amount must equal the tax exclusive amount plus the total VAT amount |
| `BTAR-01` | The VAT scheme identifier of the supplier must be present and valid |
| `RO-001` | The supplier CUI must be present in the Romanian VAT registry |
| `RO-002` | The buyer CUI must be present in the Romanian VAT registry for domestic B2B invoices |

---

## HTTP Status Codes

| HTTP Code | Meaning in ANAF Context |
| :--- | :--- |
| `200` | Success. For upload: `ExecutionStatus=0`. For download: binary ZIP. For status: XML with `stare` attribute. |
| `400` | Bad Request. A required parameter is missing or has an invalid format. |
| `401` | Unauthorized. The `Authorization: Bearer` token is missing or expired. |
| `403` | Forbidden. The token is valid but the identity lacks rights for the requested CUI. |
| `413` | Payload Too Large. The uploaded file exceeds 10 MB. |
| `429` | Too Many Requests. The global rate limit (1000 calls/minute) or a daily per-endpoint limit has been reached. |
| `500` | Internal Server Error. Retry after a short delay; if persistent, contact ANAF. |
