import { useNavigate } from 'react-router-dom';
import { PortalView } from '../types';

interface SidebarProps {
  view: PortalView;
}

/**
 * Executes Sidebar.
 * @param view Value for view.
 * @returns The Sidebar result.
 */
export function Sidebar({ view }: SidebarProps) {
  const navigate = useNavigate();
  const version = import.meta.env.VITE_APP_VERSION || 'dev';

  const handleNav = (target: PortalView) => {
    navigate(target === 'dashboard' ? '/' : `/${target}`);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-icon">
          <span className="material-symbols-outlined">account_balance</span>
        </div>
        <div>
          <div className="display-font h5 mb-0">ANAF Mock</div>
          <div
            className="small text-muted font-monospace"
            style={{ fontSize: '9px', letterSpacing: '1px' }}
          >
            MOCK CONSOLE v{version}
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <button
          className={`nav-link ${view === 'dashboard' ? 'active' : ''}`}
          onClick={() => handleNav('dashboard')}
        >
          <span className="material-symbols-outlined">grid_view</span>
          Dashboard
        </button>
        <button
          className={`nav-link ${view === 'apps' ? 'active' : ''}`}
          onClick={() => handleNav('apps')}
        >
          <span className="material-symbols-outlined">shield_lock</span>
          Apps & Credentials
        </button>
        <button
          className={`nav-link ${view === 'oauth' ? 'active' : ''}`}
          onClick={() => handleNav('oauth')}
        >
          <span className="material-symbols-outlined">key_visualizer</span>
          OAuth Wizard
        </button>
        <button
          className={`nav-link ${view === 'data' ? 'active' : ''}`}
          onClick={() => handleNav('data')}
        >
          <span className="material-symbols-outlined">manage_search</span>
          Data Explorer
        </button>
        <button
          className={`nav-link ${view === 'inspector' ? 'active' : ''}`}
          onClick={() => handleNav('inspector')}
        >
          <span className="material-symbols-outlined">database</span>
          System Inspector
        </button>
        <button
          className={`nav-link ${view === 'settings' ? 'active' : ''}`}
          onClick={() => handleNav('settings')}
        >
          <span className="material-symbols-outlined">
            settings_input_component
          </span>
          Simulation Config
        </button>
      </nav>
    </aside>
  );
}
