import { useMemo, useState } from 'react';
import {
  CompanyProfile,
  IdentityProfile,
  InvoiceNetworkGraph,
  InvoiceNetworkNode,
  StoredMessage,
} from '../types';
import { EmptyTableRow } from '../components/shared';

interface PositionedNode extends InvoiceNetworkNode {
  x: number;
  y: number;
  radius: number;
}

interface InspectorViewProps {
  className: string;
  companies: CompanyProfile[];
  identities: IdentityProfile[];
  globalMessages: StoredMessage[];
  graphDays: string;
  setGraphDays: (value: string) => void;
  graphData: InvoiceNetworkGraph;
  handleLoadSeedPreset: (preset: 'anaf-core' | 'anaf-large') => Promise<void>;
  handleRefreshGraph: () => Promise<void>;
}

/**
 * Executes InspectorView.
 * @param classNamecompaniesidentitiesglobalMessagesgraphDayssetGraphDaysgraphDatahandleLoadSeedPresethandleRefreshGraph Value for classNamecompaniesidentitiesglobalMessagesgraphDayssetGraphDaysgraphDatahandleLoadSeedPresethandleRefreshGraph.
 * @returns The InspectorView result.
 */
export function InspectorView({
  className,
  companies,
  identities,
  globalMessages,
  graphDays,
  setGraphDays,
  graphData,
  handleLoadSeedPreset,
  handleRefreshGraph,
}: InspectorViewProps) {
  const [activeTab, setActiveTab] = useState<'system' | 'ownership'>('system');

  const ownershipCountByCui = useMemo(() => {
    const counts = new Map<string, number>();

    for (const identity of identities) {
      for (const cui of identity.authorizedCuis) {
        counts.set(cui, (counts.get(cui) ?? 0) + 1);
      }
    }

    return counts;
  }, [identities]);

  const nodeSubset = useMemo(() => {
    const topEdges = graphData.edges.slice(0, 28);
    const edgeNodeIds = new Set<string>();

    for (const edge of topEdges) {
      edgeNodeIds.add(edge.source);
      edgeNodeIds.add(edge.target);
    }

    const fromEdges = graphData.nodes.filter((node) =>
      edgeNodeIds.has(node.id),
    );
    if (fromEdges.length >= 6) {
      return fromEdges;
    }

    return graphData.nodes.slice(0, 12);
  }, [graphData.edges, graphData.nodes]);

  const positionedNodes = useMemo<PositionedNode[]>(() => {
    const centerX = 390;
    const centerY = 220;
    const radius = 165;

    return nodeSubset.map((node, index) => {
      const angle = (index / Math.max(1, nodeSubset.length)) * Math.PI * 2;
      const activity = Math.max(node.totalIn + node.totalOut, 1);
      const nodeRadius = 7 + Math.min(11, Math.sqrt(activity) / 28);

      return {
        ...node,
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
        radius: nodeRadius,
      };
    });
  }, [nodeSubset]);

  const nodeById = useMemo(
    () => new Map(positionedNodes.map((node) => [node.id, node])),
    [positionedNodes],
  );

  const visibleEdges = useMemo(
    () =>
      graphData.edges
        .filter(
          (edge) => nodeById.has(edge.source) && nodeById.has(edge.target),
        )
        .slice(0, 44),
    [graphData.edges, nodeById],
  );

  const maxVisibleAmount = useMemo(
    () =>
      Math.max(
        1,
        ...visibleEdges.map((edge) => Math.max(1, Number(edge.totalAmount))),
      ),
    [visibleEdges],
  );

  return (
    <div className={className}>
      <h1 className="h2 mb-4">System Inspector</h1>

      <div className="card mb-4" id="card-inspector-tabs">
        <div className="d-flex gap-2 flex-wrap">
          <button
            type="button"
            className={`btn btn-sm ${
              activeTab === 'system' ? 'btn-primary' : 'btn-outline-dark'
            }`}
            onClick={() => setActiveTab('system')}
          >
            System Data
          </button>
          <button
            type="button"
            className={`btn btn-sm ${
              activeTab === 'ownership' ? 'btn-primary' : 'btn-outline-dark'
            }`}
            onClick={() => setActiveTab('ownership')}
          >
            Ownership Matrix
          </button>
        </div>
      </div>

      {activeTab === 'ownership' && (
        <div className="card" id="card-inspect-ownership">
          <h3 className="h5 mb-1">Identity Ownership Matrix</h3>
          <p className="small text-muted mb-4">
            Each signer identity is mapped to domestic CIF ownership.
            Multi-owner companies are highlighted.
          </p>
          <div className="table-responsive">
            <table className="table mb-0">
              <thead>
                <tr>
                  <th>Identity Name</th>
                  <th>Email</th>
                  <th>Authorized Companies (CUIs)</th>
                </tr>
              </thead>
              <tbody>
                {identities.length > 0 ? (
                  identities.map((identity) => (
                    <tr key={identity.id}>
                      <td className="fw-bold">{identity.fullName}</td>
                      <td>{identity.email}</td>
                      <td>
                        <div className="ownership-cui-list">
                          {identity.authorizedCuis.length > 0 ? (
                            identity.authorizedCuis.map((cui) => {
                              const ownerCount =
                                ownershipCountByCui.get(cui) ?? 0;
                              const isMultiOwner = ownerCount > 1;

                              return (
                                <span
                                  key={`${identity.id}-${cui}`}
                                  className={`status-pill ${
                                    isMultiOwner
                                      ? 'ownership-multi-owner'
                                      : 'ownership-single-owner'
                                  }`}
                                >
                                  {cui}{' '}
                                  {isMultiOwner
                                    ? `(${ownerCount} owners)`
                                    : '(single owner)'}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-muted">No assignments.</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyTableRow
                    colSpan={3}
                    message="No identities available."
                  />
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'system' && (
        <>
          <div className="card mb-4" id="card-inspect-controls">
            <h3 className="h5 mb-3">Dataset Controls</h3>
            <div className="d-flex flex-wrap gap-2 align-items-end">
              <button
                className="btn btn-outline-dark btn-sm"
                type="button"
                onClick={() => void handleLoadSeedPreset('anaf-core')}
              >
                Load Core Seed
              </button>
              <button
                className="btn btn-outline-dark btn-sm"
                type="button"
                onClick={() => void handleLoadSeedPreset('anaf-large')}
              >
                Load Large Seed
              </button>
              <div className="d-flex align-items-center gap-2">
                <label
                  className="small fw-bold text-muted mb-0"
                  htmlFor="graph-days"
                >
                  Graph Window (days)
                </label>
                <input
                  id="graph-days"
                  className="form-control form-control-sm graph-days-input"
                  type="number"
                  min={1}
                  max={90}
                  value={graphDays}
                  onChange={(event) => setGraphDays(event.target.value)}
                />
                <button
                  className="btn btn-primary btn-sm"
                  type="button"
                  onClick={() => void handleRefreshGraph()}
                >
                  Refresh Graph
                </button>
              </div>
            </div>
          </div>

          <div className="card mb-4" id="card-inspect-graph">
            <h3 className="h5 mb-1">Invoice Traffic Network</h3>
            <p className="small text-muted mb-3">
              Directed flows in the last {graphData.windowDays || 30} days.
            </p>

            {positionedNodes.length > 0 ? (
              <div className="invoice-graph-shell">
                <svg viewBox="0 0 780 440" className="invoice-graph" role="img">
                  <rect
                    x="0"
                    y="0"
                    width="780"
                    height="440"
                    rx="16"
                    className="graph-bg"
                  />

                  {visibleEdges.map((edge) => {
                    const source = nodeById.get(edge.source);
                    const target = nodeById.get(edge.target);

                    if (!source || !target) {
                      return null;
                    }

                    const strokeWidth =
                      0.9 +
                      (Math.max(0.9, Number(edge.totalAmount)) /
                        maxVisibleAmount) *
                        4;

                    return (
                      <line
                        key={edge.id}
                        x1={source.x}
                        y1={source.y}
                        x2={target.x}
                        y2={target.y}
                        className="graph-edge"
                        strokeWidth={strokeWidth}
                      />
                    );
                  })}

                  {positionedNodes.map((node) => (
                    <g
                      key={node.id}
                      transform={`translate(${node.x}, ${node.y})`}
                    >
                      <circle r={node.radius} className="graph-node" />
                      <text
                        className="graph-node-label"
                        x={0}
                        y={-node.radius - 8}
                      >
                        {node.label.slice(0, 24)}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            ) : (
              <div className="text-muted py-5 text-center">
                No graph data available yet. Load a seed preset and refresh.
              </div>
            )}

            <div className="small text-muted mt-3">
              Last generated:{' '}
              {graphData.generatedAt
                ? new Date(graphData.generatedAt).toLocaleString()
                : 'n/a'}
            </div>
          </div>

          <div className="card mb-4" id="card-inspect-cos">
            <h3 className="h5 mb-4">All Seeded Companies</h3>
            <div className="table-responsive">
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>CUI</th>
                    <th>City</th>
                    <th>Country</th>
                    <th className="text-end">VAT</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.length > 0 ? (
                    companies.map((company) => (
                      <tr key={`${company.cui}-${company.name}`}>
                        <td className="fw-bold">{company.name}</td>
                        <td>
                          <code>{company.cui}</code>
                        </td>
                        <td>{company.city}</td>
                        <td>{company.countryCode || 'RO'}</td>
                        <td className="text-end">
                          <span
                            className={`status-pill ${
                              company.vatPayer
                                ? 'status-success'
                                : 'status-info'
                            }`}
                          >
                            {company.vatPayer ? 'PAYER' : 'NON-PAYER'}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <EmptyTableRow colSpan={5} message="No records found." />
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" id="card-inspect-msgs">
            <h3 className="h5 mb-4">Global Message Store</h3>
            <div className="table-responsive">
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>From</th>
                    <th>To</th>
                    <th className="text-end">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {globalMessages.length > 0 ? (
                    globalMessages.map((message) => {
                      const dateValue =
                        message.createdAt ||
                        message.data_creare ||
                        new Date().toISOString();

                      return (
                        <tr key={message.id}>
                          <td>{new Date(dateValue).toLocaleDateString()}</td>
                          <td>
                            <span className="status-pill status-info">
                              {(message.tip || 'FACTURA').slice(0, 16)}
                            </span>
                          </td>
                          <td>
                            <code>{message.cif_emitent}</code>
                          </td>
                          <td>
                            <code>{message.cif_beneficiar}</code>
                          </td>
                          <td className="fw-bold text-end">
                            {Number(message.suma).toFixed(2)} {message.currency}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <EmptyTableRow colSpan={5} message="No records found." />
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
