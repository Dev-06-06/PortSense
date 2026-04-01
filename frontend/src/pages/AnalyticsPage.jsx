import { useEffect, useMemo, useState } from 'react'
import { Cell, Pie, PieChart, Tooltip } from 'recharts'
import api from '../services/api'

const SLICE_COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#f59e0b', '#06b6d4']

const shellStyle = {
  minHeight: '100vh',
  backgroundColor: '#0d1117',
  color: '#e5e7eb',
  fontFamily: "'DM Sans', sans-serif",
  padding: '1.25rem 1rem 2rem',
}

const containerStyle = {
  width: '100%',
  maxWidth: '52rem',
  margin: '0 auto',
  display: 'grid',
  gap: '1rem',
}

const cardStyle = {
  borderRadius: '1rem',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  backgroundColor: 'rgba(15, 23, 42, 0.6)',
  backdropFilter: 'blur(8px)',
  padding: '1.25rem',
}

const sectionTitleStyle = {
  margin: '0 0 0.75rem',
  fontSize: '1.1rem',
  fontWeight: 700,
  color: '#f8fafc',
}

const labelStyle = {
  margin: 0,
  fontSize: '0.8rem',
  color: '#94a3b8',
  marginBottom: '0.25rem',
}

const numberStyle = {
  fontFamily: "'Barlow Condensed', 'DM Sans', sans-serif",
  letterSpacing: '0.02em',
}

const bigNumberStyle = {
  ...numberStyle,
  fontSize: '2.2rem',
  fontWeight: 700,
  margin: '0 0 0.15rem',
  color: '#f97316',
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.82rem',
}

const thStyle = {
  textAlign: 'left',
  padding: '0.5rem 0.4rem',
  color: '#94a3b8',
  fontWeight: 600,
  borderBottom: '1px solid rgba(255,255,255,0.08)',
}

const tdStyle = {
  padding: '0.6rem 0.4rem',
  color: '#e2e8f0',
  borderBottom: '1px solid rgba(255,255,255,0.05)',
}

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)

const formatPercent = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '0.00%'
  return `${numeric.toFixed(2)}%`
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

