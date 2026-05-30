import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    // 재설정 링크 클릭 시 Supabase가 URL hash의 토큰으로 임시 세션을 만들어줌.
    // PASSWORD_RECOVERY 또는 SIGNED_IN 이벤트가 오면 폼을 보여줌.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setReady(true)
      }
    })

    // 이미 세션이 있는 경우 (페이지 새로고침 등) 즉시 ready 처리
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })

    // 5초 후에도 ready 안 되면 만료된 링크로 간주
    const t = setTimeout(() => {
      setReady(prev => prev) // ready가 그대로면 아래 화면에서 안내
    }, 5000)

    return () => {
      clearTimeout(t)
      subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다')
      return
    }
    if (password !== confirm) {
      setError('비밀번호가 일치하지 않습니다')
      return
    }
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password })
      if (err) throw err
      setDone(true)
      setTimeout(async () => {
        await supabase.auth.signOut()
        navigate('/login')
      }, 2000)
    } catch (err) {
      setError(err.message || '비밀번호 변경에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  if (!ready) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">🚴 기선자 모임</div>
          <h2 className="auth-title">비밀번호 재설정</h2>
          <p className="auth-hint">
            인증 정보를 확인하는 중이에요...
            <br /><br />
            이 화면이 5초 이상 지속되면 재설정 링크가 만료됐을 수 있어요.
            아래 버튼으로 재설정 메일을 다시 받아주세요.
          </p>
          <Link to="/forgot-password" className="btn btn-outline full-width btn-lg" style={{ marginTop: 20 }}>
            재설정 메일 다시 받기
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">🚴 기선자 모임</div>
        <h2 className="auth-title">새 비밀번호 설정</h2>

        {done ? (
          <div className="auth-success">
            <div className="auth-success-icon">✅</div>
            <p>비밀번호가 변경됐어요.</p>
            <p className="auth-hint" style={{ marginTop: 8 }}>잠시 후 로그인 화면으로 이동합니다.</p>
          </div>
        ) : (
          <>
            <p className="auth-hint">새로 사용할 비밀번호를 입력해주세요.</p>
            {error && <div className="auth-error">{error}</div>}
            <form onSubmit={handleSubmit} className="auth-form">
              <div className="form-group">
                <label className="form-label">새 비밀번호</label>
                <input
                  className="form-input"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="6자 이상"
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
              </div>
              <div className="form-group">
                <label className="form-label">비밀번호 확인</label>
                <input
                  className="form-input"
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="다시 한 번 입력"
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
              </div>
              <button type="submit" className="btn btn-primary full-width btn-lg" disabled={loading}>
                {loading ? <span className="btn-spinner" /> : '비밀번호 변경'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
