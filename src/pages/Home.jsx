import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import MeetingCard from '../components/MeetingCard'
import { getQuoteOfTheDay } from '../lib/cyclingQuotes'
import { isVideoUrl } from '../lib/albums'

function formatShortDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' })
}

function getRidingScoreLabel(meeting) {
  if (!meeting) return { score: '--', text: '예정 모임 등록 후 확인', tone: 'muted' }
  return { score: 82, text: '라이딩 지수 좋음', tone: 'good' }
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 6)  return { text: '늦은 밤이에요', emoji: '🌙' }
  if (h < 12) return { text: '좋은 아침이에요', emoji: '☀️' }
  if (h < 18) return { text: '좋은 오후에요', emoji: '🌤️' }
  return { text: '좋은 저녁이에요', emoji: '🌆' }
}

export default function Home() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [meetings, setMeetings] = useState([])
  const [latestPhotos, setLatestPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('upcoming')
  const [reviewCounts, setReviewCounts] = useState({})
  const [reviewHasNew, setReviewHasNew] = useState({})
  const dailyQuote = useMemo(() => getQuoteOfTheDay(), [])

  const fetchMeetings = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from('meetings')
        .select('*, meeting_participants(user_id, user_name)')
        .order('date', { ascending: true })
      if (err) throw err
      setMeetings(data || [])

      // 모임 앨범의 최신 사진 (기존 갤러리 photos 테이블 → album_photos로 전환)
      const { data: photoData } = await supabase
        .from('album_photos')
        .select('id, url, created_at, album:albums(id, title)')
        .order('created_at', { ascending: false })
        .limit(6)
      setLatestPhotos(photoData || [])

      if (data?.length) {
        const { data: reviewData } = await supabase
          .from('reviews')
          .select('meeting_id, created_at')
          .in('meeting_id', data.map(m => m.id))
        if (reviewData) {
          const counts = {}
          const hasNew = {}
          const threshold = Date.now() - 24 * 60 * 60 * 1000
          reviewData.forEach(r => {
            counts[r.meeting_id] = (counts[r.meeting_id] || 0) + 1
            if (new Date(r.created_at).getTime() > threshold) hasNew[r.meeting_id] = true
          })
          setReviewCounts(counts)
          setReviewHasNew(hasNew)
        }
      }
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

  const isPast = (m) => {
    if (!m.date || !m.time) return false
    const endTime = new Date(`${m.date}T${m.time}`)
    endTime.setHours(endTime.getHours() + 2)
    return new Date() > endTime
  }

  const tabFiltered = tab === 'upcoming'
    ? meetings.filter(m => !isPast(m))
    : meetings.filter(m => isPast(m)).reverse()

  const upcomingMeetings = meetings.filter(m => !isPast(m))
  const nextMeeting = [...upcomingMeetings].sort((a, b) => {
    const aTime = new Date(`${a.date}T${a.time || '09:00'}`).getTime()
    const bTime = new Date(`${b.date}T${b.time || '09:00'}`).getTime()
    return aTime - bTime
  })[0]
  const ridingScore = getRidingScoreLabel(nextMeeting)
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
          {profile?.name && (
            <div className="hero-welcome">
              <span className="hero-welcome-emoji" aria-hidden="true">{getGreeting().emoji}</span>
              <span className="hero-welcome-text">
                {getGreeting().text}, <strong>{profile.name}</strong>님!
              </span>
            </div>
          )}
          <h1>함께 달리는 즐거움 🚴</h1>
          <p>기선자 모임과 함께 새로운 라이딩을 시작해보세요</p>
          <div className="hero-stats">
            <div className="stat-item"><strong>{upcomingMeetings.length}</strong><span>예정 모임</span></div>
            <div className="stat-item"><strong>{uniqueParticipants}</strong><span>활동 회원</span></div>
            <div className="stat-item"><strong>{meetings.reduce((s, m) => s + (m.meeting_participants?.length || 0), 0)}</strong><span>총 참가 수</span></div>
            <div className={`stat-item riding-stat ${ridingScore.tone}`}>
              <strong>{ridingScore.score}</strong>
              <span>{ridingScore.text}</span>
            </div>
          </div>
          {nextMeeting && (
            <button className="weekly-highlight" onClick={() => navigate(`/meeting/${nextMeeting.id}`)}>
              <span className="weekly-date">{formatShortDate(nextMeeting.date)}</span>
              <span className="weekly-copy">
                <strong>이번 주 하이라이트 · {nextMeeting.title}</strong>
                <span>{nextMeeting.time?.slice(0, 5)} · {nextMeeting.location} · {Math.max(0, nextMeeting.max_participants - (nextMeeting.meeting_participants?.length || 0))}자리 남음</span>
              </span>
              <span className="weekly-pill">라이딩 지수 확인</span>
            </button>
          )}
        </div>
      </section>

      <div className="container">
        <section className="daily-quote" aria-label="오늘의 자전거 명언">
          <span className="daily-quote-label">오늘의 한 줄</span>
          <blockquote className="daily-quote-text">
            <span className="daily-quote-mark" aria-hidden="true">“</span>
            {dailyQuote.text}
          </blockquote>
          <cite className="daily-quote-author">— {dailyQuote.author}</cite>
        </section>

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
            <p>{tab === 'upcoming' ? '아직 예정된 모임이 없습니다' : '지난 모임이 없습니다'}</p>
          </div>
        ) : (
          <div className="meetings-grid">
            {tabFiltered.map(m => (
              <MeetingCard key={m.id} meeting={m} userId={user?.id} onJoinToggle={handleJoinToggle} isPast={isPast(m)} reviewCount={reviewCounts[m.id] || 0} reviewHasNew={reviewHasNew[m.id] || false} />
            ))}
          </div>
        )}

        {latestPhotos.length > 0 && (
          <section className="home-gallery">
            <div className="home-gallery-head">
              <h2>최근 모임 앨범</h2>
              <button type="button" onClick={() => navigate('/albums')}>전체 보기</button>
            </div>
            <div className="home-gallery-strip">
              {latestPhotos.map(photo => (
                <button
                  key={photo.id}
                  type="button"
                  className={`home-gallery-tile${isVideoUrl(photo.url) ? ' video' : ''}`}
                  style={{ backgroundImage: isVideoUrl(photo.url) ? undefined : `linear-gradient(to top, rgba(0,0,0,0.34), transparent 62%), url(${photo.url})` }}
                  onClick={() => navigate('/albums')}
                >
                  {isVideoUrl(photo.url)
                    ? <video src={photo.url} muted playsInline preload="metadata" />
                    : <img src={photo.url} alt={photo.album?.title || '모임 앨범'} loading="lazy" />}
                  <span>{photo.album?.title || '모임 앨범'}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
