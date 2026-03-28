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
  maxWidth: '72rem',
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

const numberStyle = {
  fontFamily: "'Barlow Condensed', 'DM Sans', sans-serif",
  letterSpacing: '0.02em',
}

const spinnerStyle = {
  width: '2rem',
  height: '2rem',
  borderRadius: '999px',
  border: '3px solid rgba(148, 163, 184, 0.35)',
  borderTopColor: '#f97316',
}

const formatPercent = (value) => {
  const numeric = Number(value)

  if (!Number.isFinite(numeric)) {
    return '0.00%'
  }

  return `${numeric.toFixed(2)}%`
}

const formatDate = (value) => {
  if (!value) {
    return '-'
  }

  const dateValue = new Date(value)
  if (Number.isNaN(dateValue.getTime())) {
    return String(value)
  }

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(dateValue)
}

const BenchmarkPage = () => {
  const [benchmark, setBenchmark] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    const fetchBenchmark = async () => {
      setLoading(true)
      setError('')

      try {
        const response = await api.get('/api/analytics/benchmark')

        if (isMounted) {
          setBenchmark(response?.data || null)
        }
      } catch {
        if (isMounted) {
          setError('Unable to load benchmark comparison right now.')
          setBenchmark(null)
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchBenchmark()

    return () => {
      isMounted = false
    }
  }, [])

  const todayLabel = useMemo(() => formatDate(new Date().toISOString()), [])
  const startDateLabel = formatDate(benchmark?.startDate)
  const isOutperforming = Boolean(benchmark?.outperforming)

  return (
    <div style={shellStyle}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=DM+Sans:wght@400;500;700&display=swap');

        .benchmark-spin {
          animation: benchmark-spin 0.9s linear infinite;
        }

        @keyframes benchmark-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .benchmark-comparison-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
        }

        .benchmark-details-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.75rem;
        }

        @media (max-width: 840px) {
          .benchmark-details-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div style={containerStyle}>
        {loading ? (
          <section style={{ ...cardStyle, minHeight: '220px', display: 'grid', placeItems: 'center' }}>
            <div className='benchmark-spin' style={spinnerStyle} aria-label='Loading benchmark comparison' />
          </section>
        ) : error ? (
          <section style={{ ...cardStyle, padding: '1.1rem 1.2rem' }}>
            <p style={{ margin: 0, color: '#fca5a5' }}>{error}</p>
          </section>
        ) : !benchmark || !benchmark.startDate ? (
          <section style={{ ...cardStyle, padding: '1.1rem 1.2rem' }}>
            <p style={{ margin: 0, color: '#94a3b8' }}>Not enough history to compare against Nifty 50 yet.</p>
          </section>
        ) : (
          <>
            <section
              style={{
                ...cardStyle,
                width: '100%',
                padding: '1.5rem 1.2rem',
                textAlign: 'center',
                backgroundColor: isOutperforming ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                borderColor: isOutperforming ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)',
              }}
            >
              <h1
                style={{
                  margin: 0,
                  color: '#ffffff',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  lineHeight: 1.45,
                }}
              >
                {benchmark?.verdict || 'Benchmark comparison unavailable'}
              </h1>
            </section>

            <section className='benchmark-comparison-row'>
              <article style={{ ...cardStyle, padding: '1.2rem' }}>
                <p style={{ margin: 0, color: '#cbd5e1', fontWeight: 600, fontSize: '1rem' }}>Your Portfolio</p>
                <p
                  style={{
                    ...numberStyle,
                    margin: '0.5rem 0 0',
                    fontSize: '3rem',
                    lineHeight: 1,
                    color: '#f97316',
                    fontWeight: 700,
                  }}
                >
                  {formatPercent(benchmark?.userCAGR)}
                </p>
                <p style={{ margin: '0.35rem 0 0', color: '#e2e8f0' }}>Annualised Return</p>
                <p style={{ margin: '0.5rem 0 0', color: '#94a3b8', fontSize: '0.95rem' }}>
                  Portfolio Beta: {Number(benchmark?.portfolioBeta || 0).toFixed(2)}
                </p>
              </article>

              <article style={{ ...cardStyle, padding: '1.2rem' }}>
                <p style={{ margin: 0, color: '#cbd5e1', fontWeight: 600, fontSize: '1rem' }}>Nifty 50</p>
                <p
                  style={{
                    ...numberStyle,
                    margin: '0.5rem 0 0',
                    fontSize: '3rem',
                    lineHeight: 1,
                    color: '#3b82f6',
                    fontWeight: 700,
                  }}
                >
                  {formatPercent(benchmark?.niftyCAGR)}
                </p>
                <p style={{ margin: '0.35rem 0 0', color: '#e2e8f0' }}>Annualised Return</p>
                <p style={{ margin: '0.5rem 0 0', color: '#94a3b8', fontSize: '0.95rem' }}>Benchmark</p>
              </article>
            </section>

            <section className='benchmark-details-row'>
              <article style={{ ...cardStyle, padding: '1rem' }}>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>Start Date</p>
                <p style={{ margin: '0.4rem 0 0', color: '#f8fafc', fontWeight: 600 }}>{startDateLabel}</p>
              </article>

              <article style={{ ...cardStyle, padding: '1rem' }}>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>Period measured</p>
                <p style={{ margin: '0.4rem 0 0', color: '#f8fafc', fontWeight: 600 }}>
                  {startDateLabel} to {todayLabel}
                </p>
              </article>

              <article style={{ ...cardStyle, padding: '1rem', display: 'grid', alignItems: 'center' }}>
                <span
                  style={{
                    justifySelf: 'start',
                    borderRadius: '999px',
                    padding: '0.35rem 0.75rem',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    backgroundColor: isOutperforming ? 'rgba(34, 197, 94, 0.18)' : 'rgba(239, 68, 68, 0.18)',
                    border: isOutperforming
                      ? '1px solid rgba(34, 197, 94, 0.45)'
                      : '1px solid rgba(239, 68, 68, 0.45)',
                    color: isOutperforming ? '#86efac' : '#fca5a5',
                  }}
                >
                  {isOutperforming ? 'Beating Nifty ✓' : 'Trailing Nifty ✗'}
                </span>
              </article>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

export default BenchmarkPage