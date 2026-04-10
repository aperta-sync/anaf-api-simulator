import { AlertItem } from '../types';

interface AlertStackProps {
  alerts: AlertItem[];
  onDismiss: (id: number) => void;
}

/**
 * Executes AlertStack.
 * @param alertsonDismiss Value for alertsonDismiss.
 * @returns The AlertStack result.
 */
export function AlertStack({ alerts, onDismiss }: AlertStackProps) {
  return (
    <div
      id="alert-container"
      className="alert-stack position-fixed bottom-0 end-0 p-4"
      style={{ zIndex: 9999, pointerEvents: 'none' }}
    >
      <div className="d-flex flex-column align-items-end">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`toast-notification alert-${alert.type} animate-fade-in`}
            style={{ pointerEvents: 'auto' }}
          >
            <div className="d-flex align-items-center gap-3">
              <span
                className="material-symbols-outlined"
                style={{
                  color:
                    alert.type === 'success'
                      ? '#10b981'
                      : alert.type === 'info'
                        ? '#0053db'
                        : '#ba1a1a',
                  fontSize: '20px',
                }}
              >
                {alert.type === 'success'
                  ? 'check_circle'
                  : alert.type === 'info'
                    ? 'info'
                    : 'error'}
              </span>
              <div
                className="fw-semibold text-dark"
                style={{ fontSize: '0.875rem', lineHeight: '1.4' }}
              >
                {alert.message}
              </div>
            </div>
            <button
              type="button"
              className="btn-close"
              onClick={() => onDismiss(alert.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
