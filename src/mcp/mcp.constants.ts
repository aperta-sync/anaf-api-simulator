export interface CheatHeader {
  name: string;
  description: string;
  endpoints: string[];
}

export const CHEAT_HEADERS: CheatHeader[] = [
  {
    name: 'x-simulate-upload-error',
    description: 'MOCK ONLY: Force a generic upload validation error (ExecutionStatus=1). Do not use in production.',
    endpoints: ['POST /prod/FCTEL/rest/upload', 'POST /prod/FCTEL/rest/uploadb2c'],
  },
  {
    name: 'x-simulate-technical-error',
    description: 'MOCK ONLY: Force a technical server error response (HTTP 200 with XML ExecutionStatus=1). Do not use in production.',
    endpoints: ['POST /prod/FCTEL/rest/upload', 'POST /prod/FCTEL/rest/uploadb2c'],
  },
  {
    name: 'x-simulate-xml-validation-error',
    description: 'MOCK ONLY: Simulate an XML schema validation failure (SAXParseException). Do not use in production.',
    endpoints: ['POST /prod/FCTEL/rest/upload', 'POST /prod/FCTEL/rest/uploadb2c'],
  },
  {
    name: 'x-simulate-executare-registry',
    description: 'MOCK ONLY: Simulate CIF not registered in the judicial enforcement registry. Do not use in production.',
    endpoints: ['POST /prod/FCTEL/rest/upload', 'POST /prod/FCTEL/rest/uploadb2c'],
  },
  {
    name: 'x-simulate-no-spv',
    description: 'MOCK ONLY: Simulate missing SPV authorization (no messages returned). Do not use in production.',
    endpoints: [
      'GET /prod/FCTEL/rest/listaMesajeFactura',
      'GET /prod/FCTEL/rest/listaMesajePaginatieFactura',
      'GET /prod/FCTEL/rest/stareMesaj',
    ],
  },
  {
    name: 'x-simulate-wrong-certificate',
    description: 'MOCK ONLY: Simulate a certificate mismatch error. Do not use in production.',
    endpoints: [
      'GET /prod/FCTEL/rest/listaMesajeFactura',
      'GET /prod/FCTEL/rest/listaMesajePaginatieFactura',
    ],
  },
  {
    name: 'x-simulate-no-download-rights',
    description: 'MOCK ONLY: Simulate missing download rights for the invoice ZIP. Do not use in production.',
    endpoints: ['GET /prod/FCTEL/rest/descarcare'],
  },
  {
    name: 'x-simulate-invalid-xml',
    description: 'MOCK ONLY: Simulate an invalid XML response for message status. Do not use in production.',
    endpoints: ['GET /prod/FCTEL/rest/stareMesaj'],
  },
  {
    name: 'x-simulate-nok',
    description: 'MOCK ONLY: Force a NOK processing status for the message. Do not use in production.',
    endpoints: ['GET /prod/FCTEL/rest/stareMesaj'],
  },
  {
    name: 'x-simulate-no-query-rights',
    description: 'MOCK ONLY: Simulate missing query rights for message status. Do not use in production.',
    endpoints: ['GET /prod/FCTEL/rest/stareMesaj'],
  },
  {
    name: 'x-simulate-cui-notfound',
    description: 'MOCK ONLY: Force all VAT lookups to return "not found". Do not use in production.',
    endpoints: ['POST /api/PlatitorTvaRest/v9/tva'],
  },
];
