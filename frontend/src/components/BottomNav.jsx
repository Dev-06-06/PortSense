import { Link, useLocation } from 'react-router-dom'

const tabs = [
  { label: 'Dashboard', icon: '📊', path: '/dashboard' },
  { label: 'Analytics', icon: '🔍', path: '/analytics' },
  { label: 'Advisor', icon: '💬', path: '/advisor' },
  { label: 'Account', icon: '👤', path: '/account' },
]

const BottomNav = () => {
  const { pathname } = useLocation()

  const isActive = (path) => {
    if (path === '/dashboard' || path === '/analytics') {
      return pathname === path || pathname.startsWith(`${path}/`)
    }

    return pathname === path
  }

  return (
    <nav
      aria-label='Bottom navigation'
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '60px',
        background: '#111827',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        zIndex: 1000,
      }}
    >
      {tabs.map((tab) => {
        const active = isActive(tab.path)

        return (
          <Link
            key={tab.path}
            to={tab.path}
            style={{
              color: active ? '#f97316' : '#94a3b8',
              textDecoration: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              fontSize: '12px',
              lineHeight: 1,
              fontWeight: 600,
            }}
          >
            <span style={{ fontSize: '18px' }} aria-hidden='true'>
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

export default BottomNav
