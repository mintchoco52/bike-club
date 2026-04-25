import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Register() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  function setField(k, v) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) { setError('이름을 입력해주세요'); return }
    if (form.password.length < 6) { setError('비밀번호는 6자 이상이어야 합니다'); return }
    if (form.password !== form.confirm) { setError('비밀번호가 일치하지 않습니다'); return }
    setLoading(true)
    try {
      await signUp(form.name.trim(), form.email, form.password)
      setSuccess(true)
    } catch (err) {
      const msg = err.message || ''
      if (msg.includes('already registered')) setError('이미 가입된 이메일입니다')
      else setError(msg || '회원가입에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-success-icon">✅</div>
          <h2 className="auth-title">가입이 완료되었습니다!</h2>
          <p className="text-muted" style={{ marginBottom: '24px' }}>
            이메일 인증이 필요한 경우 메일함을 확인해주세요.<br />
            (스팸함도 확인해보세요)
          </p>
          <button className="btn btn-primary full-width btn-lg" onClick={() => navigate('/login')}>
            로그인하러 가기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">🚴 기선자 모임</div>
        <h2 className="auth-title">회원가입</h2>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label">이름 <span className="required">*</span></label>
            <input
              className="form-input"
              type="text"
              value={form.name}
              onChange={e => setField('name', e.target.value)}
              placeholder="홍길동"
              maxLength={20}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">이메일 <span className="required">*</span></label>
            <input
              className="form-input"
              type="email"
              value={form.email}
              onChange={e => setField('email', e.target.value)}
              placeholder="email@example.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">비밀번호 <span className="required">*</span></label>
            <input
              className="form-input"
              type="password"
              value={form.password}
              onChange={e => setField('password', e.target.value)}
              placeholder="6자 이상"
              autoComplete="new-password"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">비밀번호 확인 <span className="required">*</span></label>
            <input
              className="form-input"
              type="password"
              value={form.confirm}
              onChange={e => setField('confirm', e.target.value)}
              placeholder="비밀번호를 다시 입력하세요"
              autoComplete="new-password"
              required
            />
          </div>
          <button type="submit" className="btn btn-primary full-width btn-lg" disabled={loading}>
            {loading ? <span className="btn-spinner" /> : '회원가입'}
          </button>
        </form>
        <p className="auth-link">
          이미 계정이 있으신가요? <Link to="/login">로그인</Link>
        </p>
      </div>
    </div>
  )
}