const AnalyticsPage = () => {
  // STATE
  const [sectors, setSectors] = useState([])
  const [beta, setBeta] = useState(null)
  const [diversification, setDiversification] = useState(null)
  const [benchmark, setBenchmark] = useState(null)
  const [loadingSectors, setLoadingSectors] = useState(true)
  const [loadingBeta, setLoadingBeta] = useState(true)
  const [loadingDiv, setLoadingDiv] = useState(true)
  const [loadingBench, setLoadingBench] = useState(true)
  const [stressData, setStressData] = useState(null)
  const [loadingStress, setLoadingStress] = useState(true)
  const [riskData, setRiskData] = useState(null)
  const [loadingRisk, setLoadingRisk] = useState(true)
  const [customShock, setCustomShock] = useState('')
  const [runningCustom, setRunningCustom] = useState(false)
  const [error, setError] = useState(null)
  const [adviceText, setAdviceText] = useState('')
  const [adviceLoading, setAdviceLoading] = useState(false)
  const [adviceError, setAdviceError] = useState('')

  // Parse advice text
  const parsedAdvice = useMemo(() => parseAdvice(adviceText), [adviceText])

  // Fetch rebalancing advice
  const onGetAdvice = async () => {
    setAdviceLoading(true)
    setAdviceError('')
    try {
      const res = await api.post('/api/genai/rebalance')
      const text = res?.data?.advice
      setAdviceText(typeof text === 'string' ? text.trim() : '')
    } catch {
      setAdviceError('Unable to generate rebalancing advice right now.')
      setAdviceText('')
    } finally {
      setAdviceLoading(false)
    }
  }

  const onRunCustomStress = async () => {
    const shock = parseFloat(customShock)
    if (!shock || shock >= 0 || shock < -100) return
    setRunningCustom(true)
    try {
      const res = await api.get(`/api/analytics/stress-test?custom_shock=${shock / 100}`)
      setStressData(res.data)
    } catch {
      // keep existing data
    } finally {
      setRunningCustom(false)
    }
  }

  // Initial fetch - all endpoints in parallel
  useEffect(() => {
    document.title = 'Analytics | PortSense'

    const fetchAll = async () => {
      try {
        const [sectorsRes, betaRes, divRes, benchRes, stressRes, riskRes] = await Promise.allSettled([
          api.get('/api/analytics/sectors').finally(() => setLoadingSectors(false)),
          api.get('/api/analytics/beta').finally(() => setLoadingBeta(false)),
          api.get('/api/analytics/diversification').finally(() => setLoadingDiv(false)),
          api.get('/api/analytics/benchmark').finally(() => setLoadingBench(false)),
          api.get('/api/analytics/stress-test').finally(() => setLoadingStress(false)),
          api.get('/api/analytics/risk-decomposition').finally(() => setLoadingRisk(false)),
        ])

        if (sectorsRes.status === 'fulfilled') {
          setSectors(sectorsRes.value.data.sectors || [])
        }
        if (betaRes.status === 'fulfilled') {
          setBeta(betaRes.value.data)
        }
        if (divRes.status === 'fulfilled') {
          setDiversification(divRes.value.data)
        }
        if (benchRes.status === 'fulfilled') {
          setBenchmark(benchRes.value.data)
        }
        if (stressRes.status === 'fulfilled') setStressData(stressRes.value.data)
        if (riskRes.status === 'fulfilled') setRiskData(riskRes.value.data)
      } catch (e) {
        setError('Failed to load analytics')
      }
    }
    fetchAll()
  }, [])

  return (
    <div style={shellStyle}>
      <style>{`
        .analytics-spin { animation: analytics-spin 0.9s linear infinite; }
        @keyframes analytics-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div style={containerStyle}>
        {/* ========== 1. SECTOR BREAKDOWN ========== */}
        {sectors && (
          <div style={cardStyle}>
            <h2 style={sectionTitleStyle}>Sector Breakdown</h2>

            {loadingSectors ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', padding: '2rem 0' }}>
                <div
                  className="analytics-spin"
                  style={{
                    width: '1.5rem',
                    height: '1.5rem',
                    borderRadius: '999px',
                    border: '3px solid #475569',
                    borderTopColor: '#f97316',
                  }}
                />
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.88rem' }}>Loading sectors...</p>
              </div>
            ) : error ? (
              <p style={{ margin: 0, color: '#f87171', fontSize: '0.88rem' }}>{error}</p>
            ) : sectors.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.88rem' }}>Add stocks from the Dashboard to see sector breakdown.</p>
              </div>
            ) : (
              <>
                {/* Pie Chart */}
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                  <PieChart width={300} height={300}>
                    <Pie
                      data={sectors.map((s) => ({ name: s.name || s.sector, value: s.weight || s.percentage }))}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                    >
                      {sectors.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={SLICE_COLORS[index % SLICE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => [`${Number(value).toFixed(2)}%`, 'Weight']}
                      contentStyle={{
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '0.65rem',
                        backgroundColor: '#111827',
                        color: '#f8fafc',
                      }}
                    />
                  </PieChart>
                </div>

                {/* Concentration Warnings */}
                {sectors.filter((s) => s.isOverweight).length > 0 && (
                  <div style={{ marginTop: '1rem', display: 'grid', gap: '0.5rem' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700 }}>CONCENTRATION WARNING</p>
                    {sectors
                      .filter((s) => s.isOverweight)
                      .map((s, idx) => (
                        <div key={idx} style={{ borderRadius: '0.75rem', border: '1px solid rgba(249,115,22,0.4)', backgroundColor: 'rgba(249,115,22,0.1)', padding: '0.75rem' }}>
                          <p style={{ margin: 0, fontSize: '0.75rem', color: '#fdba74' }}>
                            ⚠️ {s.name || s.sector} is {Number(s.weight || s.percentage).toFixed(2)}% of portfolio
                          </p>
                        </div>
                      ))}
                  </div>
                )}

                {/* Sector Table */}
                <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Sector</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Weight %</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Value ₹</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sectors.map((s, idx) => (
                        <tr key={idx}>
                          <td style={{ ...tdStyle, color: '#f8fafc' }}>{s.name || s.sector}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{Number(s.weight || s.percentage).toFixed(2)}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(s.value || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ========== 2. BETA ANALYSIS ========== */}
        {beta && (
          <div style={cardStyle}>
            <h2 style={sectionTitleStyle}>Beta Analysis</h2>

            {loadingBeta ? (
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.88rem' }}>Loading beta...</p>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '1rem' }}>
                  <p style={{ ...bigNumberStyle, color: '#f8fafc' }}>{Number(beta.portfolioBeta || 0).toFixed(2)}</p>
                  <p style={{ margin: 0, fontSize: '0.88rem', color: '#f97316' }}>Portfolio Beta</p>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Ticker</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Beta</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Weight %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(beta.perStock || []).map((stock, idx) => (
                        <tr key={idx}>
                          <td style={{ ...tdStyle, color: '#f8fafc' }}>{stock.ticker}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{Number(stock.beta || 0).toFixed(2)}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{Number(stock.weight || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ========== 3. DIVERSIFICATION SCORE ========== */}
        {diversification && (
          <div style={cardStyle}>
            <h2 style={sectionTitleStyle}>Diversification Score</h2>

            {loadingDiv ? (
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.88rem' }}>Loading diversification...</p>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '1rem' }}>
                  <p style={bigNumberStyle}>{Number(diversification.score || 0).toFixed(1)}</p>
                  <p style={{ margin: 0, fontSize: '0.88rem', color: '#94a3b8' }}>/10</p>
                </div>
                <p style={{ margin: '0 0 1rem', fontSize: '0.88rem', color: '#cbd5e1' }}>{diversification.verdict || 'Moderate'}</p>

                {/* Sub-score progress bars */}
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {/* Sector Score */}
                  <div>
                    <p style={labelStyle}>Sector Score: {Number(diversification.sectorScore || 0).toFixed(1)}/10</p>
                    <div style={{ height: '6px', backgroundColor: '#1e293b', borderRadius: '999px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          borderRadius: '999px',
                          width: `${Math.min(100, ((Number(diversification.sectorScore) || 0) / 10) * 100)}%`,
                          backgroundColor: '#f97316',
                        }}
                      />
                    </div>
                  </div>

                  {/* Size Score */}
                  <div>
                    <p style={labelStyle}>Size Score: {Number(diversification.sizeScore || 0).toFixed(1)}/10</p>
                    <div style={{ height: '6px', backgroundColor: '#1e293b', borderRadius: '999px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          borderRadius: '999px',
                          width: `${Math.min(100, ((Number(diversification.sizeScore) || 0) / 10) * 100)}%`,
                          backgroundColor: '#f97316',
                        }}
                      />
                    </div>
                  </div>

                  {/* Correlation Score */}
                  <div>
                    <p style={labelStyle}>Correlation Score: {Number(diversification.correlationScore || 0).toFixed(1)}/10</p>
                    <div style={{ height: '6px', backgroundColor: '#1e293b', borderRadius: '999px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          borderRadius: '999px',
                          width: `${Math.min(100, ((Number(diversification.correlationScore) || 0) / 10) * 100)}%`,
                          backgroundColor: '#f97316',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ========== 4. BENCHMARK VS NIFTY 50 ========== */}
        {benchmark && (
          <div style={cardStyle}>
            <h2 style={sectionTitleStyle}>Benchmark vs Nifty 50</h2>

            {loadingBench ? (
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.88rem' }}>Loading benchmark...</p>
            ) : (
              <>
                {/* Verdict */}
                <div
                  style={{
                    borderRadius: '0.75rem',
                    padding: '0.75rem',
                    marginBottom: '1rem',
                    border: benchmark.outperforming
                      ? '1px solid rgba(34,197,94,0.4)'
                      : '1px solid rgba(239,68,68,0.4)',
                    backgroundColor: benchmark.outperforming
                      ? 'rgba(34,197,94,0.1)'
                      : 'rgba(239,68,68,0.1)',
                  }}
                >
                  <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600, color: benchmark.outperforming ? '#4ade80' : '#f87171' }}>
                    {benchmark.verdict || 'Benchmark comparison unavailable'}
                  </p>
                </div>

                {/* CAGR Comparison */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div
                    style={{
                      borderRadius: '0.75rem',
                      border: '1px solid rgba(255,255,255,0.1)',
                      backgroundColor: 'rgba(30,41,59,0.3)',
                      padding: '0.75rem',
                    }}
                  >
                    <p style={labelStyle}>Your Portfolio</p>
                    <p style={{ ...numberStyle, margin: '0 0 0.15rem', fontSize: '1.75rem', fontWeight: 700, color: '#f97316' }}>{formatPercent(benchmark.userCAGR || 0)}</p>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>CAGR</p>
                  </div>
                  <div
                    style={{
                      borderRadius: '0.75rem',
                      border: '1px solid rgba(255,255,255,0.1)',
                      backgroundColor: 'rgba(30,41,59,0.3)',
                      padding: '0.75rem',
                    }}
                  >
                    <p style={labelStyle}>Nifty 50</p>
                    <p style={{ ...numberStyle, margin: '0 0 0.15rem', fontSize: '1.75rem', fontWeight: 700, color: '#60a5fa' }}>{formatPercent(benchmark.niftyCAGR || 0)}</p>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>CAGR</p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ========== 5. STRESS TEST ========== */}
        <div style={cardStyle}>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
            Stress Test
          </h2>
          <p style={{ margin: '0 0 1rem', color: '#94a3b8', fontSize: '0.85rem' }}>
            Estimated portfolio impact under market scenarios
          </p>

          {loadingStress ? (
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.88rem' }}>Running scenarios...</p>
          ) : (
            <>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {(stressData?.scenarios || []).filter((s) => s.id !== 'custom').map((scenario) => {
                  const isLoss = scenario.total_portfolio_loss < 0
                  return (
                    <div
                      key={scenario.id}
                      style={{
                        borderRadius: '0.75rem',
                        border: '1px solid rgba(255,255,255,0.1)',
                        backgroundColor: 'rgba(30,41,59,0.3)',
                        padding: '0.75rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                        <div>
                          <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc' }}>
                            {scenario.name}
                          </p>
                          <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                            {scenario.description}
                          </p>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <p style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: isLoss ? '#f87171' : '#4ade80' }}>
                            {scenario.total_portfolio_loss_pct > 0 ? '+' : ''}{scenario.total_portfolio_loss_pct}%
                          </p>
                          <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#cbd5e1' }}>
                            {isLoss ? '−' : '+'}₹{Math.abs(scenario.total_portfolio_loss).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <input
                  type="number"
                  placeholder="Custom shock (e.g., -12)"
                  value={customShock}
                  onChange={(e) => setCustomShock(e.target.value)}
                  style={{
                    flex: 1,
                    backgroundColor: '#0f172a',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '0.75rem',
                    padding: '0.6rem 0.85rem',
                    color: '#e5e7eb',
                    fontSize: '0.9rem',
                  }}
                />
                <button
                  type="button"
                  onClick={onRunCustomStress}
                  disabled={runningCustom}
                  style={{
                    border: 'none',
                    borderRadius: '0.75rem',
                    backgroundColor: '#f97316',
                    color: '#fff',
                    padding: '0.6rem 0.9rem',
                    fontWeight: 700,
                    cursor: runningCustom ? 'not-allowed' : 'pointer',
                    opacity: runningCustom ? 0.85 : 1,
                  }}
                >
                  {runningCustom ? 'Running...' : 'Run Custom'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* ========== 6. RISK DECOMPOSITION ========== */}
        <div style={cardStyle}>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
            Portfolio Risk Decomposition
          </h2>
          <p style={{ margin: '0 0 1rem', color: '#94a3b8', fontSize: '0.85rem' }}>
            What is driving your portfolio's volatility?
          </p>

          {loadingRisk ? (
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.88rem' }}>Calculating risk components...</p>
          ) : !riskData || riskData.systematic_pct === null ? (
            <div
              style={{
                borderRadius: '0.75rem',
                border: '1px solid rgba(248,113,113,0.35)',
                backgroundColor: 'rgba(127,29,29,0.2)',
                padding: '0.85rem',
              }}
            >
              <p style={{ margin: 0, color: '#fca5a5', fontSize: '0.88rem' }}>
                {riskData?.verdict || 'Risk decomposition is unavailable right now.'}
              </p>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.85rem' }}>
                <div
                  style={{
                    borderRadius: '0.75rem',
                    border: '1px solid rgba(255,255,255,0.1)',
                    backgroundColor: 'rgba(30,41,59,0.3)',
                    padding: '0.75rem',
                  }}
                >
                  <p style={labelStyle}>Portfolio Volatility</p>
                  <p style={{ ...numberStyle, margin: 0, fontSize: '1.55rem', fontWeight: 700, color: '#f97316' }}>
                    {formatPercent(riskData.portfolio_vol_pct || 0)}
                  </p>
                </div>
                <div
                  style={{
                    borderRadius: '0.75rem',
                    border: '1px solid rgba(255,255,255,0.1)',
                    backgroundColor: 'rgba(30,41,59,0.3)',
                    padding: '0.75rem',
                  }}
                >
                  <p style={labelStyle}>Systematic Risk</p>
                  <p style={{ ...numberStyle, margin: 0, fontSize: '1.55rem', fontWeight: 700, color: '#60a5fa' }}>
                    {formatPercent(riskData.systematic_pct || 0)}
                  </p>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <div>
                  <p style={labelStyle}>Systematic (Market)</p>
                  <div style={{ height: '7px', backgroundColor: '#1e293b', borderRadius: '999px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        borderRadius: '999px',
                        width: `${Math.min(100, Number(riskData.systematic_pct) || 0)}%`,
                        backgroundColor: '#60a5fa',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <p style={labelStyle}>Sector Concentration</p>
                  <div style={{ height: '7px', backgroundColor: '#1e293b', borderRadius: '999px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        borderRadius: '999px',
                        width: `${Math.min(100, Number(riskData.sector_concentration_pct) || 0)}%`,
                        backgroundColor: '#f59e0b',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <p style={labelStyle}>Idiosyncratic (Stock-Specific)</p>
                  <div style={{ height: '7px', backgroundColor: '#1e293b', borderRadius: '999px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        borderRadius: '999px',
                        width: `${Math.min(100, Number(riskData.idiosyncratic_pct) || 0)}%`,
                        backgroundColor: '#34d399',
                      }}
                    />
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: '0.85rem',
                  borderRadius: '0.75rem',
                  border: '1px solid rgba(56,189,248,0.35)',
                  backgroundColor: 'rgba(14,116,144,0.15)',
                  padding: '0.8rem',
                }}
              >
                <p style={{ margin: 0, color: '#bae6fd', fontSize: '0.86rem', lineHeight: 1.5 }}>
                  {riskData.verdict || 'Risk decomposition calculated successfully.'}
                </p>
              </div>
            </>
          )}
        </div>

        {/* ========== 7. REBALANCING ADVISOR ========== */}
        <div style={{ borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)', padding: '1.25rem' }}>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
            Rebalancing Advisor
          </h2>
          <p style={{ margin: '0 0 1rem', color: '#94a3b8', fontSize: '0.85rem' }}>
            AI-powered advice grounded in your actual portfolio data
          </p>

          <button
            type="button"
            onClick={onGetAdvice}
            disabled={adviceLoading}
            style={{
              width: '100%',
              border: 'none',
              borderRadius: '0.85rem',
              backgroundColor: adviceLoading ? '#ea580c' : '#f97316',
              color: '#ffffff',
              padding: '0.85rem 1rem',
              fontWeight: 900,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: adviceLoading ? 'not-allowed' : 'pointer',
              opacity: adviceLoading ? 0.85 : 1,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '0.9rem',
            }}
          >
            {adviceLoading ? 'Analysing...' : 'Get Rebalancing Advice'}
          </button>

          <p style={{ margin: '0.5rem 0 0', color: '#6b7280', fontSize: '0.75rem' }}>
            This is AI-generated analysis, not financial advice
          </p>

          {adviceError && (
            <p style={{ margin: '0.75rem 0 0', color: '#fca5a5', fontSize: '0.875rem' }}>{adviceError}</p>
          )}

          {!adviceLoading && adviceText && (
            <div style={{ marginTop: '1rem', borderRadius: '0.85rem', border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(2,6,23,0.55)', padding: '1rem', display: 'grid', gap: '0.85rem' }}>
              <div style={{ display: 'grid', gap: '0.3rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#22c55e' }}>What You Did Well</h3>
                <p style={{ margin: 0, color: '#ffffff', fontSize: '0.95rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: "'DM Sans', sans-serif" }}>
                  {parsedAdvice.well || 'No details provided.'}
                </p>
              </div>
              <div style={{ display: 'grid', gap: '0.3rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#ef4444' }}>Key Risks</h3>
                <p style={{ margin: 0, color: '#ffffff', fontSize: '0.95rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: "'DM Sans', sans-serif" }}>
                  {parsedAdvice.risks || 'No details provided.'}
                </p>
              </div>
              <div style={{ display: 'grid', gap: '0.3rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#f97316' }}>Rebalancing Steps</h3>
                <p style={{ margin: 0, color: '#ffffff', fontSize: '0.95rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: "'DM Sans', sans-serif" }}>
                  {parsedAdvice.steps || 'No details provided.'}
                </p>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

export default AnalyticsPage
