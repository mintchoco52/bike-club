import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { initKakao } from '../lib/kakao'
import { getCyclingPhoto } from '../lib/cyclingPhotos'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })
}

const DIFFICULTY_COLOR = { '초급': 'badge-green', '중급': 'badge-orange', '고급': 'badge-red' }

export default function MeetingDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [meeting, setMeeting] = useState(null)
  const [participants, setParticipants] = useState([])
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')

  const fetchMeeting = useCallback(async ({ showLoading = false } = {}) => {
    if (showLoading) setLoading(true)
    const { data, error } = await supabase
      .from('meetings')
      .select('*, meeting_participants(user_id, user_name)')
      .eq('id', id)
      .single()
    console.log('[fetchMeeting] data:', data, 'error:', error)
    if (error || !data) { setLoading(false); return }
    setMeeting(data)
    setParticipants(data.meeting_participants || [])
    setLoading(false)
  }, [id])

  useEffect(() => {
    window.scrollTo(0, 0)
    fetchMeeting({ showLoading: true })
  }, [fetchMeeting])

  const isJoined = participants.some(p => p.user_id === user?.id)
  const isFull = meeting && participants.length >= meeting.max_participants
  const daysUntil = meeting
    ? Math.ceil((new Date(meeting.date) - new Date()) / (1000 * 60 * 60 * 24))
    : 0

  async function handleJoin() {
    console.group('[handleJoin]')
    console.log('user.id   :', user?.id)
    console.log('meeting.id:', id)
    console.log('isJoined  :', isJoined)
    console.log('participants:', participants)
    console.log('profile   :', profile)

    if (!user)    { console.warn('❌ user is null');    console.groupEnd(); return }
    if (!profile) { console.warn('❌ profile is null'); console.groupEnd(); return }
    if (joining)  { console.warn('❌ already joining'); console.groupEnd(); return }

    setJoining(true)
    setJoinError('')

    try {
      if (isJoined) {
        // ── 참가 취소 ──────────────────────────────────────
        console.log('▶ DELETE 시도:', { meeting_id: id, user_id: user.id })

        const { data: deleted, error, status } = await supabase
          .from('meeting_participants')
          .delete()
          .eq('meeting_id', id)
          .eq('user_id', user.id)
          .select()   // 실제로 삭제된 행을 반환 → 빈 배열이면 RLS가 막은 것

        console.log('DELETE 결과 → status:', status, '| deleted:', deleted, '| error:', error)

        if (error) throw error

        if (!deleted || deleted.length === 0) {
          // 에러는 없지만 아무 행도 삭제되지 않음 = RLS가 막거나 행이 없는 상태
          throw new Error(
            `삭제된 행 없음 (status ${status}). ` +
            'RLS 정책을 확인하거나 Supabase SQL Editor에서 mp_delete 정책을 재생성하세요.'
          )
        }

        console.log('✅ 취소 성공, 삭제된 행:', deleted)

      } else {
        // ── 참가 신청 ──────────────────────────────────────
        console.log('▶ INSERT 시도:', { meeting_id: id, user_id: user.id, user_name: profile.name })

        const { data: inserted, error, status } = await supabase
          .from('meeting_participants')
          .insert({ meeting_id: id, user_id: user.id, user_name: profile.name })
          .select()

        console.log('INSERT 결과 → status:', status, '| inserted:', inserted, '| error:', error)

        if (error) throw error
        console.log('✅ 참가 성공')
      }

      await fetchMeeting()

    } catch (err) {
      console.error('❌ handleJoin 에러:', err)
      setJoinError(err.message || '처리 중 오류가 발생했습니다')
    } finally {
      setJoining(false)
      console.groupEnd()
    }
  }

  function handleKakaoShare() {
    const ok = initKakao()
    console.log('[Kakao] initKakao 결과:', ok, '| Kakao.Share:', !!window.Kakao?.Share)
    if (!ok || !window.Kakao?.Share) {
      alert('카카오 SDK 초기화 실패. 콘솔을 확인해주세요.')
      return
    }

    const pageUrl = window.location.href
    const description = `📅 ${formatDate(meeting.date)} ${meeting.time?.slice(0, 5) || ''} · 📍 ${meeting.location} · 👥 ${participants.length}/${meeting.max_participants}명`

    const imageUrl = meeting.image || 'https://bike-club-teal.vercel.app/pwa-512x512.png'

    try {
      window.Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: meeting.title,
          description,
          imageUrl,
          imageWidth: 800,
          imageHeight: 400,
          link: { mobileWebUrl: pageUrl, webUrl: pageUrl },
        },
        buttons: [
          {
            title: '모임 자세히 보기',
            link: { mobileWebUrl: pageUrl, webUrl: pageUrl },
          },
        ],
      })
    } catch (err) {
      console.error('[Kakao] 공유 실패:', err)
      alert(`카카오 공유 오류: ${err.message}`)
    }
  }

  if (loading) {
    return (
      <div className="page center-page">
        <div className="spinner-wrap"><div className="spinner" /><p>불러오는 중...</p></div>
      </div>
    )
  }

  if (!meeting) {
    return (
      <div className="page center-page">
        <div className="empty-state">
          <p>😕 모임을 찾을 수 없습니다</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>목록으로</button>
        </div>
      </div>
    )
  }

  return (
    <div className="page detail-page">
      <div className="detail-hero">
        <img
          src={meeting.image || getCyclingPhoto(meeting.id, { width: 1200, height: 500 })}
          alt={meeting.title}
          className="detail-hero-img"
          onError={e => { e.target.onerror = null; e.target.src = `https://picsum.photos/seed/${meeting.id}/1200/500` }}
        />
        <div className="detail-hero-overlay">
          <button className="back-btn" onClick={() => navigate(-1)}>← 뒤로</button>
          <div className="detail-hero-content">
            <span className={`difficulty-badge lg ${DIFFICULTY_COLOR[meeting.difficulty] || 'badge-green'}`}>
              {meeting.difficulty}
            </span>
            <h1>{meeting.title}</h1>
            {daysUntil > 0 && <span className="days-chip">D-{daysUntil}</span>}
          </div>
        </div>
      </div>

      <div className="container detail-container">
        <div className="detail-main">
          <div className="detail-card">
            <h2 className="section-title">모임 정보</h2>
            <ul className="detail-meta">
              <li><span className="detail-meta-icon">📅</span><div><strong>날짜</strong><span>{formatDate(meeting.date)} {meeting.time?.slice(0, 5)}</span></div></li>
              <li><span className="detail-meta-icon">📍</span><div><strong>장소</strong><span>{meeting.location}</span></div></li>
              <li><span className="detail-meta-icon">🚴</span><div><strong>거리</strong><span>{meeting.distance}</span></div></li>
              <li><span className="detail-meta-icon">👤</span><div><strong>주최자</strong><span>{meeting.creator_name}</span></div></li>
              <li>
                <span className="detail-meta-icon">👥</span>
                <div>
                  <strong>참가 인원</strong>
                  <span>
                    {participants.length}/{meeting.max_participants}명
                    {isFull && <span className="full-badge ml-8">마감</span>}
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div className="detail-card">
            <h2 className="section-title">모임 설명</h2>
            <p className="detail-description">{meeting.description}</p>
          </div>

          <div className="detail-card">
            <h2 className="section-title">참가자 ({participants.length}명)</h2>
            <div className="participants-list">
              {participants.map((p, i) => (
                <div key={p.user_id || i} className="participant-chip">
                  <div className="participant-avatar">{(p.user_name || '?')[0]}</div>
                  <span>{p.user_name || '알 수 없음'}</span>
                  {p.user_id === meeting.created_by && <span className="host-badge">주최</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="detail-side">
          <div className="join-card">
            <div className="join-progress-wrap">
              <div className="join-progress-label">
                <span>참가 현황</span>
                <span>{participants.length}/{meeting.max_participants}명</span>
              </div>
              <div className="join-progress-bar">
                <div
                  className="join-progress-fill"
                  style={{ width: `${(participants.length / meeting.max_participants) * 100}%` }}
                />
              </div>
            </div>
            <button
              className={`btn btn-lg full-width ${isJoined ? 'btn-outline' : isFull ? 'btn-disabled' : 'btn-primary'}`}
              onClick={handleJoin}
              disabled={(isFull && !isJoined) || joining}
            >
              {joining
                ? <span className="btn-spinner" />
                : isJoined ? '✓ 참가 중 (취소하기)' : isFull ? '모집 마감' : '참가하기 🚴'}
            </button>
            {!isJoined && !isFull && (
              <p className="join-hint">참가하면 내 프로필에서 확인할 수 있어요</p>
            )}
            {joinError && (
              <p className="join-error">⚠️ {joinError}</p>
            )}

            <button className="kakao-share-btn" onClick={handleKakaoShare}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 1.5C4.86 1.5 1.5 4.19 1.5 7.5c0 2.1 1.26 3.94 3.15 5.04L3.9 15l3.21-1.73c.61.1 1.25.16 1.89.16 4.14 0 7.5-2.69 7.5-6s-3.36-6-7.5-6z" fill="#000000"/>
              </svg>
              카카오톡으로 공유
            </button>
          </div>

          <div className="detail-card map-card">
            <h2 className="section-title">모임 장소</h2>
            <p className="map-location-label">📍 {meeting.location}</p>
            <div className="map-container">
              <MapContainer
                center={[meeting.lat, meeting.lng]}
                zoom={15}
                style={{ height: '100%', width: '100%', borderRadius: '8px' }}
                scrollWheelZoom={false}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={[meeting.lat, meeting.lng]}>
                  <Popup><strong>{meeting.title}</strong><br />{meeting.location}</Popup>
                </Marker>
              </MapContainer>
            </div>
            <a
              href={`https://maps.google.com/?q=${meeting.lat},${meeting.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline full-width mt-12"
            >
              구글 지도에서 열기 ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
