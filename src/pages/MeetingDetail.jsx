import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { initKakao } from '../lib/kakao'
import { getCyclingPhoto } from '../lib/cyclingPhotos'

const OW_KEY = import.meta.env.VITE_OPENWEATHER_KEY

function getWeatherEmoji(id) {
  if (id >= 200 && id < 300) return '⛈️'
  if (id >= 300 && id < 400) return '🌦️'
  if (id >= 500 && id < 600) return '🌧️'
  if (id >= 600 && id < 700) return '❄️'
  if (id >= 700 && id < 800) return '🌫️'
  if (id === 800) return '☀️'
  if (id === 801) return '🌤️'
  if (id === 802) return '⛅'
  return '☁️'
}

function getWeatherBg(id) {
  if (id >= 200 && id < 300) return 'linear-gradient(135deg, #3d4a6b 0%, #5a4a7a 100%)'
  if (id >= 300 && id < 400) return 'linear-gradient(135deg, #5a7a8a 0%, #4a6a7a 100%)'
  if (id >= 500 && id < 600) return 'linear-gradient(135deg, #3a6a9a 0%, #2a5a8a 100%)'
  if (id >= 600 && id < 700) return 'linear-gradient(135deg, #7aaad0 0%, #a0c8e8 100%)'
  if (id >= 700 && id < 800) return 'linear-gradient(135deg, #7a8fa0 0%, #9aaac0 100%)'
  if (id === 800) return 'linear-gradient(135deg, #f5a020 0%, #f7c040 100%)'
  if (id === 801) return 'linear-gradient(135deg, #5aaae0 0%, #88c8f8 100%)'
  if (id === 802) return 'linear-gradient(135deg, #6a9ab8 0%, #8ab4cc 100%)'
  return 'linear-gradient(135deg, #6a8098 0%, #8a9eae 100%)'
}

function pmGrade(val, type) {
  const thresholds = type === 'pm25'
    ? [{ max: 15, label: '좋음', color: '#4caf50' }, { max: 35, label: '보통', color: '#ff9800' }, { max: 75, label: '나쁨', color: '#f44336' }]
    : [{ max: 30, label: '좋음', color: '#4caf50' }, { max: 80, label: '보통', color: '#ff9800' }, { max: 150, label: '나쁨', color: '#f44336' }]
  return thresholds.find(t => val < t.max) || { label: '매우나쁨', color: '#9c27b0' }
}

function ridingMsg(id, pm25) {
  if (pm25 >= 75) return { text: '미세먼지가 매우 나빠 라이딩을 피하세요 😷', ok: false }
  if (id >= 200 && id < 300) return { text: '뇌우로 라이딩을 취소하는 게 좋겠어요 ⛈️', ok: false }
  if (id >= 502 && id < 600) return { text: '강한 비로 라이딩을 삼가세요 ☔', ok: false }
  if (id >= 500 && id < 600) return { text: '비가 오니 우비를 챙기세요 🌧️', ok: null }
  if (id >= 600 && id < 700) return { text: '눈길에 주의하며 라이딩하세요 ❄️', ok: null }
  if (pm25 >= 35) return { text: '미세먼지가 나빠 마스크를 착용하세요 😷', ok: null }
  if (id === 800 || id === 801) return { text: '최고의 라이딩 날씨예요! 🚴', ok: true }
  if (id <= 803) return { text: '라이딩하기 좋은 날씨예요 😊', ok: true }
  return { text: '라이딩 가능하지만 날씨를 확인하세요 ⚠️', ok: null }
}

