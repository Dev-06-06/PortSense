import { useEffect, useMemo, useState } from 'react'
import { Cell, Pie, PieChart, Tooltip } from 'recharts'
import api from '../services/api'

const SLICE_COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#f59e0b', '#06b6d4']

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
  borderTopColor: '#f97316',
}

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)

const formatWeight = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return 0
  }

  return Number(numeric.toFixed(2))
}

const normalizeRow = (item) => {
  const sector = item?.sector || item?.name || 'Unknown'
  const tickersRaw = item?.tickers
  const tickers = Array.isArray(tickersRaw)
    ? tickersRaw.join(', ')
    : typeof tickersRaw === 'string'
      ? tickersRaw
      : '-'

  const value = Number(item?.value ?? item?.totalValue ?? 0)
  const weight = Number(item?.percentage ?? item?.weight ?? 0)

  return {
    sector,
    tickers,
    value: Number.isFinite(value) ? value : 0,
    weight: formatWeight(weight),
    isOverweight: Boolean(item?.isOverweight),
  }
}

const normalizeStockBetaRow = (item) => {
  const ticker = item?.ticker || item?.symbol || item?.name || '-'
  const beta = Number(item?.beta ?? item?.stockBeta ?? 0)
  const weight = Number(item?.weight ?? item?.weightPct ?? item?.weightPercent ?? 0)

  return {
    ticker,
    beta: Number.isFinite(beta) ? Number(beta.toFixed(2)) : 0,
    weight: Number.isFinite(weight) ? Number(weight.toFixed(2)) : 0,
  }
}

const getRiskLabel = (portfolioBeta) => {
  const value = Number(portfolioBeta)

  if (!Number.isFinite(value)) {
    return 'Moderate'
  }

  if (value < 1) {
    return 'Low Risk'
  }

  if (value <= 1.2) {
    return 'Moderate'
  }

  return 'High Risk'
}

const getRiskColor = (riskLabel) => {
  if (riskLabel === 'Low Risk') {
    return '#22c55e'
  }

  if (riskLabel === 'High Risk') {
    return '#ef4444'
  }

  return '#eab308'
}

const getDiversificationVerdict = (score) => {
  const value = Number(score)

  if (!Number.isFinite(value)) {
    return 'Moderate'
  }

  if (value >= 7.5) {
    return 'Well Diversified'
  }

  if (value >= 5) {
    return 'Moderate'
  }

  return 'Concentrated'
}

const normalizeDiversification = (payload) => {
  const score = Number(payload?.score ?? payload?.diversificationScore ?? 0)
  const sectorScore = Number(payload?.sectorScore ?? payload?.subScores?.sectorScore ?? 0)
  const sizeScore = Number(payload?.sizeScore ?? payload?.subScores?.sizeScore ?? 0)
  const correlationScore = Number(payload?.correlationScore ?? payload?.subScores?.correlationScore ?? 0)
  const verdict = payload?.verdict || getDiversificationVerdict(score)

  return {
    score: Number.isFinite(score) ? Number(score.toFixed(1)) : 0,
    verdict,
    sectorScore: Number.isFinite(sectorScore) ? Number(sectorScore.toFixed(1)) : 0,
    sizeScore: Number.isFinite(sizeScore) ? Number(sizeScore.toFixed(1)) : 0,
    correlationScore: Number.isFinite(correlationScore) ? Number(correlationScore.toFixed(1)) : 0,
  }
}

const scoreBarTrackStyle = {
  width: '100%',
  height: '0.5rem',
  borderRadius: '999px',
  backgroundColor: '#334155',
}

const scoreBarFill = (value, color) => ({
  width: `${Math.max(0, Math.min(100, (Number(value) / 10) * 100))}%`,
  height: '100%',
  borderRadius: '999px',
  backgroundColor: color,
})

