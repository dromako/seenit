import { useNavigate, useLocation } from 'react-router-dom';

const tabs = [
  { path: '/', label: 'Search', icon: '🔍' },
  { path: '/history', label: 'Library', icon: '📚' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function NavBar() {
  const navigate = useNavigate();
  const location = useLocation();

  // Hide navbar on auth pages
  if (location.pathname.startsWith('/auth')) return null;

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: 'var(--bg-secondary)',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      display: 'flex',
      justifyContent: 'center',
      gap: 0,
      zIndex: 100,
      paddingBottom: 'env(safe-area-inset-bottom, 8px)',
    }}>
      <div style={{
        display: 'flex',
        maxWidth: 480,
        width: '100%',
      }}>
        {tabs.map(tab => {
          const isActive = location.pathname === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '10px 0 6px',
                background: 'none',
                border: 'none',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: 10,
                fontWeight: isActive ? 600 : 400,
                cursor: 'pointer',
                transition: 'color 0.15s',
              }}
            >
              <span style={{ fontSize: 20 }}>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