function WeatherCard({ meeting }) {
  const [weather, setWeather] = useState(null)
  const [air, setAir] = useState(null)
  const [wLoading, setWLoading] = useState(true)
  const [wError, setWError] = useState(null)
  const [isForecast, setIsForecast] = useState(false)

  useEffect(() => {
    if (!OW_KEY) {
      setWError('날씨 API 키가 없습니다')
      setWLoading(false)
      return
    }
    async function fetchAll() {
      try {
        const { date, time, location } = meeting
        const meetingTs = new Date(`${date}T${time || '09:00'}`)
        const diffDays = (meetingTs - Date.now()) / 86400000
        const useForecast = diffDays > 0 && diffDays <= 5
        setIsForecast(useForecast)

        // 좌표가 서울 시청 기본값이거나 없으면 location 텍스트로 지오코딩
        const isDefaultCoords =
          !meeting.lat || !meeting.lng ||
          (Math.abs(meeting.lat - 37.5665) < 0.0002 && Math.abs(meeting.lng - 126.9780) < 0.0002)

        let lat = meeting.lat
        let lng = meeting.lng

        if (isDefaultCoords && location) {
          const gRes = await fetch(
            `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(location)}&limit=1&appid=${OW_KEY}`
          )
          const gJson = await gRes.json()
          if (gJson.length > 0) {
            lat = gJson[0].lat
            lng = gJson[0].lon
          }
        }

        if (useForecast) {
          const [fRes, aRes] = await Promise.all([
            fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&appid=${OW_KEY}&units=metric&lang=kr`),
            fetch(`https://api.openweathermap.org/data/2.5/air_pollution/forecast?lat=${lat}&lon=${lng}&appid=${OW_KEY}`),
          ])
          const [fJson, aJson] = await Promise.all([fRes.json(), aRes.json()])
          const target = meetingTs.getTime() / 1000
          const closest = fJson.list.reduce((a, b) => Math.abs(b.dt - target) < Math.abs(a.dt - target) ? b : a)
          const closestAir = aJson.list.reduce((a, b) => Math.abs(b.dt - target) < Math.abs(a.dt - target) ? b : a)
          setWeather({
            id: closest.weather[0].id, desc: closest.weather[0].description,
            temp: closest.main.temp, feels: closest.main.feels_like,
            humidity: closest.main.humidity, wind: closest.wind.speed,
            tempMin: closest.main.temp_min, tempMax: closest.main.temp_max,
          })
          setAir({ pm25: closestAir.components.pm2_5, pm10: closestAir.components.pm10 })
        } else {
          const [wRes, aRes] = await Promise.all([
            fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${OW_KEY}&units=metric&lang=kr`),
            fetch(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lng}&appid=${OW_KEY}`),
          ])
          const [wJson, aJson] = await Promise.all([wRes.json(), aRes.json()])
          setWeather({
            id: wJson.weather[0].id, desc: wJson.weather[0].description,
            temp: wJson.main.temp, feels: wJson.main.feels_like,
            humidity: wJson.main.humidity, wind: wJson.wind.speed,
            tempMin: wJson.main.temp_min, tempMax: wJson.main.temp_max,
          })
          setAir({ pm25: aJson.list[0].components.pm2_5, pm10: aJson.list[0].components.pm10 })
        }
      } catch {
        setWError('날씨 정보를 불러오는 중 오류가 발생했습니다')
      } finally {
        setWLoading(false)
      }
    }
    fetchAll()
  }, [meeting])

  if (wLoading) return (
    <div className="detail-card weather-card" style={{ minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
    </div>
  )
  if (wError || !weather) return (
    <div className="detail-card weather-card">
      <h2 className="section-title">날씨 정보</h2>
      <p style={{ color: '#888', fontSize: 14 }}>{wError || '날씨 정보 없음'}</p>
    </div>
  )

  const emoji = getWeatherEmoji(weather.id)
  const bg = getWeatherBg(weather.id)
  const pm25g = pmGrade(air.pm25, 'pm25')
  const pm10g = pmGrade(air.pm10, 'pm10')
  const msg = ridingMsg(weather.id, air.pm25)
  const msgColor = msg.ok === true ? '#b8ffb8' : msg.ok === false ? '#ffb0b0' : '#fff9b0'

  return (
    <div className="detail-card weather-card" style={{ background: bg, padding: 0, overflow: 'hidden', border: 'none' }}>
      <div style={{ padding: '20px 20px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h2 className="section-title" style={{ color: 'rgba(255,255,255,0.85)', margin: 0 }}>날씨 정보</h2>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', background: 'rgba(0,0,0,0.18)', padding: '2px 8px', borderRadius: 10 }}>
            {isForecast ? '모임 시간 예보' : '현재 기준'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <span style={{ fontSize: 52, lineHeight: 1 }}>{emoji}</span>
          <div>
            <div style={{ fontSize: 38, fontWeight: 800, color: '#fff', lineHeight: 1 }}>
              {Math.round(weather.temp)}°C
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 3, textTransform: 'capitalize' }}>
              {weather.desc}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div className="weather-detail-item">
            <span className="weather-detail-label">체감온도</span>
            <span className="weather-detail-value">{Math.round(weather.feels)}°C</span>
          </div>
          <div className="weather-detail-item">
            <span className="weather-detail-label">습도</span>
            <span className="weather-detail-value">{weather.humidity}%</span>
          </div>
          <div className="weather-detail-item">
            <span className="weather-detail-label">최고 / 최저</span>
            <span className="weather-detail-value">{Math.round(weather.tempMax)}° / {Math.round(weather.tempMin)}°</span>
          </div>
          <div className="weather-detail-item">
            <span className="weather-detail-label">바람</span>
            <span className="weather-detail-value">{weather.wind.toFixed(1)} m/s</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="weather-pm-badge" style={{ background: pm25g.color }}>
            PM2.5 {pm25g.label} ({Math.round(air.pm25)})
          </span>
          <span className="weather-pm-badge" style={{ background: pm10g.color }}>
            PM10 {pm10g.label} ({Math.round(air.pm10)})
          </span>
        </div>
      </div>

      <div className="weather-riding-bar">
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: msgColor }}>
          {msg.text}
        </p>
      </div>
    </div>
  )
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })
}

