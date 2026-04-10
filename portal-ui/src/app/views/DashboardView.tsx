import { CompanyProfile, MockApplication, StoredMessage } from '../types';
import { EmptyTableRow } from '../components/shared';

interface DashboardViewProps {
  className: string;
  apps: MockApplication[];
  requestCount: number;
  companies: CompanyProfile[];
  globalMessages: StoredMessage[];
}

/**
 * Executes DashboardView.
 * @param classNameappsrequestCountcompaniesglobalMessages Value for classNameappsrequestCountcompaniesglobalMessages.
 * @returns The DashboardView result.
 */
export function DashboardView({
  className,
  apps,
  requestCount,
  companies,
  globalMessages,
}: DashboardViewProps) {
  return (
    <div className={className}>
      <h1 className="h2 mb-4">System Overview</h1>
      <div className="row g-4 mb-5">
        <div className="col-md-3">
          <div className="card p-4">
            <div className="small fw-bold text-muted text-uppercase mb-1">
              Apps
            </div>
            <div className="h2 mb-0">{apps.length}</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card p-4">
            <div className="small fw-bold text-muted text-uppercase mb-1">
              Requests
            </div>
            <div className="h2 mb-0">{requestCount}</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card p-4">
            <div className="small fw-bold text-muted text-uppercase mb-1">
              Invoices
            </div>
            <div className="h2 mb-0">{globalMessages.length}</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card p-4">
            <div className="small fw-bold text-muted text-uppercase mb-1">
              Known CUIs
            </div>
            <div className="h2 mb-0">{companies.length}</div>
          </div>
        </div>
      </div>

      <div className="card" id="card-dash-apps">
        <h3 className="h5 mb-4">Recent Applications</h3>
        <div className="table-responsive">
          <table className="table mb-0">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {apps.length > 0 ? (
                apps.slice(0, 5).map((app) => (
                  <tr key={app.clientId}>
                    <td>
                      <code>{app.clientId}</code>
                    </td>
                    <td className="fw-bold">{app.applicationName}</td>
                    <td>
                      <span className="status-pill status-info">
                        {app.source}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <EmptyTableRow colSpan={3} message="No records found." />
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
