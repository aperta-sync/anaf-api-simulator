export interface CheatHeader {
  name: string;
  description: string;
  endpoints: string[];
}

export const CHEAT_HEADERS: CheatHeader[] = [
  {
    name: 'x-simulate-upload-error',
    description: 'Set to "true" to force a generic upload validation error (ExecutionStatus=1)',
    endpoints: ['POST /prod/FCTEL/rest/upload', 'POST /prod/FCTEL/rest/uploadb2c'],
  },
  {
    name: 'x-simulate-technical-error',
    description: 'Set to "true" to force a technical server error response',
    endpoints: ['POST /prod/FCTEL/rest/upload', 'POST /prod/FCTEL/rest/uploadb2c'],
  },
  {
    name: 'x-simulate-xml-validation-error',
    description: 'Set to "true" to simulate an XML schema validation failure (SAXParseException)',
    endpoints: ['POST /prod/FCTEL/rest/upload', 'POST /prod/FCTEL/rest/uploadb2c'],
  },
  {
    name: 'x-simulate-executare-registry',
    description: 'Set to "true" to simulate CIF not registered in the judicial enforcement registry',
    endpoints: ['POST /prod/FCTEL/rest/upload', 'POST /prod/FCTEL/rest/uploadb2c'],
  },
  {
    name: 'x-simulate-no-spv',
    description: 'Set to "true" to simulate missing SPV authorization (no messages returned)',
    endpoints: [
      'GET /prod/FCTEL/rest/listaMesajeFactura',
      'GET /prod/FCTEL/rest/listaMesajePaginatieFactura',
      'GET /prod/FCTEL/rest/stareMesaj',
    ],
  },
  {
    name: 'x-simulate-wrong-certificate',
    description: 'Set to "true" to simulate a certificate mismatch error',
    endpoints: [
      'GET /prod/FCTEL/rest/listaMesajeFactura',
      'GET /prod/FCTEL/rest/listaMesajePaginatieFactura',
    ],
  },
  {
    name: 'x-simulate-no-download-rights',
    description: 'Set to "true" to simulate missing download rights for the invoice ZIP',
    endpoints: ['GET /prod/FCTEL/rest/descarcare'],
  },
  {
    name: 'x-simulate-invalid-xml',
    description: 'Set to "true" to simulate an invalid XML response for message status',
    endpoints: ['GET /prod/FCTEL/rest/stareMesaj'],
  },
  {
    name: 'x-simulate-nok',
    description: 'Set to "true" to force a NOK processing status for the message',
    endpoints: ['GET /prod/FCTEL/rest/stareMesaj'],
  },
  {
    name: 'x-simulate-no-query-rights',
    description: 'Set to "true" to simulate missing query rights for message status',
    endpoints: ['GET /prod/FCTEL/rest/stareMesaj'],
  },
  {
    name: 'x-simulate-cui-notfound',
    description: 'Set to "true" to force all VAT lookups to return "not found"',
    endpoints: ['POST /api/PlatitorTvaRest/v9/tva'],
  },
];
