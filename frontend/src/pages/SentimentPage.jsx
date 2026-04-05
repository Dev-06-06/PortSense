import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'

const shellStyle = {
  minHeight: '100vh',
  backgroundColor: '#0d1117',
  color: '#e5e7eb',
  fontFamily: "'DM Sans', sans-serif",
  padding: '1.5rem 1rem 2rem',
}

const containerStyle = {
  width: '100%',
  maxWidth: '72rem',
  margin: '0 auto',
  display: 'grid',
  gap: '1rem',
}

const cardBaseStyle = {
  borderRadius: '1rem',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  backgroundColor: 'rgba(15, 23, 42, 0.6)',
  padding: '1rem',
}

const spinnerStyle = {
  width: '2.25rem',
  height: '2.25rem',
  borderRadius: '999px',
  border: '3px solid rgba(148, 163, 184, 0.35)',
  borderTopColor: '#f97316',
}

const portfolioSignalStyle = (signal) => {
  if (signal === 'Overall Bullish') {
    return {
      backgroundColor: 'rgba(34, 197, 94, 0.1)',
      border: '1px solid rgba(34, 197, 94, 0.4)',
    }
  }

  if (signal === 'Overall Bearish') {
    return {
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      border: '1px solid rgba(239, 68, 68, 0.4)',
    }
  }

  return {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
  }
}

const badgeStyle = (badge) => {
  if (badge === 'Bullish') {
    return {
      color: '#4ade80',
      backgroundColor: 'rgba(34, 197, 94, 0.12)',
      borderColor: 'rgba(34, 197, 94, 0.4)',
    }
  }

  if (badge === 'Bearish') {
    return {
      color: '#f87171',
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
      borderColor: 'rgba(239, 68, 68, 0.4)',
    }
  }

  return {
    color: '#cbd5e1',
    backgroundColor: 'rgba(100, 116, 139, 0.2)',
    borderColor: 'rgba(148, 163, 184, 0.35)',
  }
}

const dotStyle = (label) => {
  const normalized = String(label || '').toLowerCase()

  if (normalized === 'positive') {
    return { backgroundColor: '#22c55e' }
  }

  if (normalized === 'negative') {
    return { backgroundColor: '#ef4444' }
  }

  return { backgroundColor: '#94a3b8' }
}

const normalizePayload = (payload) => {
  const portfolioSignal = payload?.portfolioSignal || 'Mixed'
  const stocksRaw = Array.isArray(payload?.stocks) ? payload.stocks : []
  const stocks = stocksRaw.map((item) => ({
    ticker: String(item?.ticker || '-'),
    badge: String(item?.badge || 'Neutral'),
    confidence: Number.isFinite(Number(item?.confidence)) ? Number(item.confidence) : 0,
    headlines: Array.isArray(item?.headlines) ? item.headlines.slice(0, 3) : [],
  }))

  return { portfolioSignal, stocks }
}