const AnalyticsPage = () => {
  const [viewportWidth, setViewportWidth] = useState(() => {
    if (typeof window === 'undefined') {
      return 1200
    }

    return window.innerWidth
  })
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return window.innerWidth < 768
  })
  const [rows, setRows] = useState([])
  const [betaData, setBetaData] = useState({ portfolioBeta: 0, riskLabel: 'Moderate', perStock: [] })
  const [betaLoading, setBetaLoading] = useState(true)
  const [betaError, setBetaError] = useState('')
  const [diversificationData, setDiversificationData] = useState({
    score: 0,
    verdict: 'Moderate',
    sectorScore: 0,
    sizeScore: 0,
    correlationScore: 0,
  })
  const [diversificationLoading, setDiversificationLoading] = useState(true)
  const [diversificationError, setDiversificationError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    document.title = 'Analytics | PortSense'
  }, [])

  useEffect(() => {
    let isMounted = true

    const fetchAnalytics = async () => {
      setLoading(true)
      setError('')
      setBetaLoading(true)
      setBetaError('')
      setDiversificationLoading(true)
      setDiversificationError('')

      try {
        const [sectorsResult, betaResult, diversificationResult] = await Promise.allSettled([
          api.get('/api/analytics/sectors'),
          api.get('/api/analytics/beta'),
          api.get('/api/analytics/diversification'),
        ])

        if (isMounted && sectorsResult.status === 'fulfilled') {
          const payload = sectorsResult.value?.data
          const data = Array.isArray(payload) ? payload : payload?.sectors
          const normalized = Array.isArray(data) ? data.map(normalizeRow) : []
          setRows(normalized)
        }

        if (isMounted && sectorsResult.status === 'rejected') {
          setError('Unable to load sector analytics right now.')
          setRows([])
        }

        if (isMounted && betaResult.status === 'fulfilled') {
          const payload = betaResult.value?.data || {}
          console.log('Beta analytics payload:', payload)
          const portfolioBeta = Number(payload?.portfolioBeta ?? payload?.beta ?? 0)
          const perStockRaw = Array.isArray(payload?.perStock)
            ? payload.perStock
            : Array.isArray(payload?.stocks)
              ? payload.stocks
              : payload?.holdings
          const perStock = Array.isArray(perStockRaw) ? perStockRaw.map(normalizeStockBetaRow) : []
          const riskLabel = payload?.riskLabel || payload?.label || getRiskLabel(portfolioBeta)

          const nextBetaData = {
            portfolioBeta: Number.isFinite(portfolioBeta) ? Number(portfolioBeta.toFixed(2)) : 0,
            riskLabel,
            perStock,
          }

          console.log('Normalized betaData:', nextBetaData)
          setBetaData(nextBetaData)
        }

        if (isMounted && betaResult.status === 'rejected') {
          setBetaError('Unable to load portfolio beta right now.')
          setBetaData({ portfolioBeta: 0, riskLabel: 'Moderate', perStock: [] })
        }

        if (isMounted && diversificationResult.status === 'fulfilled') {
          const payload = diversificationResult.value?.data || {}
          setDiversificationData(normalizeDiversification(payload))
        }

        if (isMounted && diversificationResult.status === 'rejected') {
          setDiversificationError('Unable to load diversification score right now.')
          setDiversificationData({
            score: 0,
            verdict: 'Moderate',
            sectorScore: 0,
            sizeScore: 0,
            correlationScore: 0,
          })
        }
      } finally {
        if (isMounted) {
          setLoading(false)
          setBetaLoading(false)
          setDiversificationLoading(false)
        }
      }
    }

    fetchAnalytics()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth)
      setIsMobile(window.innerWidth < 768)
    }

    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const overweightSectors = useMemo(() => rows.filter((row) => row.isOverweight), [rows])

  const chartData = useMemo(
    () =>
      rows.map((row) => ({
        name: row.sector,
        value: row.weight,
      })),
    [rows],
  )

  const mobilePieChartSize = Math.max(240, Math.min(300, viewportWidth - 72))
  const pieChartSize = isMobile ? mobilePieChartSize : 400
  const pieOuterRadius = isMobile ? Math.max(78, Math.round(pieChartSize * 0.32)) : 130

  return (
    <div style={shellStyle}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700&family=DM+Sans:wght@400;500;700&display=swap');

        .analytics-stat-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
        }

        .analytics-spin {
          animation: analytics-spin 0.9s linear infinite;
        }

        @keyframes analytics-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (min-width: 768px) {
          .analytics-stat-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>

      <div style={containerStyle}>
        <section style={{ ...cardStyle, padding: '1.25rem' }}>
          <h2 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.25rem', color: '#f8fafc' }}>Sector Pie Chart</h2>

          {loading ? (
            <div style={{ minHeight: '410px', display: 'grid', placeItems: 'center' }}>
              <div style={{ display: 'grid', justifyItems: 'center', gap: '0.7rem' }}>
                <div className='analytics-spin' style={spinnerStyle} aria-label='Loading analytics' />
                <p style={{ margin: 0, color: '#94a3b8' }}>Fetching market data...</p>
              </div>
            </div>
          ) : error ? (
            <p style={{ margin: 0, color: '#fca5a5' }}>{error}</p>
          ) : rows.length === 0 ? (
            <p style={{ margin: 0, color: '#94a3b8' }}>Add holdings to see analytics</p>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: `${pieChartSize}px`, maxWidth: '100%' }}>
                <PieChart width={pieChartSize} height={pieChartSize}>
                  <Pie
                    data={chartData}
                    dataKey='value'
                    nameKey='name'
                    cx='50%'
                    cy='50%'
                    outerRadius={pieOuterRadius}
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`${entry.name}-${index}`} fill={SLICE_COLORS[index % SLICE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [`${formatWeight(value)}%`, 'Weight']}
                    contentStyle={{
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '0.65rem',
                      backgroundColor: '#111827',
                      color: '#f8fafc',
                    }}
                  />
                </PieChart>
              </div>
            </div>
          )}
        </section>

        <div className='analytics-stat-grid'>
          <section
            className='rounded-2xl border border-white/8 bg-slate-900/60 p-6'
            style={{
              borderRadius: '1rem',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              padding: '1.5rem',
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: '0.75rem', color: '#f8fafc' }}>Portfolio Beta</h3>

          {betaLoading ? (
            <p style={{ margin: 0, color: '#94a3b8' }}>Loading portfolio beta...</p>
          ) : betaError ? (
            <p style={{ margin: 0, color: '#fca5a5' }}>{betaError}</p>
          ) : (
            <>
              <p style={{ margin: 0, ...numberStyle, fontSize: '3rem', lineHeight: 1, color: '#f8fafc' }}>
                {betaData.portfolioBeta}
              </p>
              <p style={{ margin: '0.35rem 0 1rem', color: getRiskColor(betaData.riskLabel), fontWeight: 600 }}>
                {betaData.riskLabel}
              </p>

              {console.log('Portfolio Beta render perStock count (expected 5):', betaData.perStock?.length, betaData.perStock)}

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '420px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.25)' }}>
                      <th style={{ textAlign: 'left', padding: '0.65rem 0.75rem', color: '#cbd5e1', fontWeight: 600 }}>
                        Ticker
                      </th>
                      <th style={{ textAlign: 'right', padding: '0.65rem 0.75rem', color: '#cbd5e1', fontWeight: 600 }}>
                        Beta
                      </th>
                      <th style={{ textAlign: 'right', padding: '0.65rem 0.75rem', color: '#cbd5e1', fontWeight: 600 }}>
                        Weight %
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {betaData.perStock.map((row) => (
                      <tr key={`beta-${row.ticker}`} style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.12)' }}>
                        <td style={{ padding: '0.7rem 0.75rem', color: '#f8fafc' }}>{row.ticker}</td>
                        <td style={{ padding: '0.7rem 0.75rem', textAlign: 'right', ...numberStyle }}>{row.beta}</td>
                        <td style={{ padding: '0.7rem 0.75rem', textAlign: 'right', ...numberStyle }}>{row.weight}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          </section>

          <section
            className='rounded-2xl border border-white/8 bg-slate-900/60 p-6'
            style={{
              borderRadius: '1rem',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              padding: '1.5rem',
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: '0.75rem', color: '#f8fafc' }}>Diversification Score</h3>

          {diversificationLoading ? (
            <p style={{ margin: 0, color: '#94a3b8' }}>Loading diversification score...</p>
          ) : diversificationError ? (
            <p style={{ margin: 0, color: '#fca5a5' }}>{diversificationError}</p>
          ) : (
            <>
              <p style={{ margin: 0, ...numberStyle, fontSize: '3rem', lineHeight: 1, color: '#f97316' }}>
                {diversificationData.score}/10
              </p>
              <p style={{ margin: '0.35rem 0 1rem', color: '#cbd5e1', fontWeight: 600 }}>{diversificationData.verdict}</p>

              <div style={{ display: 'grid', gap: '0.9rem' }}>
                <div style={{ display: 'grid', gap: '0.35rem' }}>
                  <p style={{ margin: 0, color: '#cbd5e1' }}>Sector Score: {diversificationData.sectorScore}/10</p>
                  <div style={scoreBarTrackStyle}>
                    <div style={scoreBarFill(diversificationData.sectorScore, '#f97316')} />
                  </div>
                </div>

                <div style={{ display: 'grid', gap: '0.35rem' }}>
                  <p style={{ margin: 0, color: '#cbd5e1' }}>Size Score: {diversificationData.sizeScore}/10</p>
                  <div style={scoreBarTrackStyle}>
                    <div style={scoreBarFill(diversificationData.sizeScore, '#3b82f6')} />
                  </div>
                </div>

                <div style={{ display: 'grid', gap: '0.35rem' }}>
                  <p style={{ margin: 0, color: '#cbd5e1' }}>
                    Correlation Score: {diversificationData.correlationScore}/10
                  </p>
                  <div style={scoreBarTrackStyle}>
                    <div style={scoreBarFill(diversificationData.correlationScore, '#22c55e')} />
                  </div>
                </div>
              </div>
            </>
          )}
          </section>
        </div>

        {!loading && overweightSectors.length > 0 && (
          <section style={{ display: 'grid', gap: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#f8fafc' }}>Concentration Warning</h3>
            {overweightSectors.map((sectorRow) => (
              <div
                key={`warning-${sectorRow.sector}`}
                className='rounded-2xl border border-orange-500/40 bg-orange-500/10 p-4'
                style={{
                  borderRadius: '1rem',
                  border: '1px solid rgba(249, 115, 22, 0.4)',
                  backgroundColor: 'rgba(249, 115, 22, 0.1)',
                  padding: '1rem',
                }}
              >
                <p style={{ margin: 0, color: '#fed7aa' }}>
                  ⚠️ {sectorRow.sector} is <span style={numberStyle}>{formatWeight(sectorRow.weight)}%</span> of your
                  portfolio — consider diversifying
                </p>
              </div>
            ))}
          </section>
        )}

        <section style={{ ...cardStyle, padding: '1rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '0.75rem', color: '#f8fafc' }}>Sector Breakdown</h3>

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div className='analytics-spin' style={spinnerStyle} aria-label='Loading analytics table' />
              <p style={{ margin: 0, color: '#94a3b8' }}>Fetching market data...</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.25)' }}>
                    <th style={{ textAlign: 'left', padding: '0.7rem 0.75rem', color: '#cbd5e1', fontWeight: 600 }}>
                      Sector
                    </th>
                    <th style={{ textAlign: 'left', padding: '0.7rem 0.75rem', color: '#cbd5e1', fontWeight: 600 }}>
                      Tickers
                    </th>
                    <th style={{ textAlign: 'right', padding: '0.7rem 0.75rem', color: '#cbd5e1', fontWeight: 600 }}>
                      Value (₹)
                    </th>
                    <th style={{ textAlign: 'right', padding: '0.7rem 0.75rem', color: '#cbd5e1', fontWeight: 600 }}>
                      Weight (%)
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ padding: '1rem 0.75rem', color: '#94a3b8' }}>
                        Add holdings to see analytics
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr
                        key={`row-${row.sector}`}
                        style={{
                          borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
                          borderLeft: row.isOverweight ? '4px solid #f97316' : '4px solid transparent',
                        }}
                      >
                        <td style={{ padding: '0.75rem', color: '#f8fafc' }}>{row.sector}</td>
                        <td style={{ padding: '0.75rem', color: '#cbd5e1' }}>{row.tickers || '-'}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', ...numberStyle }}>{formatCurrency(row.value)}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', ...numberStyle }}>{formatWeight(row.weight)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default AnalyticsPage
