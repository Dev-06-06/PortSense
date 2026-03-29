import { useEffect, useMemo, useState } from 'react'
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
  maxWidth: '78rem',
  margin: '0 auto',
  display: 'grid',
  gap: '1rem',
}

const cardStyle = {
  borderRadius: '1rem',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  backgroundColor: 'rgba(15, 23, 42, 0.6)',
  backdropFilter: 'blur(8px)',
}

const numberStyle = {
  fontFamily: "'Barlow Condensed', 'DM Sans', sans-serif",
  letterSpacing: '0.02em',
}

const spinnerStyle = {
  width: '2rem',
  height: '2rem',
  borderRadius: '999px',
  border: '3px solid rgba(148, 163, 184, 0.35)',
  borderTopColor: '#16a34a',
}

const sanitizeTicker = (ticker) => String(ticker || '').replace(/\.NS$/i, '').trim()

const toNumber = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const normalizeCorrelationPayload = (payload) => {
  const matrixSource = payload?.matrix || payload?.correlationMatrix || payload?.correlations || payload || {}
  const payloadTickers = Array.isArray(payload?.tickers)
    ? payload.tickers
    : Array.isArray(payload?.symbols)
      ? payload.symbols
      : []

  if (Array.isArray(matrixSource)) {
    const tickers = payloadTickers.map(sanitizeTicker)
    const matrix = matrixSource.map((row, rowIndex) =>
      (Array.isArray(row) ? row : []).map((value, columnIndex) => {
        if (rowIndex === columnIndex) {
          return 1
        }

        return toNumber(value)
      }),
    )

    return { tickers, matrix }
  }

  const objectMatrix = typeof matrixSource === 'object' && matrixSource !== null ? matrixSource : {}
  const rawTickers = payloadTickers.length > 0 ? payloadTickers : Object.keys(objectMatrix)
  const tickers = rawTickers.map(sanitizeTicker)

  const matrix = tickers.map((rowTicker, rowIndex) =>
    tickers.map((columnTicker, columnIndex) => {
      if (rowIndex === columnIndex) {
        return 1
      }

      const rowKey = rawTickers[rowIndex]
      const columnKey = rawTickers[columnIndex]
      const fromExact = objectMatrix?.[rowKey]?.[columnKey]
      const fromSanitized = objectMatrix?.[rowTicker]?.[columnTicker]
      const reverseExact = objectMatrix?.[columnKey]?.[rowKey]
      const reverseSanitized = objectMatrix?.[columnTicker]?.[rowTicker]

      return toNumber(fromExact ?? fromSanitized ?? reverseExact ?? reverseSanitized)
    }),
  )

  return { tickers, matrix }
}

const getCellVisual = (value, isDiagonal) => {
  if (isDiagonal) {
    return { background: '#f97316', color: '#111827' }
  }

  if (value > 0.7) {
    return { background: '#16a34a', color: '#f8fafc' }
  }

  if (value >= 0.3 && value <= 0.7) {
    return { background: '#4ade80', color: '#111827' }
  }

  if (value >= -0.3 && value <= 0.3) {
    return { background: '#334155', color: '#e2e8f0' }
  }

  if (value >= -0.7 && value < -0.3) {
    return { background: '#f87171', color: '#111827' }
  }

  return { background: '#dc2626', color: '#f8fafc' }
}

const getStrengthLabel = (value) => {
  const absValue = Math.abs(value)

  if (absValue < 0.3) {
    return 'Weak'
  }

  if (absValue < 0.7) {
    return value >= 0 ? 'Moderate Positive' : 'Moderate Negative'
  }

  return value >= 0 ? 'Strong Positive' : 'Strong Negative'
}

const getPairBorderColor = (value) => {
  const absValue = Math.abs(value)

  if (absValue < 0.3) {
    return '#64748b'
  }

  return value >= 0 ? '#16a34a' : '#dc2626'
}