const SentimentPage = () => {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [portfolioSignal, setPortfolioSignal] = useState('Mixed')
  const [stocks, setStocks] = useState([])
  const [showSlowWarning, setShowSlowWarning] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    document.title = 'Sentiment | PortSense'
  }, [])

  const fetchSentiment = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await api.get('/api/sentiment')
      const normalized = normalizePayload(response?.data || {})
      setPortfolioSignal(normalized.portfolioSignal)
      setStocks(normalized.stocks)
      setLastUpdated(new Date())
    } catch (requestError) {
      setError('Unable to fetch sentiment right now. Please try again.')
      setPortfolioSignal('Mixed')
      setStocks([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSentiment()
  }, [fetchSentiment])

  useEffect(() => {
    if (!loading) {
      setShowSlowWarning(false)
      return
    }

    setShowSlowWarning(false)
    const timeoutId = window.setTimeout(() => {
      setShowSlowWarning(true)
    }, 5000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [loading])

  return (
    <div style={shellStyle}>
      <style>{`
        .sentiment-spin {
          animation: sentiment-spin 0.9s linear infinite;
        }

        @keyframes sentiment-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .sentiment-dot {
          width: 0.45rem;
          height: 0.45rem;
          border-radius: 999px;
          background: #f97316;
          opacity: 0.25;
          animation: sentiment-dot-fade 1.2s ease-in-out infinite;
        }

        .sentiment-dot-1 { animation-delay: 0s; }
        .sentiment-dot-2 { animation-delay: 0.2s; }
        .sentiment-dot-3 { animation-delay: 0.4s; }

        @keyframes sentiment-dot-fade {
          0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-2px); }
        }

        .sentiment-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
        }

        @media (min-width: 900px) {
          .sentiment-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>

      <div style={containerStyle}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'grid', gap: '0.3rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#f8fafc', fontWeight: 700 }}>Sentiment</h1>
            {!loading && lastUpdated && (
              <p
                style={{
                  margin: 0,
                  fontSize: '0.75rem',
                  color: '#64748b',
                }}
              >
                Last analysed: {lastUpdated.toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                })}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <button
              type='button'
              onClick={fetchSentiment}
              disabled={loading}
              style={{
                border: '1px solid rgba(249, 115, 22, 0.45)',
                backgroundColor: 'rgba(249, 115, 22, 0.18)',
                color: '#fdba74',
                borderRadius: '0.75rem',
                padding: '0.5rem 0.9rem',
                fontWeight: 700,
                fontFamily: "'DM Sans', sans-serif",
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              Refresh
            </button>
            <button
              type='button'
              onClick={() => {
                logout()
                navigate('/', { replace: true })
              }}
              style={{
                backgroundColor: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: '#f87171',
                borderRadius: '0.75rem',
                padding: '0.5rem 0.9rem',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Sign Out
            </button>
          </div>
        </div>

        {loading ? (
          <section style={{ ...cardBaseStyle, minHeight: '18rem', display: 'grid', placeItems: 'center' }}>
            <div style={{ display: 'grid', justifyItems: 'center', gap: '0.85rem' }}>
              <div className='sentiment-spin' style={spinnerStyle} aria-label='Loading sentiment' />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.95rem' }}>Analysing headlines with FinBERT AI...</p>
                <span className='sentiment-dot sentiment-dot-1' aria-hidden='true' />
                <span className='sentiment-dot sentiment-dot-2' aria-hidden='true' />
                <span className='sentiment-dot sentiment-dot-3' aria-hidden='true' />
              </div>
              {showSlowWarning && (
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.88rem' }}>
                  This may take up to 20 seconds on first load
                </p>
              )}
            </div>
          </section>
        ) : error ? (
          <section style={cardBaseStyle}>
            <p style={{ margin: 0, color: '#fca5a5' }}>{error}</p>
          </section>
        ) : (
          <>
            <section
              style={{
                borderRadius: '1rem',
                padding: '1.1rem 1rem',
                textAlign: 'center',
                ...portfolioSignalStyle(portfolioSignal),
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: '#ffffff',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  lineHeight: 1.3,
                }}
              >
                {portfolioSignal}
              </p>
            </section>

            <section className='sentiment-grid'>
              {stocks.map((stock) => {
                const cleanTicker = stock.ticker.replace(/\.NS$/i, '')
                const headlines = stock.headlines.slice(0, 3)

                return (
                  <article key={stock.ticker} style={cardBaseStyle}>
                    <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <h2
                        style={{
                          margin: 0,
                          color: '#f8fafc',
                          fontFamily: "'Barlow Condensed', 'DM Sans', sans-serif",
                          fontSize: '2rem',
                          letterSpacing: '0.02em',
                          lineHeight: 1,
                        }}
                      >
                        {cleanTicker}
                      </h2>
                      <span
                        style={{
                          ...badgeStyle(stock.badge),
                          borderWidth: '1px',
                          borderStyle: 'solid',
                          borderRadius: '999px',
                          padding: '0.18rem 0.58rem',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {stock.badge}
                      </span>
                    </div>

                    <p style={{ margin: '0.6rem 0 0.8rem', color: '#94a3b8', fontSize: '0.8rem' }}>
                      Confidence: {stock.confidence.toFixed(2)}
                    </p>

                    {headlines.length === 0 ? (
                      <p style={{ margin: 0, color: '#64748b', fontSize: '0.82rem' }}>No headlines available.</p>
                    ) : (
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.45rem' }}>
                        {headlines.map((item, index) => {
                          const headline = typeof item === 'string' ? item : String(item?.headline || '')
                          const label = typeof item === 'string' ? 'neutral' : item?.label

                          return (
                            <li key={`${stock.ticker}-${index}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                              <span
                                aria-hidden='true'
                                style={{
                                  ...dotStyle(label),
                                  marginTop: '0.35rem',
                                  width: '0.45rem',
                                  height: '0.45rem',
                                  borderRadius: '999px',
                                  flexShrink: 0,
                                }}
                              />
                              <span
                                style={{
                                  color: '#94a3b8',
                                  fontSize: '0.82rem',
                                  lineHeight: 1.4,
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                }}
                                title={headline}
                              >
                                {headline}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </article>
                )
              })}
            </section>
          </>
        )}
      </div>
    </div>
  )
}

export default SentimentPage