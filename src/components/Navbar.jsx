import { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const NAV_LINKS = [
  { to: '/',       label: '모임 목록',   icon: '📋' },
  { to: '/create', label: '모임 만들기', icon: '➕' },
  { to: '/gallery',label: '갤러리',      icon: '📷' },
  { to: '/profile',label: '내 프로필',   icon: '👤' },
]

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const menuRef = useRef(null)

  const isAuthPage = ['/login', '/register'].includes(location.pathname)

  // 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    if (!menuOpen) return
    function handleOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [menuOpen])

  // 라우트 변경 시 메뉴 닫기
  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  async function handleLogout() {
    setMenuOpen(false)
    await signOut()
    navigate('/login')
  }

  return (
    <nav className="navbar" ref={menuRef}>
      <div className="navbar-inner">
        <button className="navbar-logo" onClick={() => navigate(user ? '/' : '/login')}>
          <span className="logo-icon">🚴</span>
          <span className="logo-text">기선자 모임</span>
        </button>

        {!isAuthPage && user && (
          <>
            <ul className={`navbar-links ${menuOpen ? 'open' : ''}`}>
              {NAV_LINKS.map(({ to, label, icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === '/'}
                    className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                    onClick={() => setMenuOpen(false)}
                  >
                    <span className="nav-icon">{icon}</span>
                    <span>{label}</span>
                  </NavLink>
                </li>
              ))}
              {/* 모바일 드롭다운 전용: 유저 정보 + 로그아웃 */}
              <li className="nav-mobile-user">
                <div className="nav-mobile-user-info">
                  <div className="avatar-btn avatar-btn-sm">
                    {profile?.avatar_url
                      ? <img src={profile.avatar_url} alt="프로필" />
                      : <span>{(profile?.name || user.email || '?')[0].toUpperCase()}</span>
                    }
                  </div>
                  <span>{profile?.name || user.email}</span>
                </div>
                <button className="btn btn-outline btn-sm" onClick={handleLogout}>로그아웃</button>
              </li>
            </ul>

            <div className="navbar-right">
              <div className="navbar-user" onClick={() => navigate('/profile')}>
                <div className="avatar-btn">
                  {profile?.avatar_url
                    ? <img src={profile.avatar_url} alt="프로필" />
                    : <span>{(profile?.name || user.email || '?')[0].toUpperCase()}</span>
                  }
                </div>
                <span className="navbar-username">{profile?.name || ''}</span>
              </div>
              <button className="btn btn-ghost btn-sm logout-btn" onClick={handleLogout}>
                로그아웃
              </button>
              <button
                className={`hamburger ${menuOpen ? 'open' : ''}`}
                onClick={() => setMenuOpen(v => !v)}
                aria-label="메뉴"
              >
                <span /><span /><span />
              </button>
            </div>
          </>
        )}
      </div>

      {/* 모바일 메뉴 열릴 때 배경 딤 처리 */}
      {menuOpen && <div className="nav-backdrop" onClick={() => setMenuOpen(false)} />}
    </nav>
  )
}