const CorrelationPage = () => {
  const [matrixData, setMatrixData] = useState({ tickers: [], matrix: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedPair, setExpandedPair] = useState(null)
  const [explanations, setExplanations] = useState({})
  const [loadingPair, setLoadingPair] = useState(null)

  useEffect(() => {
    document.title = 'Correlation | PortSense'
  }, [])

  useEffect(() => {
    let isMounted = true

    const fetchCorrelation = async () => {
      setLoading(true)
      setError('')

      try {
        const response = await api.get('/api/analytics/correlation')

        if (!isMounted) {
          return
        }

        const normalized = normalizeCorrelationPayload(response?.data)
        setMatrixData(normalized)
      } catch {
        if (isMounted) {
          setError('Unable to load correlation analytics right now.')
          setMatrixData({ tickers: [], matrix: [] })
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchCorrelation()

    return () => {
      isMounted = false
    }
  }, [])

  const topPairs = useMemo(() => {
    const pairs = []
    const { tickers, matrix } = matrixData

    for (let rowIndex = 0; rowIndex < tickers.length; rowIndex += 1) {
      for (let columnIndex = rowIndex + 1; columnIndex < tickers.length; columnIndex += 1) {
        const value = toNumber(matrix?.[rowIndex]?.[columnIndex])

        pairs.push({
          ticker1: tickers[rowIndex],
          ticker2: tickers[columnIndex],
          correlation: Number(value.toFixed(2)),
          absCorrelation: Math.abs(value),
        })
      }
    }

    return pairs.sort((a, b) => b.absCorrelation - a.absCorrelation).slice(0, 5)
  }, [matrixData])

  const handleExplain = async (pair) => {
    const key = `${pair.ticker1}-${pair.ticker2}`

    if (expandedPair === key) {
      setExpandedPair(null)
      return
    }

    if (explanations[key]) {
      setExpandedPair(key)
      return
    }

    setLoadingPair(key)

    try {
      const res = await api.post('/api/genai/explain-correlation', {
        ticker1: pair.ticker1,
        ticker2: pair.ticker2,
        correlation: pair.correlation,
        strength: getStrengthLabel(pair.correlation),
      })

      setExplanations((prev) => ({ ...prev, [key]: res.data.explanation }))
      setExpandedPair(key)
    } catch {
      setExplanations((prev) => ({ ...prev, [key]: 'Unable to load explanation.' }))
      setExpandedPair(key)
    } finally {
      setLoadingPair(null)
    }
  }

  const hasMatrix = matrixData.tickers.length > 0 && matrixData.matrix.length > 0

  return (
    <div style={shellStyle}>
      <style>{`
        .top-pairs-grid {
          display: grid;
          gap: 0.5rem;
          grid-template-columns: 1fr;
        }

        .top-pair-card {
          width: 100%;
        }

        .correlation-section {
          padding: 1.25rem;
        }

        .correlation-title {
          font-size: 1.25rem;
        }

        .correlation-spin {
          animation: correlation-spin 0.9s linear infinite;
        }

        @keyframes correlation-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (max-width: 360px) {
          .correlation-section {
            padding: 0.9rem !important;
          }

          .correlation-title {
            font-size: 1.12rem;
          }

          .top-pair-card {
            padding: 0.7rem 0.75rem !important;
            gap: 0.55rem !important;
          }
        }
      `}</style>

      <div style={containerStyle}>
        <section className='correlation-section' style={cardStyle}>
          <h2 className='correlation-title' style={{ marginTop: 0, marginBottom: '0.75rem', color: '#f8fafc' }}>
            Correlation Heatmap
          </h2>
          <p style={{ marginTop: 0, marginBottom: '1rem', color: '#94a3b8' }}>
            Pairwise stock correlation matrix for current holdings.
          </p>

          {loading ? (
            <div style={{ minHeight: '260px', display: 'grid', placeItems: 'center' }}>
              <div className='correlation-spin' style={spinnerStyle} aria-label='Loading correlation analytics' />
            </div>
          ) : error ? (
            <p style={{ margin: 0, color: '#fca5a5' }}>{error}</p>
          ) : !hasMatrix ? (
            <p style={{ margin: 0, color: '#94a3b8' }}>No correlation matrix data available yet.</p>
          ) : (
            <div style={{ overflowX: 'auto', paddingBottom: '0.25rem' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: '6px', width: 'max-content', minWidth: '500px' }}>
                <thead>
                  <tr>
                    <th
                      style={{
                        minWidth: '100px',
                        padding: '0.45rem',
                        color: '#cbd5e1',
                        textAlign: 'left',
                        fontWeight: 600,
                      }}
                    >
                      Ticker
                    </th>
                    {matrixData.tickers.map((ticker) => (
                      <th
                        key={`header-${ticker}`}
                        style={{
                          minWidth: '64px',
                          minHeight: '64px',
                          width: '64px',
                          height: '64px',
                          padding: '0.25rem',
                          color: '#cbd5e1',
                          textAlign: 'center',
                          fontWeight: 600,
                          ...numberStyle,
                        }}
                      >
                        {ticker}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {matrixData.tickers.map((rowTicker, rowIndex) => (
                    <tr key={`row-${rowTicker}`}>
                      <th
                        style={{
                          minWidth: '100px',
                          padding: '0.45rem',
                          color: '#cbd5e1',
                          textAlign: 'left',
                          fontWeight: 600,
                          ...numberStyle,
                        }}
                      >
                        {rowTicker}
                      </th>

                      {matrixData.tickers.map((columnTicker, columnIndex) => {
                        const isDiagonal = rowIndex === columnIndex
                        const value = isDiagonal ? 1 : toNumber(matrixData.matrix?.[rowIndex]?.[columnIndex])
                        const visual = getCellVisual(value, isDiagonal)

                        return (
                          <td
                            key={`cell-${rowTicker}-${columnTicker}`}
                            style={{
                              minWidth: '64px',
                              minHeight: '64px',
                              width: '64px',
                              height: '64px',
                              padding: '0.25rem',
                              textAlign: 'center',
                              verticalAlign: 'middle',
                              borderRadius: '0.5rem',
                              backgroundColor: visual.background,
                              color: visual.color,
                              fontSize: '1.1rem',
                              fontWeight: 600,
                              ...numberStyle,
                            }}
                          >
                            {value.toFixed(2)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className='correlation-section' style={cardStyle}>
          <h2 className='correlation-title' style={{ marginTop: 0, marginBottom: '0.75rem', color: '#f8fafc' }}>
            Top Correlated Pairs
          </h2>

          {loading ? (
            <p style={{ margin: 0, color: '#94a3b8' }}>Calculating strongest pairs...</p>
          ) : topPairs.length === 0 ? (
            <p style={{ margin: 0, color: '#94a3b8' }}>Not enough data to compute pairs.</p>
          ) : (
            <div className='top-pairs-grid'>
              {topPairs.map((pair) => {
                const key = `${pair.ticker1}-${pair.ticker2}`

                return (
                  <div key={key}>
                    <article
                      className='top-pair-card'
                      style={{
                        borderRadius: '0.85rem',
                        border: `1px solid ${getPairBorderColor(pair.correlation)}`,
                        backgroundColor: 'rgba(2, 6, 23, 0.45)',
                        padding: '0.85rem 1rem',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <p style={{ margin: 0, color: '#e2e8f0', fontWeight: 600 }}>
                        {pair.ticker1} ↔ {pair.ticker2}
                      </p>
                      <p style={{ margin: 0, color: '#cbd5e1', ...numberStyle, fontSize: '1.15rem' }}>
                        {pair.correlation.toFixed(2)}
                      </p>
                      <p style={{ margin: 0, color: '#94a3b8' }}>{getStrengthLabel(pair.correlation)}</p>
                      <button
                        onClick={() => handleExplain(pair)}
                        disabled={loadingPair === key}
                        style={{
                          border: '1px solid rgba(249,115,22,0.4)',
                          backgroundColor: 'rgba(249,115,22,0.1)',
                          color: '#f97316',
                          borderRadius: '0.6rem',
                          padding: '0.35rem 0.85rem',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: loadingPair === key ? 'not-allowed' : 'pointer',
                          opacity: loadingPair === key ? 0.6 : 1,
                        }}
                      >
                        {loadingPair === key ? 'Loading...' : expandedPair === key ? 'Hide' : 'Explain'}
                      </button>
                    </article>
                    {expandedPair === key && explanations[key] && (
                      <div
                        style={{
                          borderRadius: '0.75rem',
                          border: '1px solid rgba(255,255,255,0.07)',
                          backgroundColor: 'rgba(2,6,23,0.6)',
                          padding: '0.85rem 1rem',
                          marginTop: '-0.25rem',
                        }}
                      >
                        <p style={{ margin: 0, color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.6 }}>
                          {explanations[key]}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default CorrelationPage
