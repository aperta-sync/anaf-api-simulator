import { MessageListEntry } from '../types';
import { EmptyTableRow } from '../components/shared';

interface DataViewProps {
  className: string;
  vatInput: string;
  vatResponseJson: string;
  messageCif: string;
  messageDays: string;
  messageRows: MessageListEntry[];
  setVatInput: (value: string) => void;
  setMessageCif: (value: string) => void;
  setMessageDays: (value: string) => void;
  handleVatLookup: () => Promise<void>;
  handleListMessages: () => Promise<void>;
  handleDownloadZip: (messageId: string) => Promise<void>;
}

/**
 * Executes DataView.
 * @param classNamevatInputvatResponseJsonmessageCifmessageDaysmessageRowssetVatInputsetMessageCifsetMessageDayshandleVatLookuphandleListMessageshandleDownloadZip Value for classNamevatInputvatResponseJsonmessageCifmessageDaysmessageRowssetVatInputsetMessageCifsetMessageDayshandleVatLookuphandleListMessageshandleDownloadZip.
 * @returns The DataView result.
 */
export function DataView({
  className,
  vatInput,
  vatResponseJson,
  messageCif,
  messageDays,
  messageRows,
  setVatInput,
  setMessageCif,
  setMessageDays,
  handleVatLookup,
  handleListMessages,
  handleDownloadZip,
}: DataViewProps) {
  return (
    <div className={className}>
      <h1 className="h2 mb-4">Data Explorer</h1>
      <div className="row g-5">
        <div className="col-lg-6">
          <div className="card" id="card-vat-lookup">
            <h3 className="h5 mb-4">VAT Registry Lookup</h3>
            <div className="mb-4">
              <label className="stat-label d-block mb-2">
                Input CUI/CIF List
              </label>
              <textarea
                className="form-control font-monospace"
                rows={3}
                placeholder="RO10000008, RO10079193"
                value={vatInput}
                onChange={(e) => setVatInput(e.target.value)}
              />
            </div>
            <button
              className="btn btn-primary btn-lg w-100"
              onClick={() => void handleVatLookup()}
            >
              Execute API Request
            </button>
            <pre className="json-view mt-4 mb-0">{vatResponseJson}</pre>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="card" id="card-efactura-inbox">
            <h3 className="h5 mb-4">e-Factura Inbox</h3>
            <div className="row g-3 mb-4">
              <div className="col-8">
                <label className="stat-label d-block mb-2">
                  Target Beneficiary CIF
                </label>
                <input
                  className="form-control font-monospace"
                  placeholder="e.g. RO10000008"
                  value={messageCif}
                  onChange={(e) => setMessageCif(e.target.value)}
                />
              </div>
              <div className="col-4">
                <label className="stat-label d-block mb-2">
                  Lookback (Days)
                </label>
                <input
                  className="form-control"
                  type="number"
                  value={messageDays}
                  onChange={(e) => setMessageDays(e.target.value)}
                />
              </div>
            </div>
            <p className="small text-muted mb-3">
              Requires a valid access token from OAuth Wizard (after simulated
              e-sign approval). When strict ownership validation is enabled, the
              selected signer can query only owned CIFs.
            </p>
            <button
              className="btn btn-primary btn-lg w-100 mb-4"
              onClick={() => void handleListMessages()}
            >
              Poll Inbox
            </button>
            <div
              className="table-container shadow-sm border rounded-3"
              style={{ maxHeight: '350px', overflow: 'auto' }}
            >
              <table className="table mb-0 small">
                <thead className="sticky-top">
                  <tr>
                    <th>ID</th>
                    <th>Supplier</th>
                    <th className="text-end">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {messageRows.length > 0 ? (
                    messageRows.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <code>{m.id.substring(0, 8)}</code>
                        </td>
                        <td>{m.cif_emitent}</td>
                        <td className="fw-bold text-end">{m.suma}</td>
                        <td className="text-end">
                          <button
                            className="btn btn-link p-0 material-symbols-outlined text-primary text-decoration-none"
                            onClick={() => void handleDownloadZip(m.id)}
                          >
                            download
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <EmptyTableRow
                      colSpan={4}
                      message="No messages found for this CIF."
                    />
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
