import { useState } from 'react'
import api from '../services/api'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const shellStyle = {
  minHeight: '100vh',
  backgroundColor: '#0d1117',
  display: 'grid',
  placeItems: 'center',
  padding: '1.5rem',
}

const cardStyle = {
  width: '100%',
  maxWidth: '28rem',
  backgroundColor: '#111827',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  borderRadius: '1rem',
  padding: '1.5rem',
  color: '#fff',
}

const fieldStyle = {
  width: '100%',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  backgroundColor: '#0f172a',
  color: '#fff',
  borderRadius: '0.75rem',
  padding: '0.75rem',
  boxSizing: 'border-box',
}

const buttonStyle = {
  width: '100%',
  border: 'none',
  borderRadius: '0.75rem',
  padding: '0.85rem 1rem',
  backgroundColor: '#f97316',
  color: '#fff',
  textTransform: 'uppercase',
  fontWeight: 900,
  letterSpacing: '0.2em',
  cursor: 'pointer',
}

const getTokenFromResponse = (data) => data?.token || data?.access_token || data?.accessToken

const RegisterPage = () => {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { login } = useAuth()

  const onSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await api.post('/api/auth/register', { name, email, password })
      const token = getTokenFromResponse(response.data)

      if (!token) {
        throw new Error('No token returned from server')
      }

      login(token)
      navigate('/dashboard')
    } catch {
      setError('Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={shellStyle}>
      <form onSubmit={onSubmit} style={cardStyle}>
        <h1 style={{ marginTop: 0, marginBottom: '1rem' }}>Register</h1>

        <div style={{ display: 'grid', gap: '0.85rem' }}>
          <input
            className='border border-white/20 bg-slate-900 text-white rounded-xl p-3'
            type='text'
            placeholder='Name'
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            style={fieldStyle}
          />

          <input
            className='border border-white/20 bg-slate-900 text-white rounded-xl p-3'
            type='email'
            placeholder='Email'
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            style={fieldStyle}
          />

          <input
            className='border border-white/20 bg-slate-900 text-white rounded-xl p-3'
            type='password'
            placeholder='Password'
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            style={fieldStyle}
          />

          {error && <p style={{ margin: 0, color: '#ef4444' }}>{error}</p>}

          <button type='submit' style={buttonStyle} disabled={loading}>
            {loading ? 'Creating account...' : 'Register'}
          </button>
        </div>

        <p style={{ marginBottom: 0, marginTop: '1rem', color: '#cbd5e1' }}>
          Already have an account?{' '}
          <Link to='/login' style={{ color: '#f97316', fontWeight: 700 }}>
            Login
          </Link>
        </p>
      </form>
    </div>
  )
}

export default RegisterPage
