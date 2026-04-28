import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import MeetingCard from '../components/MeetingCard'

export default function Home() {
  const { user, profile } = useAuth()
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('전체')
  const [tab, setTab] = useState('upcoming')

  const fetchMeetings = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from('meetings')
        .select('*, meeting_participants(user_id, user_name)')
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

  const todayStr = new Date().toISOString().slice(0, 10)

  const difficulties = ['전체', '초급', '중급', '고급']
  const filtered = meetings.filter(m => {
    const matchSearch = m.title.includes(search) || m.location.includes(search)
    const matchFilter = filter === '전체' || m.difficulty === filter
    return matchSearch && matchFilter
  })

  const tabFiltered = tab === 'upcoming'
    ? filtered.filter(m => m.date >= todayStr)
    : filtered.filter(m => m.date < todayStr).reverse()

  const uniqueParticipants = new Set(meetings.flatMap(m => (m.meeting_participants || []).map(p => p.user_id))).size

  return (
    <div className="page home-page">
      <section className="hero">
        {/* 벚꽃 장식 */}
        <span className="hero-petal" aria-hidden="true" style={{width:58,height:58,top:'10%',left:'4%'}}/>
        <span className="hero-petal" aria-hidden="true" style={{width:36,height:36,top:'18%',right:'6%',borderRadius:'0 50% 0 50%',background:'oklch(89% 0.07 40)',animationDelay:'1.4s'}}/>
        <span className="hero-petal" aria-hidden="true" style={{width:48,height:48,bottom:'14%',left:'10%',animationDelay:'0.7s'}}/>
        <span className="hero-petal" aria-hidden="true" style={{width:26,height:26,top:'8%',left:'50%',background:'oklch(90% 0.05 300)',animationDelay:'2.1s'}}/>
        <span className="hero-petal" aria-hidden="true" style={{width:44,height:44,bottom:'20%',right:'8%',borderRadius:'0 50% 0 50%',background:'oklch(89% 0.07 40)',animationDelay:'1s'}}/>
        <span className="hero-petal" aria-hidden="true" style={{width:20,height:20,top:'35%',left:'22%',background:'oklch(90% 0.05 300)',animationDelay:'3s'}}/>

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

        <div className="time-tabs">
          <button
            className={`time-tab ${tab === 'upcoming' ? 'active' : ''}`}
            onClick={() => setTab('upcoming')}
          >
            예정된 모임
          </button>
          <button
            className={`time-tab ${tab === 'past' ? 'active' : ''}`}
            onClick={() => setTab('past')}
          >
            지난 모임
          </button>
        </div>

        <div className="section-header">
          <h2>
            {tab === 'upcoming' ? '다가오는 모임' : '지난 모임'}
            <span className="count-badge">{tabFiltered.length}</span>
          </h2>
        </div>

        {loading ? (
          <div className="center-page" style={{ minHeight: '300px' }}>
            <div className="spinner-wrap"><div className="spinner" /><p>불러오는 중...</p></div>
          </div>
        ) : error ? (
          <div className="empty-state"><p>⚠️ {error}</p><button className="btn btn-primary btn-sm" onClick={fetchMeetings}>다시 시도</button></div>
        ) : tabFiltered.length === 0 ? (
          <div className="empty-state">
            <p>
              {search || filter !== '전체'
                ? '검색 결과가 없습니다'
                : tab === 'upcoming' ? '아직 예정된 모임이 없습니다' : '지난 모임이 없습니다'}
            </p>
          </div>
        ) : (
          <div className="meetings-grid">
            {tabFiltered.map(m => (
              <MeetingCard key={m.id} meeting={m} userId={user?.id} onJoinToggle={handleJoinToggle} isPast={tab === 'past'} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
