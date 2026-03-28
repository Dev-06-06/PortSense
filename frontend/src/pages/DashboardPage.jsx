import { useEffect, useMemo, useState } from 'react'
import api from '../services/api'

const shellStyle = {
  minHeight: '100vh',
  backgroundColor: '#0d1117',
  color: '#e5e7eb',
  fontFamily: "'DM Sans', sans-serif",
  padding: '1.25rem',
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

const buttonBaseStyle = {
  border: 'none',
  borderRadius: '0.75rem',
  padding: '0.7rem 1rem',
  color: '#ffffff',
  fontWeight: 700,
  cursor: 'pointer',
}

const inputStyle = {
  width: '100%',
  border: '1px solid rgba(255, 255, 255, 0.18)',
  backgroundColor: '#0f172a',
  color: '#e5e7eb',
  borderRadius: '0.75rem',
  padding: '0.7rem 0.8rem',
  boxSizing: 'border-box',
}

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)

const formatNumber = (value) =>
  new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)

const DashboardPage = () => {
  const [holdings, setHoldings] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({
    ticker: '',
    buyDate: '',
    buyPrice: '',
    quantity: '',
  })

  const fetchHoldings = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await api.get('/api/holdings')
      setHoldings(Array.isArray(response.data) ? response.data : [])
    } catch {
      setError('Unable to load holdings. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    document.title = 'Dashboard | PortSense'
  }, [])

  useEffect(() => {
    fetchHoldings()
  }, [])

  const summary = useMemo(() => {
    return holdings.reduce(
      (acc, holding) => {
        const invested = Number(holding.invested) || (Number(holding.buyPrice) || 0) * (Number(holding.quantity) || 0)
        const currentValue =
          Number(holding.currentValue) || (Number(holding.currentPrice) || 0) * (Number(holding.quantity) || 0)
        const pnl = Number(holding.pnl) || currentValue - invested

        return {
          totalInvested: acc.totalInvested + invested,
          totalCurrentValue: acc.totalCurrentValue + currentValue,
          totalPnl: acc.totalPnl + pnl,
        }
      },
      {
        totalInvested: 0,
        totalCurrentValue: 0,
        totalPnl: 0,
      },
    )
  }, [holdings])

  const onChangeForm = (event) => {
    const { name, value } = event.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const onSubmitHolding = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      await api.post('/api/holdings', {
        ticker: formData.ticker.trim(),
        buyDate: formData.buyDate,
        buyPrice: Number(formData.buyPrice),
        quantity: Number(formData.quantity),
      })

      setFormData({
        ticker: '',
        buyDate: '',
        buyPrice: '',
        quantity: '',
      })
      setShowAddForm(false)
      await fetchHoldings()
    } catch (requestError) {
      const message = requestError?.response?.data?.detail || 'Unable to add holding. Check your values and try again.'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const onDeleteHolding = async (holdingId) => {
    setError('')

    try {
      await api.delete(`/api/holdings/${holdingId}`)
      await fetchHoldings()
    } catch {
      setError('Unable to delete holding. Please try again.')
    }
  }

  return (
    <div style={shellStyle}>
      <style>{`
        .loader-spin {
          animation: spin 0.9s linear infinite;
        }

        .summary-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.75rem;
        }

        .add-holding-form {
          grid-template-columns: 1fr;
          width: 100%;
        }

        .mobile-hide-col {
          display: none;
        }

        .holdings-table {
          min-width: 560px;
        }

        .animate-pulse {
          animation: dashboard-pulse 1.4s ease-in-out infinite;
        }

        @keyframes dashboard-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (min-width: 768px) {
          .summary-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .add-holding-form {
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          }

          .mobile-hide-col {
            display: table-cell;
          }

          .holdings-table {
            min-width: 840px;
          }
        }
      `}</style>

      <div style={containerStyle}>
        <div style={{ ...cardStyle, padding: '1rem' }}>
          <div
            className='summary-grid'
          >
            <div>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>Total Invested</p>
              <p style={{ ...numberStyle, margin: '0.25rem 0 0', fontSize: '1.6rem', color: '#f8fafc' }}>
                {formatCurrency(summary.totalInvested)}
              </p>
            </div>

            <div>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>Current Value</p>
              <p style={{ ...numberStyle, margin: '0.25rem 0 0', fontSize: '1.6rem', color: '#f8fafc' }}>
                {formatCurrency(summary.totalCurrentValue)}
              </p>
            </div>

            <div>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>Total P&L</p>
              <p
                style={{
                  ...numberStyle,
                  margin: '0.25rem 0 0',
                  fontSize: '1.6rem',
                  color: summary.totalPnl >= 0 ? '#22c55e' : '#ef4444',
                }}
              >
                {formatCurrency(summary.totalPnl)}
              </p>
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle, padding: '1rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.8rem',
              gap: '0.7rem',
              flexWrap: 'wrap',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#f8fafc' }}>My Holdings</h2>
            <button
              type='button'
              onClick={() => setShowAddForm((prev) => !prev)}
              style={{
                ...buttonBaseStyle,
                backgroundColor: '#f97316',
              }}
            >
              + Add Holding
            </button>
          </div>

          {showAddForm && (
            <form
              onSubmit={onSubmitHolding}
              className='add-holding-form'
              style={{
                display: 'grid',
                gap: '0.7rem',
                marginBottom: '1rem',
              }}
            >
              <input
                name='ticker'
                type='text'
                placeholder='Ticker (e.g. INFY)'
                value={formData.ticker}
                onChange={onChangeForm}
                required
                style={inputStyle}
              />

              <input
                name='buyDate'
                type='date'
                value={formData.buyDate}
                onChange={onChangeForm}
                required
                style={inputStyle}
              />

              <input
                name='buyPrice'
                type='number'
                min='0'
                step='0.01'
                placeholder='Buy Price'
                value={formData.buyPrice}
                onChange={onChangeForm}
                required
                style={inputStyle}
              />

              <input
                name='quantity'
                type='number'
                min='1'
                step='1'
                placeholder='Quantity'
                value={formData.quantity}
                onChange={onChangeForm}
                required
                style={inputStyle}
              />

              <button
                type='submit'
                disabled={submitting}
                style={{
                  ...buttonBaseStyle,
                  backgroundColor: '#f97316',
                }}
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </form>
          )}

          {error && <p style={{ color: '#ef4444', marginTop: 0 }}>{error}</p>}

          {loading ? (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {[1, 2, 3].map((index) => (
                <div
                  key={`skeleton-${index}`}
                  className='animate-pulse'
                  style={{
                    borderRadius: '0.9rem',
                    border: '1px solid rgba(148, 163, 184, 0.25)',
                    backgroundColor: 'rgba(51, 65, 85, 0.35)',
                    padding: '0.9rem',
                    display: 'grid',
                    gap: '0.55rem',
                  }}
                >
                  <div style={{ height: '0.9rem', width: '32%', borderRadius: '0.5rem', backgroundColor: '#475569' }} />
                  <div style={{ height: '0.9rem', width: '56%', borderRadius: '0.5rem', backgroundColor: '#64748b' }} />
                </div>
              ))}
            </div>
          ) : holdings.length === 0 ? (
            <div
              style={{
                display: 'grid',
                placeItems: 'center',
                padding: '2rem 1rem',
              }}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth: '30rem',
                  borderRadius: '1rem',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  backgroundColor: 'rgba(2, 6, 23, 0.55)',
                  padding: '1.3rem 1rem',
                  display: 'grid',
                  justifyItems: 'center',
                  gap: '0.65rem',
                  textAlign: 'center',
                }}
              >
                <p style={{ margin: 0, color: '#ffffff', fontWeight: 700, fontSize: '1.05rem' }}>No holdings yet</p>
                <p style={{ margin: 0, color: '#94a3b8' }}>Add your first stock to get started</p>
                <button
                  type='button'
                  onClick={() => setShowAddForm(true)}
                  style={{
                    ...buttonBaseStyle,
                    backgroundColor: '#f97316',
                    marginTop: '0.2rem',
                  }}
                >
                  + Add Holding
                </button>
              </div>
            </div>
          ) : (
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <table className='holdings-table' style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {[
                      'Ticker',
                      'Qty',
                      'Buy Price',
                      'Current Price',
                      'Invested',
                      'Current Value',
                      'P&L',
                      'P&L%',
                      '',
                    ].map((title) => (
                      <th
                        key={title || 'action'}
                        className={title === 'Invested' || title === 'Current Value' ? 'mobile-hide-col' : ''}
                        style={{
                          textAlign: title === '' ? 'center' : 'left',
                          color: '#94a3b8',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          padding: '0.75rem 0.6rem',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((holding) => {
                    const invested =
                      Number(holding.invested) || (Number(holding.buyPrice) || 0) * (Number(holding.quantity) || 0)
                    const currentValue =
                      Number(holding.currentValue) ||
                      (Number(holding.currentPrice) || 0) * (Number(holding.quantity) || 0)
                    const pnl = Number(holding.pnl) || currentValue - invested
                    const pnlPercent = Number(holding.pnlPercent) || (invested ? (pnl / invested) * 100 : 0)
                    const isPositivePnl = pnl >= 0

                    return (
                      <tr key={holding.id}>
                        <td style={{ padding: '0.8rem 0.6rem', color: '#f8fafc', fontWeight: 700 }}>
                          {holding.ticker}
                        </td>
                        <td style={{ ...numberStyle, padding: '0.8rem 0.6rem' }}>{formatNumber(holding.quantity)}</td>
                        <td style={{ ...numberStyle, padding: '0.8rem 0.6rem' }}>{formatCurrency(holding.buyPrice)}</td>
                        <td style={{ ...numberStyle, padding: '0.8rem 0.6rem' }}>
                          {formatCurrency(holding.currentPrice)}
                        </td>
                        <td className='mobile-hide-col' style={{ ...numberStyle, padding: '0.8rem 0.6rem' }}>
                          {formatCurrency(invested)}
                        </td>
                        <td className='mobile-hide-col' style={{ ...numberStyle, padding: '0.8rem 0.6rem' }}>
                          {formatCurrency(currentValue)}
                        </td>
                        <td
                          style={{
                            ...numberStyle,
                            padding: '0.8rem 0.6rem',
                            color: isPositivePnl ? '#22c55e' : '#ef4444',
                          }}
                        >
                          {formatCurrency(pnl)}
                        </td>
                        <td
                          style={{
                            ...numberStyle,
                            padding: '0.8rem 0.6rem',
                            color: isPositivePnl ? '#22c55e' : '#ef4444',
                          }}
                        >
                          {`${pnlPercent.toFixed(2)}%`}
                        </td>
                        <td style={{ padding: '0.8rem 0.6rem', textAlign: 'center' }}>
                          <button
                            type='button'
                            aria-label={`Delete ${holding.ticker}`}
                            onClick={() => onDeleteHolding(holding.id)}
                            style={{
                              ...buttonBaseStyle,
                              backgroundColor: '#1f2937',
                              border: '1px solid rgba(255, 255, 255, 0.12)',
                              width: '2.25rem',
                              height: '2.25rem',
                              padding: 0,
                              lineHeight: 1,
                            }}
                          >
                            🗑
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
