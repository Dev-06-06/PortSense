import { useEffect, useState } from 'react'

function App() {
  const [apiConnected, setApiConnected] = useState(null)

  useEffect(() => {
    const checkApiConnection = async () => {
      try {
        const response = await fetch('http://localhost:8000/')
        setApiConnected(response.ok)
      } catch {
        setApiConnected(false)
      }
    }

    checkApiConnection()
  }, [])

  return (
    <>
      <style>
        {`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700&display=swap');`}
      </style>

      <div
        style={{
          minHeight: '100vh',
          width: '100%',
          backgroundColor: '#0d1117',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'DM Sans', sans-serif",
          textAlign: 'center',
          gap: '0.5rem'
        }}
      >
        <h1
          style={{
            margin: 0,
            color: '#ffffff',
            fontSize: 'clamp(2.5rem, 9vw, 5rem)',
            fontWeight: 700,
            letterSpacing: '0.02em'
          }}
        >
          PortSense
        </h1>
        {apiConnected !== null && (
          <p
            style={{
              margin: 0,
              color: apiConnected ? '#22c55e' : '#ef4444',
              fontSize: 'clamp(1rem, 2.4vw, 1.35rem)',
              fontWeight: 500
            }}
          >
            {apiConnected ? 'API Connected ✓' : 'API Unreachable ✗'}
          </p>
        )}
      </div>
    </>
  )
}

export default App
