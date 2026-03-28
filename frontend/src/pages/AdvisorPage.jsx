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
  border: '1px solid rgba(255, 255, 255, 0.08)',
  backgroundColor: 'rgba(15, 23, 42, 0.6)',
  backdropFilter: 'blur(8px)',
}

const spinnerStyle = {
  width: '1.4rem',
  height: '1.4rem',
  borderRadius: '999px',
  border: '3px solid rgba(148, 163, 184, 0.35)',
  borderTopColor: '#f97316',
}

const parseAdvice = (text) => {
  const wellMatch = text.match(/\*\*What You Did Well[:\*]*\*?\*?([\s\S]*?)(?=\*\*Key Risks|\*\*Rebalancing|$)/i)
  const risksMatch = text.match(/\*\*Key Risks[:\*]*\*?\*?([\s\S]*?)(?=\*\*Rebalancing|$)/i)
  const stepsMatch = text.match(/\*\*Rebalancing Steps[:\*]*\*?\*?([\s\S]*?)$/i)

  return {
    well: wellMatch?.[1]?.trim() || '',
    risks: risksMatch?.[1]?.trim() || '',
    steps: stepsMatch?.[1]?.trim() || '',
  }
}

const toNumber = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const sanitizeTicker = (ticker) => String(ticker || '').replace(/\.NS$/i, '').trim().toUpperCase()

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

const sectionHeaderStyle = {
  margin: 0,
  fontSize: '1rem',
  fontWeight: 700,
}

const sectionBodyStyle = {
  margin: 0,
  color: '#ffffff',
  fontSize: '0.98rem',
  lineHeight: 1.7,
  whiteSpace: 'pre-wrap',
  fontFamily: "'DM Sans', sans-serif",
}

