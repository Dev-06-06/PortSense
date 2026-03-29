import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { prefetchRoute } from '../routes/prefetch'

const features = [
  {
    icon: '📊',
    title: 'Live P&L',
    description: 'Real-time profit and loss for every holding',
  },
  {
    icon: '🔍',
    title: 'Sector Analysis',
    description: 'Spot hidden concentration before it hurts you',
  },
  {
    icon: '🔗',
    title: 'Correlation Heatmap',
    description: 'See which stocks move together',
  },
  {
    icon: '📰',
    title: 'FinBERT Sentiment',
    description: 'NLP on live financial news headlines',
  },
  {
    icon: '📈',
    title: 'Nifty Benchmark',
    description: "Know if you're actually beating the index",
  },
  {
    icon: '🤖',
    title: 'AI Rebalancing',
    description: 'Gemini-powered advice grounded in your data',
  },
]

function LandingPage() {
  useEffect(() => {
    document.title = 'PortSense — Know Your Portfolio'
  }, [])

  return (
    <div style={styles.page}>
      <style>{responsiveCss}</style>

      <main style={styles.main}>
        <section style={styles.hero}>
          <h1 style={styles.heading}>Know Your Portfolio.</h1>
          <p style={styles.subheading}>
            AI-powered risk analysis for Indian retail investors.
          </p>

          <div style={styles.ctaRow}>
            <Link
              to='/register'
              style={{ ...styles.button, ...styles.primaryButton }}
              onMouseEnter={() => prefetchRoute('/register')}
              onFocus={() => prefetchRoute('/register')}
              onTouchStart={() => prefetchRoute('/register')}
            >
              Get Started
            </Link>
            <Link
              to='/login'
              style={{ ...styles.button, ...styles.secondaryButton }}
              onMouseEnter={() => prefetchRoute('/login')}
              onFocus={() => prefetchRoute('/login')}
              onTouchStart={() => prefetchRoute('/login')}
            >
              Try Demo
            </Link>
          </div>

          <p style={styles.tagline}>Free forever. No credit card required.</p>
        </section>

        <section style={styles.featuresSection}>
          <div className='landing-features-grid' style={styles.featuresGrid}>
            {features.map((feature) => (
              <article key={feature.title} style={styles.card}>
                <div style={styles.iconCircle} aria-hidden='true'>
                  <span style={styles.icon}>{feature.icon}</span>
                </div>
                <h3 style={styles.cardTitle}>{feature.title}</h3>
                <p style={styles.cardDescription}>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer style={styles.footer}>
        <p style={styles.footerText}>devtry55@gmail.com</p>
      </footer>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0d1117',
    color: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
  },
  main: {
    width: 'min(1120px, 100%)',
    margin: '0 auto',
    padding: '4.5rem 1.25rem 2.5rem',
    flex: 1,
  },
  hero: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'flex-start',
    textAlign: 'left',
  },
  heading: {
    margin: 0,
    color: '#ffffff',
    fontFamily: 'Barlow Condensed, sans-serif',
    fontSize: '4rem',
    lineHeight: 1,
    letterSpacing: '-0.02em',
  },
  subheading: {
    margin: '1.25rem 0 0',
    color: '#94a3b8',
    fontFamily: 'DM Sans, sans-serif',
    fontSize: '1.25rem',
    maxWidth: '38rem',
  },
  ctaRow: {
    marginTop: '2rem',
    display: 'flex',
    gap: '1rem',
    flexWrap: 'wrap',
  },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    textDecoration: 'none',
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    fontWeight: 900,
    borderRadius: '0.75rem',
    padding: '1rem 2rem',
    fontSize: '0.95rem',
    minWidth: '11.5rem',
    transition: 'transform 160ms ease, opacity 160ms ease, background 160ms ease',
  },
  primaryButton: {
    background: '#f97316',
    color: '#ffffff',
    border: '1px solid transparent',
  },
  secondaryButton: {
    background: 'transparent',
    color: '#ffffff',
    border: '1px solid rgba(255, 255, 255, 0.2)',
  },
  tagline: {
    margin: '1rem 0 0',
    color: '#64748b',
    fontSize: '0.875rem',
  },
  featuresSection: {
    paddingBottom: '2rem',
  },
  featuresGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '1rem',
  },
  card: {
    borderRadius: '1rem',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'rgba(15, 23, 42, 0.6)',
    padding: '1.5rem',
    textAlign: 'left',
  },
  iconCircle: {
    height: '2.5rem',
    width: '2.5rem',
    borderRadius: '999px',
    background: '#f97316',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '0.8rem',
  },
  icon: {
    fontSize: '1.1rem',
    lineHeight: 1,
  },
  cardTitle: {
    margin: 0,
    color: '#ffffff',
    fontWeight: 700,
    fontSize: '1.125rem',
  },
  cardDescription: {
    margin: '0.55rem 0 0',
    color: '#94a3b8',
    fontSize: '0.95rem',
  },
  footer: {
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    padding: '1rem 1rem 1.6rem',
    textAlign: 'center',
    background: '#0d1117',
  },
  footerText: {
    margin: 0,
    color: '#64748b',
    fontSize: '0.9rem',
  },
}

const responsiveCss = `
  @media (max-width: 900px) {
    .landing-features-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
    .landing-features-grid {
      gap: 0.85rem;
    }
  }
`

export default LandingPage
