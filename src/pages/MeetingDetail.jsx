import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

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

  const fetchMeeting = useCallback(async () => {
    const { data, error } = await supabase
      .from('meetings')
      .select('*, meeting_participants(user_id, user_name)')
      .eq('id', id)
      .single()
    if (error || !data) { setLoading(false); return }
    setMeeting(data)
    setParticipants(data.meeting_participants || [])
    setLoading(false)
  }, [id])

  useEffect(() => {
    window.scrollTo(0, 0)
    fetchMeeting()
  }, [fetchMeeting])

  const isJoined = participants.some(p => p.user_id === user?.id)
  const isFull = meeting && participants.length >= meeting.max_participants
  const daysUntil = meeting
    ? Math.ceil((new Date(meeting.date) - new Date()) / (1000 * 60 * 60 * 24))
    : 0

  async function handleJoin() {
    if (!user || !profile || joining) return
    setJoining(true)
    if (isJoined) {
      await supabase
        .from('meeting_participants')
        .delete()
        .eq('meeting_id', id)
        .eq('user_id', user.id)
    } else {
      await supabase
        .from('meeting_participants')
        .insert({ meeting_id: id, user_id: user.id, user_name: profile.name })
    }
    await fetchMeeting()
    setJoining(false)
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
          src={meeting.image || `https://picsum.photos/seed/${meeting.id}/600/300`}
          alt={meeting.title}
          className="detail-hero-img"
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