function formatReviewDate(str) {
  return new Date(str).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
}

function isNew(dateStr) {
  return Date.now() - new Date(dateStr).getTime() < 24 * 60 * 60 * 1000
}

const NEW_BADGE = (
  <span style={{
    background: '#ff4444', color: 'white',
    fontSize: 10, fontWeight: 700,
    padding: '2px 6px', borderRadius: 10,
    marginLeft: 4, verticalAlign: 'middle',
  }}>NEW</span>
)

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

  // 후기
  const [reviews, setReviews] = useState([])
  const [reviewText, setReviewText] = useState('')
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const reviewPrefilled = useRef(false)
  const [reviewPhotos, setReviewPhotos] = useState([])  // { type:'file'|'url', file?, preview?, url? }
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const photoInputRef = useRef(null)
  const [comments, setComments] = useState({})            // { [reviewId]: Comment[] }
  const [commentsOpen, setCommentsOpen] = useState({})    // { [reviewId]: boolean }
  const [commentDraft, setCommentDraft] = useState({})    // { [reviewId]: string }
  const [commentSubmitting, setCommentSubmitting] = useState({})

  const fetchMeeting = useCallback(async ({ showLoading = false } = {}) => {
    if (showLoading) setLoading(true)
    const { data, error } = await supabase
      .from('meetings')
      .select('*')
      .eq('id', id)
      .single()
    if (error || !data) { setLoading(false); return }
    setMeeting(data)

    const { data: parts } = await supabase
      .from('meeting_participants')
      .select('user_id, user_name')
      .eq('meeting_id', id)
    setParticipants(parts || [])
    setLoading(false)
  }, [id])

  const fetchReviews = useCallback(async () => {
    setReviewsLoading(true)
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('meeting_id', id)
      .order('created_at', { ascending: true })
    if (!error && data) {
      // 댓글 일괄 조회
      let commentsData = []
      if (data.length > 0) {
        const { data: cd } = await supabase
          .from('review_comments')
          .select('*')
          .in('review_id', data.map(r => r.id))
          .order('created_at', { ascending: true })
        commentsData = cd || []
      }

      // 후기 + 댓글 작성자 이름 한 번에 조회
      const allUserIds = [...new Set([
        ...data.map(r => r.user_id),
        ...commentsData.map(c => c.user_id),
      ])]
      let nameMap = {}
      if (allUserIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles').select('id, name').in('id', allUserIds)
        if (profilesData) profilesData.forEach(p => { nameMap[p.id] = p.name })
      }

      // 댓글을 review_id별로 그룹핑
      const commentsMap = {}
      for (const c of commentsData) {
        if (!commentsMap[c.review_id]) commentsMap[c.review_id] = []
        commentsMap[c.review_id].push({ ...c, _name: nameMap[c.user_id] || '익명' })
      }
      setComments(commentsMap)
      setReviews(data.map(r => ({ ...r, _name: nameMap[r.user_id] || '익명' })))
    } else {
      setReviews([])
      setComments({})
    }
    setReviewsLoading(false)
  }, [id])

  const isJoined = participants.some(p => p.user_id === user?.id)
  const isFull = meeting && participants.length >= meeting.max_participants
  const daysUntil = meeting
    ? Math.ceil((new Date(meeting.date) - new Date()) / (1000 * 60 * 60 * 24))
    : 0

  const isPast = (() => {
    if (!meeting?.date || !meeting?.time) return false
    const meetingEnd = new Date(`${meeting.date}T${meeting.time}`)
    meetingEnd.setHours(meetingEnd.getHours() + 2)
    return new Date() > meetingEnd
  })()
  const myReview = reviews.find(r => r.user_id === user?.id)

  useEffect(() => {
    window.scrollTo(0, 0)
    fetchMeeting({ showLoading: true })
  }, [fetchMeeting])

  useEffect(() => {
    if (isPast) fetchReviews()
  }, [isPast, fetchReviews])

  // 내 기존 후기를 textarea + 사진에 한 번만 세팅
  useEffect(() => {
    if (reviewPrefilled.current || !myReview) return
    setReviewText(myReview.content)
    if (myReview.photos?.length) {
      setReviewPhotos(myReview.photos.map(url => ({ type: 'url', url })))
    }
    reviewPrefilled.current = true
  }, [myReview])

  function toggleComments(reviewId) {
    setCommentsOpen(prev => ({ ...prev, [reviewId]: !prev[reviewId] }))
  }

  async function handleSubmitComment(reviewId) {
    const text = (commentDraft[reviewId] || '').trim()
    if (!text || commentSubmitting[reviewId]) return
    setCommentSubmitting(prev => ({ ...prev, [reviewId]: true }))
    try {
      const { error } = await supabase
        .from('review_comments')
        .insert({ review_id: reviewId, user_id: user.id, content: text })
      if (error) throw error
      setCommentDraft(prev => ({ ...prev, [reviewId]: '' }))
      setCommentsOpen(prev => ({ ...prev, [reviewId]: true }))
      await fetchReviews()
    } catch (err) {
      console.error('[Comment] 오류:', err)
    } finally {
      setCommentSubmitting(prev => ({ ...prev, [reviewId]: false }))
    }
  }

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

  function handlePhotoSelect(e) {
    const files = Array.from(e.target.files)
    setReviewPhotos(prev => {
      const toAdd = files.slice(0, 3 - prev.length).map(file => ({
        type: 'file', file, preview: URL.createObjectURL(file),
      }))
      return [...prev, ...toAdd]
    })
    e.target.value = ''
  }

  function handleRemovePhoto(idx) {
    setReviewPhotos(prev => {
      const next = [...prev]
      if (next[idx].type === 'file') URL.revokeObjectURL(next[idx].preview)
      next.splice(idx, 1)
      return next
    })
  }

  async function uploadReviewPhotos(slots) {
    const urls = []
    for (const slot of slots) {
      if (slot.type === 'url') {
        urls.push(slot.url)
      } else {
        const ext = slot.file.name.split('.').pop()
        const path = `reviews/${id}/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        const { error } = await supabase.storage
          .from('review-photos')
          .upload(path, slot.file, { upsert: true })
        if (error) throw error
        const { data } = supabase.storage.from('review-photos').getPublicUrl(path)
        urls.push(data.publicUrl)
      }
    }
    return urls
  }

  async function handleSubmitReview() {
    if (!reviewText.trim() || reviewSubmitting) return
    setReviewSubmitting(true)
    try {
      const photoUrls = await uploadReviewPhotos(reviewPhotos)
      const { error } = await supabase
        .from('reviews')
        .upsert(
          { meeting_id: id, user_id: user.id, content: reviewText.trim(), photos: photoUrls },
          { onConflict: 'meeting_id,user_id' }
        )
      if (error) throw error
      await fetchReviews()
    } catch (err) {
      console.error('[Review] 오류:', err)
    } finally {
      setReviewSubmitting(false)
    }
  }

  function handleKakaoShare() {
    const ok = initKakao()
    console.log('[Kakao] initKakao 결과:', ok, '| Kakao.Share:', !!window.Kakao?.Share)
    if (!ok || !window.Kakao?.Share) {
      alert('카카오 SDK 초기화 실패. 콘솔을 확인해주세요.')
      return
    }

    const pageUrl = `https://bike-club-teal.vercel.app/meeting/${meeting.id}?t=${Date.now()}`
    const description = `📅 ${formatDate(meeting.date)} ${meeting.time?.slice(0, 5) || ''} · 📍 ${meeting.location} · 👥 ${participants.length}/${meeting.max_participants}명`

    const imageUrl = meeting.image || 'https://bike-club-teal.vercel.app/pwa-512x512.png'

    try {
      console.log("카카오로 넘어갈 URL:", pageUrl)
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

          {/* ── 라이딩 후기 ── */}
          {isPast && (
            <div className="detail-card">
              <h2 className="section-title">🚴 라이딩 후기</h2>

              {/* 작성 폼: 참가자 + 로그인 유저만 */}
              {isJoined && user ? (
                <div className="review-form-wrap">
                  <p className="review-form-label">
                    {myReview ? '✏️ 내 후기 수정하기' : '✍️ 후기 남기기'}
                  </p>
                  <textarea
                    className="form-input form-textarea review-textarea"
                    placeholder="이번 라이딩은 어떠셨나요? 솔직한 후기를 남겨주세요 🚴"
                    value={reviewText}
                    onChange={e => setReviewText(e.target.value)}
                    maxLength={500}
                    rows={4}
                  />
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={handlePhotoSelect}
                  />
                  {reviewPhotos.length > 0 && (
                    <div className="review-photo-preview-grid">
                      {reviewPhotos.map((p, i) => (
                        <div key={i} className="review-photo-preview-item">
                          <img src={p.type === 'file' ? p.preview : p.url} alt="" />
                          <button
                            type="button"
                            className="review-photo-preview-x"
                            onClick={() => handleRemovePhoto(i)}
                          >×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="review-form-footer">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        className="review-photo-add-btn"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={reviewPhotos.length >= 3}
                      >
                        📷 사진 추가 ({reviewPhotos.length}/3)
                      </button>
                      <span className="char-count">{reviewText.length}/500</span>
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleSubmitReview}
                      disabled={!reviewText.trim() || reviewSubmitting}
                    >
                      {reviewSubmitting
                        ? <span className="btn-spinner" />
                        : myReview ? '수정하기' : '후기 등록'}
                    </button>
                  </div>
                </div>
              ) : user ? (
                <p className="review-notice">참가했던 멤버만 후기를 작성할 수 있어요</p>
              ) : (
                <p className="review-notice">로그인 후 후기를 작성할 수 있어요</p>
              )}

              {/* 후기 목록 */}
              {reviewsLoading ? (
                <div className="spinner-wrap" style={{ padding: '20px 0' }}>
                  <div className="spinner" /><p>불러오는 중...</p>
                </div>
              ) : reviews.length === 0 ? (
                <div className="review-empty">
                  <p>아직 후기가 없어요. 첫 번째 후기를 남겨보세요! ✍️</p>
                </div>
              ) : (
                <div className="reviews-list">
                  {reviews.map(r => (
                    <div key={r.id} className={`review-item${r.user_id === user?.id ? ' my-review' : ''}`}>
                      <div className="review-header">
                        <div className="review-avatar">
                          {(r._name || '?')[0].toUpperCase()}
                        </div>
                        <div className="review-author">
                          <span className="review-author-name">
                            {r._name}
                            {r.user_id === user?.id && <span className="my-badge">나</span>}
                            {isNew(r.created_at) && NEW_BADGE}
                          </span>
                          <span className="review-date">{formatReviewDate(r.created_at)}</span>
                        </div>
                      </div>
                      <p className="review-content">{r.content}</p>
                      {r.photos?.length > 0 && (
                        <div className="review-photos-grid">
                          {r.photos.map((url, i) => (
                            <img
                              key={i}
                              src={url}
                              alt=""
                              className="review-photo-thumb"
                              onClick={e => { e.stopPropagation(); setLightboxUrl(url) }}
                            />
                          ))}
                        </div>
                      )}

                      {/* ── 댓글 ── */}
                      {(() => {
                        const reviewComments = comments[r.id] || []
                        const isOpen = commentsOpen[r.id]
                        return (
                          <div className="review-comments-wrap">
                            {reviewComments.length > 0 && (
                              <button
                                className="review-comments-toggle"
                                onClick={() => toggleComments(r.id)}
                              >
                                💬 댓글 {reviewComments.length}개 {isOpen ? '▲' : '▼'}
                              </button>
                            )}
                            {isOpen && (
                              <div className="review-comments-list">
                                {reviewComments.map(c => (
                                  <div key={c.id} className="review-comment-item">
                                    <div className="review-comment-avatar">
                                      {(c._name || '?')[0].toUpperCase()}
                                    </div>
                                    <div className="review-comment-body">
                                      <div className="review-comment-header">
                                        <span className="review-comment-name">{c._name}</span>
                                        {isNew(c.created_at) && NEW_BADGE}
                                        <span className="review-comment-date">{formatReviewDate(c.created_at)}</span>
                                      </div>
                                      <p className="review-comment-content">{c.content}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            {user && isJoined && (
                              <div className="review-comment-form">
                                <input
                                  className="review-comment-input"
                                  type="text"
                                  placeholder="댓글을 입력하세요..."
                                  value={commentDraft[r.id] || ''}
                                  onChange={e => setCommentDraft(prev => ({ ...prev, [r.id]: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') handleSubmitComment(r.id) }}
                                  maxLength={200}
                                />
                                <button
                                  className="review-comment-submit"
                                  onClick={() => handleSubmitComment(r.id)}
                                  disabled={!commentDraft[r.id]?.trim() || commentSubmitting[r.id]}
                                >
                                  {commentSubmitting[r.id] ? '...' : '등록'}
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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
              className={`btn btn-lg full-width ${
                isPast && isJoined ? 'btn-disabled'
                : isJoined ? 'btn-outline'
                : isFull ? 'btn-disabled'
                : 'btn-primary'
              }`}
              onClick={isPast ? undefined : handleJoin}
              disabled={isPast || (isFull && !isJoined) || joining}
              style={isPast && isJoined ? { opacity: 0.45, cursor: 'default' } : undefined}
            >
              {joining
                ? <span className="btn-spinner" />
                : isPast && isJoined ? '✓ 참가했던 모임'
                : isJoined ? '✓ 참가 중 (취소하기)'
                : isFull ? '모집 마감'
                : '참가하기 🚴'}
            </button>
            {!isPast && !isJoined && !isFull && (
              <p className="join-hint">참가하면 내 프로필에서 확인할 수 있어요</p>
            )}
            {joinError && (
              <p className="join-error">⚠️ {joinError}</p>
            )}

            {!isPast && (
              <button className="kakao-share-btn" onClick={handleKakaoShare}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M9 1.5C4.86 1.5 1.5 4.19 1.5 7.5c0 2.1 1.26 3.94 3.15 5.04L3.9 15l3.21-1.73c.61.1 1.25.16 1.89.16 4.14 0 7.5-2.69 7.5-6s-3.36-6-7.5-6z" fill="#000000"/>
                </svg>
                카카오톡으로 공유
              </button>
            )}
          </div>

          <WeatherCard meeting={meeting} />
        </div>
      </div>

      {lightboxUrl && (
        <div className="review-lightbox" onClick={() => setLightboxUrl(null)}>
          <button className="review-lightbox-close" onClick={() => setLightboxUrl(null)}>×</button>
          <img src={lightboxUrl} alt="" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
