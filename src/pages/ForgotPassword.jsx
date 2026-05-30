import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (err) throw err
      setSent(true)
    } catch (err) {
      setError(err.message || '메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">🚴 기선자 모임</div>
        <h2 className="auth-title">비밀번호 찾기</h2>

        {sent ? (
          <div className="auth-success">
            <div className="auth-success-icon">📬</div>
            <p><strong>{email}</strong>로<br />비밀번호 재설정 메일을 보냈어요.</p>
            <p className="auth-hint" style={{ marginTop: 12 }}>
              메일함에서 <strong>"Reset Your Password"</strong> 메일을 열고 링크를 클릭하시면 새 비밀번호를 설정할 수 있어요.
              <br /><br />
              메일이 안 보이면 <strong>스팸함</strong>도 확인해주세요. 링크는 1시간 동안 유효합니다.
            </p>
            <Link to="/login" className="btn btn-outline full-width btn-lg" style={{ marginTop: 24 }}>
              로그인 화면으로
            </Link>
          </div>
        ) : (
          <>
            <p className="auth-hint">가입하신 이메일을 입력하시면 비밀번호 재설정 링크를 보내드려요.</p>
            {error && <div className="auth-error">{error}</div>}
            <form onSubmit={handleSubmit} className="auth-form">
              <div className="form-group">
                <label className="form-label">이메일</label>
                <input
                  className="form-input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  autoComplete="email"
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary full-width btn-lg" disabled={loading}>
                {loading ? <span className="btn-spinner" /> : '재설정 메일 받기'}
              </button>
            </form>
            <p className="auth-link">
              비밀번호가 기억나셨나요? <Link to="/login">로그인</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