const AdvisorPage = () => {
  const [adviceText, setAdviceText] = useState('')
  const [adviceLoading, setAdviceLoading] = useState(false)
  const [adviceError, setAdviceError] = useState('')

  const [pairsLoading, setPairsLoading] = useState(true)
  const [pairsError, setPairsError] = useState('')
  const [topPairs, setTopPairs] = useState([])

  const [selectedPairKey, setSelectedPairKey] = useState('')
  const [explainLoading, setExplainLoading] = useState(false)
  const [explanationText, setExplanationText] = useState('')
  const [explainError, setExplainError] = useState('')

  useEffect(() => {
    document.title = 'Advisor | PortSense'
  }, [])

  useEffect(() => {
    let isMounted = true

    const fetchCorrelationPairs = async () => {
      setPairsLoading(true)
      setPairsError('')

      try {
        const response = await api.get('/api/analytics/correlation')

        if (!isMounted) {
          return
        }

        const normalized = normalizeCorrelationPayload(response?.data)
        const pairs = []

        for (let rowIndex = 0; rowIndex < normalized.tickers.length; rowIndex += 1) {
          for (let columnIndex = rowIndex + 1; columnIndex < normalized.tickers.length; columnIndex += 1) {
            const value = toNumber(normalized?.matrix?.[rowIndex]?.[columnIndex])

            pairs.push({
              ticker1: normalized.tickers[rowIndex],
              ticker2: normalized.tickers[columnIndex],
              correlation: Number(value.toFixed(2)),
              absCorrelation: Math.abs(value),
            })
          }
        }

        const topFive = pairs.sort((a, b) => b.absCorrelation - a.absCorrelation).slice(0, 5)
        setTopPairs(topFive)
      } catch {
        if (isMounted) {
          setPairsError('Unable to load correlation pairs right now.')
          setTopPairs([])
        }
      } finally {
        if (isMounted) {
          setPairsLoading(false)
        }
      }
    }

    fetchCorrelationPairs()

    return () => {
      isMounted = false
    }
  }, [])

  const parsedAdvice = useMemo(() => parseAdvice(adviceText), [adviceText])

  const onGetAdvice = async () => {
    setAdviceLoading(true)
    setAdviceError('')

    try {
      const response = await api.post('/api/genai/rebalance')
      const text = response?.data?.advice

      setAdviceText(typeof text === 'string' ? text.trim() : '')
    } catch {
      setAdviceError('Unable to generate rebalancing advice right now.')
      setAdviceText('')
    } finally {
      setAdviceLoading(false)
    }
  }

  const onExplainPair = async (pair) => {
    setSelectedPairKey(`${pair.ticker1}-${pair.ticker2}`)
    setExplainLoading(true)
    setExplainError('')

    try {
      const response = await api.post('/api/genai/explain-correlation', {
        ticker1: pair.ticker1,
        ticker2: pair.ticker2,
        correlation: pair.correlation,
        strength: getStrengthLabel(pair.correlation),
      })

      const text = response?.data?.explanation
      setExplanationText(typeof text === 'string' ? text.trim() : '')
    } catch {
      setExplainError('Unable to explain this correlation right now.')
      setExplanationText('')
    } finally {
      setExplainLoading(false)
    }
  }

  return (
    <div style={shellStyle}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900&display=swap');

        .rebalance-btn {
          width: 100%;
          max-width: none;
        }

        .pair-list {
          display: grid;
          gap: 0.65rem;
          grid-template-columns: 1fr;
        }

        .pair-card {
          width: 100%;
        }

        .advisor-section {
          padding: 1.2rem;
        }

        .advisor-inner-card {
          padding: 1rem;
        }

        .advisor-title {
          font-size: 1.35rem;
        }

        .advisor-spin {
          animation: advisor-spin 0.9s linear infinite;
        }

        @keyframes advisor-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .typing-dots {
          display: inline-flex;
          gap: 0.2rem;
          margin-left: 0.2rem;
          transform: translateY(1px);
        }

        .typing-dot {
          width: 0.32rem;
          height: 0.32rem;
          border-radius: 999px;
          background: #f97316;
          opacity: 0.25;
          animation: typing-dot-bounce 1.1s ease-in-out infinite;
        }

        .typing-dot-1 { animation-delay: 0s; }
        .typing-dot-2 { animation-delay: 0.16s; }
        .typing-dot-3 { animation-delay: 0.32s; }

        @keyframes typing-dot-bounce {
          0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-2px); }
        }

        @media (min-width: 768px) {
          .rebalance-btn {
            max-width: 25rem;
          }
        }

        @media (max-width: 360px) {
          .advisor-section {
            padding: 0.9rem !important;
          }

          .advisor-inner-card {
            padding: 0.8rem !important;
          }

          .pair-card {
            padding: 0.65rem 0.7rem !important;
            gap: 0.45rem !important;
          }

          .advisor-title {
            font-size: 1.18rem;
          }
        }
      `}</style>

      <div style={containerStyle}>
        <section className='advisor-section' style={cardStyle}>
          <h2 className='advisor-title' style={{ margin: 0, color: '#f8fafc' }}>Rebalancing Advisor</h2>
          <p style={{ marginTop: '0.45rem', marginBottom: '1rem', color: '#94a3b8' }}>
            AI-powered advice grounded in your actual portfolio data
          </p>

          <button
            type='button'
            onClick={onGetAdvice}
            disabled={adviceLoading}
            className='rebalance-btn'
            style={{
              border: 'none',
              borderRadius: '0.85rem',
              backgroundColor: adviceLoading ? '#ea580c' : '#f97316',
              color: '#ffffff',
              padding: '0.95rem 1.15rem',
              fontWeight: 900,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              cursor: adviceLoading ? 'not-allowed' : 'pointer',
              opacity: adviceLoading ? 0.85 : 1,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Get Rebalancing Advice
          </button>

          <p style={{ marginTop: '0.6rem', marginBottom: 0, color: '#9ca3af', fontSize: '0.78rem' }}>
            This is AI-generated analysis, not financial advice
          </p>

          {adviceLoading && (
            <div
              style={{
                marginTop: '1rem',
                display: 'grid',
                gap: '0.35rem',
                color: '#cbd5e1',
              }}
            >
              <p style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
                Gemini is analysing your portfolio...
                <span className='typing-dots' aria-hidden='true'>
                  <span className='typing-dot typing-dot-1' />
                  <span className='typing-dot typing-dot-2' />
                  <span className='typing-dot typing-dot-3' />
                </span>
              </p>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.88rem' }}>Usually takes 5-10 seconds</p>
            </div>
          )}

          {adviceError && <p style={{ marginTop: '0.9rem', marginBottom: 0, color: '#fca5a5' }}>{adviceError}</p>}

          {!adviceLoading && adviceText && (
            <article
              className='advisor-inner-card'
              style={{ ...cardStyle, marginTop: '1rem', backgroundColor: 'rgba(2, 6, 23, 0.55)' }}
            >
              <div style={{ display: 'grid', gap: '0.85rem' }}>
                <div style={{ display: 'grid', gap: '0.3rem' }}>
                  <h3 style={{ ...sectionHeaderStyle, color: '#22c55e' }}>What You Did Well</h3>
                  <p style={sectionBodyStyle}>{parsedAdvice.well || 'No details provided.'}</p>
                </div>

                <div style={{ display: 'grid', gap: '0.3rem' }}>
                  <h3 style={{ ...sectionHeaderStyle, color: '#ef4444' }}>Key Risks</h3>
                  <p style={sectionBodyStyle}>{parsedAdvice.risks || 'No details provided.'}</p>
                </div>

                <div style={{ display: 'grid', gap: '0.3rem' }}>
                  <h3 style={{ ...sectionHeaderStyle, color: '#f97316' }}>Rebalancing Steps</h3>
                  <p style={sectionBodyStyle}>{parsedAdvice.steps || 'No details provided.'}</p>
                </div>
              </div>
            </article>
          )}
        </section>

        <section className='advisor-section' style={cardStyle}>
          <h2 className='advisor-title' style={{ margin: 0, color: '#f8fafc' }}>Correlation Explainer</h2>
          <p style={{ marginTop: '0.45rem', marginBottom: '0.9rem', color: '#94a3b8' }}>
            Click any pair below to get an AI explanation
          </p>

          {pairsLoading ? (
            <p style={{ margin: 0, color: '#94a3b8' }}>Loading correlation pairs...</p>
          ) : pairsError ? (
            <p style={{ margin: 0, color: '#fca5a5' }}>{pairsError}</p>
          ) : topPairs.length === 0 ? (
            <p style={{ margin: 0, color: '#94a3b8' }}>No correlation pairs available yet.</p>
          ) : (
            <div className='pair-list'>
              {topPairs.map((pair) => {
                const pairKey = `${pair.ticker1}-${pair.ticker2}`
                const isSelected = selectedPairKey === pairKey

                return (
                  <button
                    key={pairKey}
                    type='button'
                    onClick={() => onExplainPair(pair)}
                    className='pair-card'
                    style={{
                      textAlign: 'left',
                      borderRadius: '0.85rem',
                      border: `1px solid ${isSelected ? '#f97316' : 'rgba(255, 255, 255, 0.12)'}`,
                      backgroundColor: isSelected ? 'rgba(249, 115, 22, 0.1)' : 'rgba(2, 6, 23, 0.45)',
                      color: '#e2e8f0',
                      padding: '0.8rem 0.9rem',
                      cursor: 'pointer',
                      fontFamily: "'DM Sans', sans-serif",
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.6rem',
                    }}
                  >
                    <span>{pair.ticker1} ↔ {pair.ticker2}</span>
                    <span style={{ color: '#cbd5e1', fontWeight: 700 }}>{pair.correlation.toFixed(2)}</span>
                  </button>
                )
              })}
            </div>
          )}

          {explainLoading && (
            <div
              style={{
                marginTop: '0.95rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                color: '#cbd5e1',
              }}
            >
              <div className='advisor-spin' style={spinnerStyle} aria-label='Loading correlation explanation' />
              <p style={{ margin: 0 }}>Gemini is explaining this correlation...</p>
            </div>
          )}

          {explainError && <p style={{ marginTop: '0.9rem', marginBottom: 0, color: '#fca5a5' }}>{explainError}</p>}

          {!explainLoading && explanationText && (
            <article
              className='advisor-inner-card'
              style={{ ...cardStyle, marginTop: '1rem', backgroundColor: 'rgba(2, 6, 23, 0.55)' }}
            >
              <p
                style={{
                  margin: 0,
                  color: '#ffffff',
                  fontFamily: "'DM Sans', sans-serif",
                  lineHeight: 1.7,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {explanationText}
              </p>
            </article>
          )}
        </section>
      </div>
    </div>
  )
}

export default AdvisorPage
