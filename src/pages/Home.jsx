import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getCyclingPhoto } from '../lib/cyclingPhotos'

const DIFFICULTY_COLOR = { '초급': 'badge-green', '중급': 'badge-orange', '고급': 'badge-red' }

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
}

function MeetingCard({ meeting, userId, onJoinToggle }) {
  const navigate = useNavigate()
  const participantCount = meeting.meeting_participants?.length ?? 0
  const isJoined = meeting.meeting_participants?.some(p => p.user_id === userId)
  const isFull = participantCount >= meeting.max_participants

  return (
    <article className="meeting-card" onClick={() => navigate(`/meeting/${meeting.id}`)}>
      <div className="card-img-wrap">
        <img
          src={meeting.image || getCyclingPhoto(meeting.id, { width: 600, height: 300 })}
          alt={meeting.title}
          className="card-img"
          loading="lazy"
          onError={e => { e.target.onerror = null; e.target.src = `https://picsum.photos/seed/${meeting.id}/600/300` }}
        />
        <span className={`difficulty-badge ${DIFFICULTY_COLOR[meeting.difficulty] || 'badge-green'}`}>
          {meeting.difficulty}
        </span>
      </div>
      <div className="card-body">
        <h3 className="card-title">{meeting.title}</h3>
        <ul className="card-meta">
          <li><span className="meta-icon">📅</span>{formatDate(meeting.date)} {meeting.time?.slice(0, 5)}</li>
          <li><span className="meta-icon">📍</span>{meeting.location}</li>
          <li><span className="meta-icon">🚴</span>{meeting.distance}</li>
          <li>
            <span className="meta-icon">👥</span>
            <span className={isFull ? 'text-danger' : ''}>
              {participantCount}/{meeting.max_participants}명
            </span>
            {isFull && <span className="full-badge">마감</span>}
          </li>
        </ul>
        <p className="card-desc">{meeting.description}</p>
        <div className="card-footer">
          <button
            className={`btn btn-sm ${isJoined ? 'btn-outline' : isFull ? 'btn-disabled' : 'btn-primary'}`}
            onClick={e => { e.stopPropagation(); onJoinToggle(meeting, isJoined) }}
            disabled={isFull && !isJoined}
          >
            {isJoined ? '✓ 참가 중' : isFull ? '마감' : '참가하기'}
          </button>
          <button
            className="btn btn-sm btn-ghost"
            onClick={e => { e.stopPropagation(); navigate(`/meeting/${meeting.id}`) }}
          >
            자세히 보기 →
          </button>
        </div>
      </div>
    </article>
  )
}

export default function Home() {
  const { user, profile } = useAuth()
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('전체')

  const fetchMeetings = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from('meetings')
        .select('*, meeting_participants(user_id)')
        .order('date', { ascending: true })
      if (err) throw err
      setMeetings(data || [])
    } catch (err) {
      setError('모임 목록을 불러오지 못했습니다')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchMeetings() }, [fetchMeetings])

  async function handleJoinToggle(meeting, isJoined) {
    if (!user || !profile) return
    if (isJoined) {
      await supabase
        .from('meeting_participants')
        .delete()
        .eq('meeting_id', meeting.id)
        .eq('user_id', user.id)
    } else {
      if (meeting.meeting_participants.length >= meeting.max_participants) return
      await supabase
        .from('meeting_participants')
        .insert({ meeting_id: meeting.id, user_id: user.id, user_name: profile.name })
    }
    fetchMeetings()
  }

  const difficulties = ['전체', '초급', '중급', '고급']
  const filtered = meetings.filter(m => {
    const matchSearch = m.title.includes(search) || m.location.includes(search)
    const matchFilter = filter === '전체' || m.difficulty === filter
    return matchSearch && matchFilter
  })

  const uniqueParticipants = new Set(meetings.flatMap(m => (m.meeting_participants || []).map(p => p.user_id))).size

  return (
    <div className="page home-page">
      <section className="hero">
        <div className="hero-content">
          <h1>함께 달리는 즐거움 🚴</h1>
          <p>기선자 모임과 함께 새로운 라이딩을 시작해보세요</p>
          <div className="hero-stats">
            <div className="stat-item"><strong>{meetings.length}</strong><span>예정 모임</span></div>
            <div className="stat-item"><strong>{uniqueParticipants}</strong><span>활동 회원</span></div>
            <div className="stat-item"><strong>{meetings.reduce((s, m) => s + (m.meeting_participants?.length || 0), 0)}</strong><span>총 참가 수</span></div>
          </div>
        </div>
      </section>

      <div className="container">
        <div className="toolbar">
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input
              className="search-input"
              type="text"
              placeholder="모임 이름, 장소 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-tabs">
            {difficulties.map(d => (
              <button key={d} className={`filter-tab ${filter === d ? 'active' : ''}`} onClick={() => setFilter(d)}>
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="section-header">
          <h2>다가오는 모임 <span className="count-badge">{filtered.length}</span></h2>
        </div>

        {loading ? (
          <div className="center-page" style={{ minHeight: '300px' }}>
            <div className="spinner-wrap"><div className="spinner" /><p>불러오는 중...</p></div>
          </div>
        ) : error ? (
          <div className="empty-state"><p>⚠️ {error}</p><button className="btn btn-primary btn-sm" onClick={fetchMeetings}>다시 시도</button></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><p>🔍 {search || filter !== '전체' ? '검색 결과가 없습니다' : '아직 등록된 모임이 없습니다'}</p></div>
        ) : (
          <div className="meetings-grid">
            {filtered.map(m => (
              <MeetingCard key={m.id} meeting={m} userId={user?.id} onJoinToggle={handleJoinToggle} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
