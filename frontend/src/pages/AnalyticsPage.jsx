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

const AnalyticsPage = () => {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    const fetchAnalytics = async () => {
      setLoading(true)
      setError('')

      try {
        const response = await api.get('/api/analytics/sectors')
        const payload = response?.data
        const data = Array.isArray(payload) ? payload : payload?.sectors
        const normalized = Array.isArray(data) ? data.map(normalizeRow) : []

        if (isMounted) {
          setRows(normalized)
        }
      } catch {
        if (isMounted) {
          setError('Unable to load sector analytics right now.')
          setRows([])
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchAnalytics()

    return () => {
      isMounted = false
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

  return (
    <div style={shellStyle}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700&family=DM+Sans:wght@400;500;700&display=swap');

        .analytics-spin {
          animation: analytics-spin 0.9s linear infinite;
        }

        @keyframes analytics-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div style={containerStyle}>
        <section style={{ ...cardStyle, padding: '1.25rem' }}>
          <h2 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.25rem', color: '#f8fafc' }}>Sector Pie Chart</h2>

          {loading ? (
            <div style={{ minHeight: '410px', display: 'grid', placeItems: 'center' }}>
              <div className='analytics-spin' style={spinnerStyle} aria-label='Loading analytics' />
            </div>
          ) : error ? (
            <p style={{ margin: 0, color: '#fca5a5' }}>{error}</p>
          ) : rows.length === 0 ? (
            <p style={{ margin: 0, color: '#94a3b8' }}>No sector data available yet.</p>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: '400px', maxWidth: '100%' }}>
                <PieChart width={400} height={400}>
                  <Pie
                    data={chartData}
                    dataKey='value'
                    nameKey='name'
                    cx='50%'
                    cy='50%'
                    outerRadius={130}
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
            <p style={{ margin: 0, color: '#94a3b8' }}>Fetching table data...</p>
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
                        No sector rows to display.
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
