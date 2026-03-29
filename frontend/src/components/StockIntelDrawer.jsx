import { useEffect, useMemo, useState } from 'react'
import api from '../services/api'

const STAGES = {
  idle: 0,
  price: 1,
  technicals: 2,
  events: 3,
  fundamentals: 4,
  gemini: 5,
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const toNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const formatInr = (value, digits = 2) => {
  const num = toNumber(value)
  if (num === null) return 'N/A'

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(num)
}

const formatCompact = (value) => {
  const num = toNumber(value)
  if (num === null) return 'N/A'

  return new Intl.NumberFormat('en-IN', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(num)
}

const formatNumber = (value, digits = 2) => {
  const num = toNumber(value)
  if (num === null) return 'N/A'

  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(num)
}

const formatDate = (dateStr) => {
  if (!dateStr || dateStr === 'null' || dateStr === 'None') return 'N/A'
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return 'N/A'
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return 'N/A'
  }
}

const DrawerSection = ({ title, loading, children }) => (
  <section
    style={{
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '0.9rem',
      padding: '0.95rem',
      background: 'rgba(255,255,255,0.02)',
    }}
  >
    <h3
      style={{
        margin: 0,
        marginBottom: '0.75rem',
        fontSize: '0.9rem',
        color: '#cbd5e1',
        letterSpacing: '0.02em',
      }}
    >
      {title}
    </h3>

    {loading ? (
      <div style={{ display: 'grid', gap: '0.55rem' }}>
        <div className='intel-skeleton' style={{ height: '1.2rem', width: '45%' }} />
        <div className='intel-skeleton' style={{ height: '0.8rem', width: '100%' }} />
        <div className='intel-skeleton' style={{ height: '0.8rem', width: '80%' }} />
      </div>
    ) : (
      children
    )}
  </section>
)

const StockIntelDrawer = ({ ticker, isOpen, onClose }) => {
  const [intel, setIntel] = useState(null)
  const [requestState, setRequestState] = useState('idle')
  const [loadStage, setLoadStage] = useState(STAGES.idle)
  const [error, setError] = useState('')

  const displayTicker = useMemo(() => {
    return String(ticker || '')
      .trim()
      .toUpperCase()
      .replace(/\.NS$/i, '')
  }, [ticker])

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !ticker) {
      return undefined
    }

    let cancelled = false

    const fetchIntel = async () => {
      setRequestState('loading')
      setLoadStage(STAGES.idle)
      setError('')
      setIntel(null)

      try {
        const response = await api.get(`/api/stock-intel/${encodeURIComponent(String(ticker).trim().toUpperCase())}`)
        if (cancelled) {
          return
        }

        setIntel(response?.data || {})
        setRequestState('success')

        const revealOrder = [
          STAGES.price,
          STAGES.technicals,
          STAGES.events,
          STAGES.fundamentals,
          STAGES.gemini,
        ]

        for (const stage of revealOrder) {
          if (cancelled) break
          await sleep(180)
          if (cancelled) break
          setLoadStage(stage)
        }
      } catch (requestError) {
        if (cancelled) {
          return
        }

        const message = requestError?.response?.data?.detail || 'Unable to load stock intelligence right now.'
        setError(String(message))
        setRequestState('error')
      }
    }

    fetchIntel()

    return () => {
      cancelled = true
    }
  }, [isOpen, ticker])

  useEffect(() => {
    if (!isOpen) return undefined

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  const price = intel?.price_snapshot || {}
  const volume = intel?.volume || {}
  const technicals = intel?.technicals || {}
  const sentiment = intel?.sentiment || {}
  const events = intel?.events || {}
  const fundamentals = intel?.fundamentals || {}
  const gemini = intel?.gemini || {}

  const priceNumber = toNumber(price.price)
  const weekLow = toNumber(price.week52_low)
  const weekHigh = toNumber(price.week52_high)
  const rangeProgress =
    priceNumber !== null && weekLow !== null && weekHigh !== null && weekHigh > weekLow
      ? clamp(((priceNumber - weekLow) / (weekHigh - weekLow)) * 100, 0, 100)
      : 0

  const rsiValue = toNumber(technicals.rsi)
  const rsiSignal = String(technicals.rsi_signal || '').toLowerCase()
  const rsiColor = rsiSignal === 'overbought' ? '#ef4444' : rsiSignal === 'oversold' ? '#22c55e' : '#9ca3af'

  const changePct = toNumber(price.change_pct)
  const changeRs = toNumber(price.change_rs)
  const isPositive = (changePct || 0) >= 0

  const volumeRatio = toNumber(volume.ratio)
  const showVolumeBadge = Boolean(volume.unusual) && volumeRatio !== null
  const contradictionText = String(gemini.contradiction || '').trim()
  const showContradiction = Boolean(contradictionText)

  const hasEvents = Boolean(events.next_dividend_date || events.next_dividend_amount || events.next_earnings)

  return (
    <div
      role='dialog'
      aria-modal='true'
      aria-label='Stock intelligence drawer'
      onClick={() => onClose?.()}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=DM+Sans:wght@400;500;700&display=swap');

        .intel-drawer {
          width: 100%;
          height: 85vh;
          background: #111827;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          border-top-left-radius: 1rem;
          border-top-right-radius: 1rem;
          transform: translateY(100%);
          animation: intel-slide-up 0.26s ease forwards;
          font-family: 'DM Sans', sans-serif;
          color: #f8fafc;
          display: flex;
          flex-direction: column;
        }

        .intel-scroll {
          overflow-y: auto;
          padding: 1rem;
          display: grid;
          gap: 0.85rem;
        }

        .intel-number {
          font-family: 'Barlow Condensed', 'DM Sans', sans-serif;
          letter-spacing: 0.02em;
        }

        .intel-skeleton {
          border-radius: 0.5rem;
          background: linear-gradient(90deg, rgba(148,163,184,0.15) 25%, rgba(148,163,184,0.32) 50%, rgba(148,163,184,0.15) 75%);
          background-size: 200% 100%;
          animation: intel-shimmer 1.2s linear infinite;
        }

        .intel-badge {
          display: inline-flex;
          align-items: center;
          padding: 0.2rem 0.5rem;
          border-radius: 999px;
          font-size: 0.73rem;
          font-weight: 700;
        }

        @keyframes intel-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        @keyframes intel-slide-up {
          to { transform: translateY(0); }
        }
      `}</style>

      <div className='intel-drawer' onClick={(event) => event.stopPropagation()}>
        <header
          style={{
            padding: '0.9rem 1rem',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{displayTicker || 'Stock Intel'}</h2>
          <button
            type='button'
            onClick={() => onClose?.()}
            aria-label='Close stock intel drawer'
            style={{
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent',
              color: '#f8fafc',
              width: '2rem',
              height: '2rem',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 700,
            }}
          >
            X
          </button>
        </header>

        <div className='intel-scroll'>
          {requestState === 'error' && (
            <section
              style={{
                borderRadius: '0.8rem',
                border: '1px solid rgba(239,68,68,0.4)',
                background: 'rgba(127,29,29,0.35)',
                padding: '0.85rem',
                color: '#fecaca',
              }}
            >
              {error}
            </section>
          )}

          <DrawerSection title='Price Snapshot' loading={requestState !== 'success' || loadStage < STAGES.price}>
            <p className='intel-number' style={{ margin: 0, fontSize: '2.5rem', lineHeight: 1 }}>
              {formatInr(price.price)}
            </p>
            <p
              className='intel-number'
              style={{
                margin: '0.35rem 0 0',
                fontSize: '1.1rem',
                color: isPositive ? '#22c55e' : '#ef4444',
                display: 'flex',
                gap: '0.55rem',
                alignItems: 'center',
              }}
            >
              <span>{changePct === null ? 'N/A' : `${changePct >= 0 ? '+' : ''}${formatNumber(changePct, 2)}%`}</span>
              <span>{changeRs === null ? '' : `(${changeRs >= 0 ? '+' : ''}${formatInr(changeRs)})`}</span>
            </p>

            <div style={{ marginTop: '0.8rem' }}>
              <div
                style={{
                  width: '100%',
                  height: '0.55rem',
                  borderRadius: '999px',
                  background: 'rgba(148,163,184,0.2)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${rangeProgress}%`,
                    height: '100%',
                    borderRadius: '999px',
                    background: 'linear-gradient(90deg, #f97316, #fb923c)',
                  }}
                />
              </div>

              <div
                className='intel-number'
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: '0.4rem',
                  fontSize: '0.82rem',
                  color: '#94a3b8',
                }}
              >
                <span>52W Low: {formatInr(price.week52_low)}</span>
                <span>52W High: {formatInr(price.week52_high)}</span>
              </div>
            </div>

            <p style={{ margin: '0.7rem 0 0', color: '#94a3b8', fontSize: '0.82rem' }}>Market Cap: {formatCompact(price.market_cap)}</p>
          </DrawerSection>

          <DrawerSection title='Volume Analysis' loading={requestState !== 'success' || loadStage < STAGES.gemini}>
            <p style={{ margin: 0, color: '#cbd5e1', fontSize: '0.9rem' }}>
              Today: <span className='intel-number'>{formatNumber(volume.today, 0)}</span> | Average:{' '}
              <span className='intel-number'>{formatNumber(volume.average, 0)}</span>
            </p>

            {showVolumeBadge && (
              <span
                className='intel-badge'
                style={{
                  marginTop: '0.55rem',
                  color: '#fdba74',
                  background: 'rgba(249, 115, 22, 0.16)',
                  border: '1px solid rgba(249,115,22,0.45)',
                }}
              >
                {`⚡ Unusual Volume ${formatNumber(volumeRatio, 2)}x`}
              </span>
            )}

            <p style={{ margin: '0.6rem 0 0', color: '#94a3b8', fontStyle: 'italic' }}>
              {String(volume.reasoning || 'No unusual volume trigger detected.')}
            </p>
          </DrawerSection>

          <DrawerSection title='Technical Signals' loading={requestState !== 'success' || loadStage < STAGES.technicals}>
            <div style={{ marginBottom: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ color: '#cbd5e1' }}>RSI Gauge</span>
                <span className='intel-number' style={{ color: rsiColor, fontSize: '1.1rem', fontWeight: 700 }}>
                  {rsiValue === null ? 'N/A' : formatNumber(rsiValue, 1)}
                </span>
              </div>

              <div style={{ height: '0.55rem', borderRadius: '999px', background: 'rgba(148,163,184,0.2)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${clamp(rsiValue || 0, 0, 100)}%`,
                    background: rsiColor,
                    borderRadius: '999px',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              <span
                className='intel-badge'
                style={{
                  color: String(technicals.macd_signal || '').toLowerCase().includes('bullish') ? '#86efac' : '#fca5a5',
                  background: String(technicals.macd_signal || '').toLowerCase().includes('bullish')
                    ? 'rgba(34,197,94,0.16)'
                    : 'rgba(239,68,68,0.16)',
                  border: String(technicals.macd_signal || '').toLowerCase().includes('bullish')
                    ? '1px solid rgba(34,197,94,0.45)'
                    : '1px solid rgba(239,68,68,0.45)',
                }}
              >
                {String(technicals.macd_signal || '').toLowerCase().includes('bullish') ? 'Bullish' : 'Bearish'}
              </span>

              <span className='intel-badge' style={{ color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.2)' }}>
                {String(technicals.ma_signal || 'MA Signal')}
              </span>
            </div>

            <div
              style={{
                marginTop: '0.75rem',
                padding: '0.55rem 0.7rem',
                borderRadius: '0.65rem',
                background: 'rgba(249,115,22,0.15)',
                border: '1px solid rgba(249,115,22,0.35)',
                color: '#fed7aa',
              }}
            >
              <strong>{String(technicals.pattern || 'No clear pattern')}</strong>
            </div>

            <p style={{ margin: '0.55rem 0 0', color: '#cbd5e1' }}>{String(technicals.pattern_explanation || '')}</p>
          </DrawerSection>

          <DrawerSection title='News & Sentiment' loading={requestState !== 'success' || loadStage < STAGES.gemini}>
            <span
              className='intel-badge'
              style={{
                color:
                  sentiment.badge === 'Bullish' ? '#86efac' : sentiment.badge === 'Bearish' ? '#fca5a5' : '#d1d5db',
                border:
                  sentiment.badge === 'Bullish'
                    ? '1px solid rgba(34,197,94,0.45)'
                    : sentiment.badge === 'Bearish'
                    ? '1px solid rgba(239,68,68,0.45)'
                    : '1px solid rgba(156,163,175,0.35)',
                background:
                  sentiment.badge === 'Bullish'
                    ? 'rgba(34,197,94,0.16)'
                    : sentiment.badge === 'Bearish'
                    ? 'rgba(239,68,68,0.16)'
                    : 'rgba(156,163,175,0.14)',
              }}
            >
              FinBERT: {String(sentiment.badge || 'Neutral')}
            </span>

            <ul style={{ margin: '0.6rem 0 0', paddingLeft: '1.1rem', color: '#94a3b8' }}>
              {(Array.isArray(sentiment.headlines) ? sentiment.headlines : []).slice(0, 3).map((headline, index) => (
                <li key={`${headline}-${index}`} style={{ marginBottom: '0.32rem' }}>
                  {headline}
                </li>
              ))}
            </ul>

            <p style={{ margin: '0.45rem 0 0', color: '#ffffff', fontStyle: 'italic' }}>
              {String(gemini.news_reasoning || 'No news-based reasoning available.')}
            </p>
          </DrawerSection>

          <DrawerSection title='Market Ripple Effect 🌊' loading={requestState !== 'success' || loadStage < STAGES.gemini}>
            <div style={{ borderLeft: '3px solid #f97316', paddingLeft: '0.7rem', color: '#f8fafc' }}>
              {String(gemini.ripple_effect || 'No ripple effect commentary available.')}
            </div>
          </DrawerSection>

          {showContradiction && (
            <DrawerSection title='Contradiction Detector' loading={requestState !== 'success' || loadStage < STAGES.gemini}>
              <div
                style={{
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(249,115,22,0.45)',
                  background: 'rgba(249,115,22,0.14)',
                  padding: '0.7rem',
                }}
              >
                <p style={{ margin: 0, color: '#fdba74', fontWeight: 700 }}>⚠️ Signal Contradiction</p>
                <p style={{ margin: '0.45rem 0 0', color: '#ffedd5' }}>{contradictionText}</p>
              </div>
            </DrawerSection>
          )}

          <DrawerSection title='Fundamentals' loading={requestState !== 'success' || loadStage < STAGES.fundamentals}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '0.55rem' }}>
              <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0.6rem', padding: '0.55rem' }}>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.75rem' }}>P/E Ratio</p>
                <p className='intel-number' style={{ margin: '0.2rem 0 0', fontSize: '1.15rem' }}>
                  {formatNumber(fundamentals.pe_ratio, 2)}
                </p>
              </div>
              <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0.6rem', padding: '0.55rem' }}>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.75rem' }}>Debt/Equity</p>
                <p className='intel-number' style={{ margin: '0.2rem 0 0', fontSize: '1.15rem' }}>
                  {formatNumber(fundamentals.debt_equity, 2)}
                </p>
              </div>
              <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0.6rem', padding: '0.55rem' }}>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.75rem' }}>Revenue Growth</p>
                <p className='intel-number' style={{ margin: '0.2rem 0 0', fontSize: '1.15rem' }}>
                  {toNumber(fundamentals.revenue_growth) === null
                    ? 'N/A'
                    : `${formatNumber((toNumber(fundamentals.revenue_growth) || 0) * 100, 2)}%`}
                </p>
              </div>
              <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0.6rem', padding: '0.55rem' }}>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.75rem' }}>Profit Margins</p>
                <p className='intel-number' style={{ margin: '0.2rem 0 0', fontSize: '1.15rem' }}>
                  {toNumber(fundamentals.profit_margin) === null
                    ? 'N/A'
                    : `${formatNumber((toNumber(fundamentals.profit_margin) || 0) * 100, 2)}%`}
                </p>
              </div>
              <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0.6rem', padding: '0.55rem' }}>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.75rem' }}>Analyst Rating</p>
                <p className='intel-number' style={{ margin: '0.2rem 0 0', fontSize: '1.15rem' }}>
                  {String(fundamentals.analyst_rating || 'N/A')}
                </p>
              </div>
            </div>

            <p style={{ margin: '0.6rem 0 0', color: '#cbd5e1', fontStyle: 'italic' }}>
              {String(fundamentals.verdict || gemini.fundamental_verdict || 'No fundamental verdict available.')}
            </p>
          </DrawerSection>

          <DrawerSection title='Events' loading={requestState !== 'success' || loadStage < STAGES.events}>
            {hasEvents ? (
              <div style={{ display: 'grid', gap: '0.45rem' }}>
                <p style={{ margin: 0, color: '#e5e7eb' }}>
                  Next dividend:{' '}
                  <span className='intel-number'>
                    {formatDate(events.next_dividend_date)}
                    {events.next_dividend_amount ? ` (${formatInr(events.next_dividend_amount)})` : ''}
                  </span>
                </p>
                <p style={{ margin: 0, color: '#e5e7eb' }}>
                  Next earnings date: <span className='intel-number'>{formatDate(events.next_earnings)}</span>
                </p>
              </div>
            ) : (
              <p style={{ margin: 0, color: '#9ca3af' }}>No upcoming events</p>
            )}
          </DrawerSection>

          <DrawerSection title='Institutional Flow' loading={requestState !== 'success' || loadStage < STAGES.gemini}>
            <div
              style={{
                borderRadius: '0.7rem',
                border: '1px solid rgba(148,163,184,0.25)',
                background: 'rgba(148,163,184,0.12)',
                padding: '0.75rem',
              }}
            >
              <p style={{ margin: 0, color: '#e2e8f0', fontWeight: 700 }}>🔒 Institutional Flow — Coming Soon</p>
              <p style={{ margin: '0.35rem 0 0', color: '#cbd5e1', fontSize: '0.8rem' }}>
                FII/DII data requires NSE data feed integration
              </p>
            </div>
          </DrawerSection>
        </div>
      </div>
    </div>
  )
}

export default StockIntelDrawer