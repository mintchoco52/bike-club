import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const PRESET_LOCATIONS = [
  { name: '영산강 자전거길 (승촌보)',     lat: 35.0715, lng: 126.8380 },
  { name: '황룡강 생태공원',              lat: 35.1394, lng: 126.7897 },
  { name: '광주호 호수공원',              lat: 35.2044, lng: 126.9467 },
  { name: '무등산 증심사 탐방지원센터',   lat: 35.1381, lng: 126.9935 },
  { name: '광주천 자전거길 (사직공원)',   lat: 35.1468, lng: 126.9070 },
  { name: '중외공원 자전거도로',          lat: 35.1741, lng: 126.9148 },
  { name: '상무시민공원',                 lat: 35.1535, lng: 126.8487 },
  { name: '광주 월드컵경기장 광장',       lat: 35.1679, lng: 126.8392 },
  { name: '극락강 자전거길 (극락교)',     lat: 35.1289, lng: 126.8374 },
  { name: '서창 들녁 자전거길',           lat: 35.0904, lng: 126.8341 },
  { name: '직접 입력', lat: null, lng: null },
]

export default function CreateMeeting() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [locationMode, setLocationMode] = useState('preset')

  const [form, setForm] = useState({
    title: '', date: '', time: '09:00',
    locationName: '', lat: '', lng: '',
    description: '', maxParticipants: 10,
    difficulty: '초급', distance: '',
  })
  const [errors, setErrors] = useState({})

  function setField(key, val) {
    setForm(f => ({ ...f, [key]: val }))
    setErrors(e => ({ ...e, [key]: undefined }))
  }

  function handleLocationPreset(e) {
    const selected = PRESET_LOCATIONS.find(l => l.name === e.target.value)
    if (!selected) return
    if (selected.name === '직접 입력') {
      setLocationMode('custom')
      setForm(f => ({ ...f, locationName: '', lat: '', lng: '' }))
    } else {
      setLocationMode('preset')
      setForm(f => ({ ...f, locationName: selected.name, lat: selected.lat, lng: selected.lng }))
    }
  }

  function validate() {
    const e = {}
    if (!form.title.trim()) e.title = '제목을 입력해주세요'
    if (!form.date) e.date = '날짜를 선택해주세요'
    if (!form.locationName.trim()) e.locationName = '장소를 선택해주세요'
    if (!form.description.trim()) e.description = '설명을 입력해주세요'
    if (!form.distance.trim()) e.distance = '거리를 입력해주세요'
    return e
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSubmitting(true)
    setSubmitError('')
    try {
      const meetingData = {
        title: form.title.trim(),
        date: form.date,
        time: form.time,
        location: form.locationName.trim(),
        lat: parseFloat(form.lat) || 37.5665,
        lng: parseFloat(form.lng) || 126.9780,
        description: form.description.trim(),
        max_participants: parseInt(form.maxParticipants),
        difficulty: form.difficulty,
        distance: form.distance.trim(),
        image: `https://picsum.photos/seed/${Date.now()}/600/300`,
        creator_name: profile?.name || '',
        created_by: user.id,
      }

      const { data: meeting, error: meetErr } = await supabase
        .from('meetings')
        .insert(meetingData)
        .select()
        .single()
      if (meetErr) throw meetErr

      await supabase
        .from('meeting_participants')
        .insert({ meeting_id: meeting.id, user_id: user.id, user_name: profile?.name || '' })

      setSubmitted(true)
      setTimeout(() => navigate(`/meeting/${meeting.id}`), 1200)
    } catch (err) {
      setSubmitError(err.message || '모임 생성에 실패했습니다')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="page center-page">
        <div className="success-card">
          <div className="success-icon">🎉</div>
          <h2>모임이 생성되었습니다!</h2>
          <p>잠시 후 모임 페이지로 이동합니다...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page form-page">
      <div className="container narrow">
        <div className="page-header">
          <h1>모임 만들기</h1>
          <p>새로운 자전거 모임을 만들어 크루를 모집하세요</p>
        </div>

        {submitError && <div className="auth-error" style={{ marginBottom: 16 }}>{submitError}</div>}

        <form className="form-card" onSubmit={handleSubmit} noValidate>
          <div className="form-section">
            <h3 className="form-section-title">기본 정보</h3>
            <div className="form-group">
              <label className="form-label">모임 제목 <span className="required">*</span></label>
              <input className={`form-input ${errors.title ? 'error' : ''}`} type="text"
                placeholder="예: 한강 새벽 라이딩" value={form.title}
                onChange={e => setField('title', e.target.value)} maxLength={50} />
              {errors.title && <span className="form-error">{errors.title}</span>}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">날짜 <span className="required">*</span></label>
                <input className={`form-input ${errors.date ? 'error' : ''}`} type="date"
                  value={form.date} onChange={e => setField('date', e.target.value)}
                  min={new Date().toISOString().split('T')[0]} />
                {errors.date && <span className="form-error">{errors.date}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">시간</label>
                <input className="form-input" type="time" value={form.time}
                  onChange={e => setField('time', e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">난이도</label>
                <select className="form-input" value={form.difficulty} onChange={e => setField('difficulty', e.target.value)}>
                  <option>초급</option><option>중급</option><option>고급</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">라이딩 거리 <span className="required">*</span></label>
                <input className={`form-input ${errors.distance ? 'error' : ''}`} type="text"
                  placeholder="예: 30km" value={form.distance}
                  onChange={e => setField('distance', e.target.value)} />
                {errors.distance && <span className="form-error">{errors.distance}</span>}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">최대 참가 인원</label>
              <div className="range-wrap">
                <input type="range" min={2} max={50} value={form.maxParticipants}
                  onChange={e => setField('maxParticipants', e.target.value)} className="range-input" />
                <span className="range-value">{form.maxParticipants}명</span>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">장소</h3>
            <div className="form-group">
              <label className="form-label">장소 선택 <span className="required">*</span></label>
              <select className="form-input" onChange={handleLocationPreset} defaultValue="">
                <option value="" disabled>장소를 선택하세요</option>
                {PRESET_LOCATIONS.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
              </select>
            </div>
            {locationMode === 'custom' && (
              <>
                <div className="form-group">
                  <label className="form-label">장소명</label>
                  <input className={`form-input ${errors.locationName ? 'error' : ''}`} type="text"
                    placeholder="예: 잠실 롯데월드 앞" value={form.locationName}
                    onChange={e => setField('locationName', e.target.value)} />
                  {errors.locationName && <span className="form-error">{errors.locationName}</span>}
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">위도</label>
                    <input className="form-input" type="number" step="0.0001" placeholder="37.5665"
                      value={form.lat} onChange={e => setField('lat', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">경도</label>
                    <input className="form-input" type="number" step="0.0001" placeholder="126.9780"
                      value={form.lng} onChange={e => setField('lng', e.target.value)} />
                  </div>
                </div>
              </>
            )}
            {locationMode === 'preset' && form.locationName && (
              <div className="location-confirm">
                <span className="meta-icon">📍</span>
                <strong>{form.locationName}</strong>
                <span className="text-muted"> 선택됨</span>
              </div>
            )}
            {locationMode === 'preset' && errors.locationName && (
              <span className="form-error">{errors.locationName}</span>
            )}
          </div>

          <div className="form-section">
            <h3 className="form-section-title">모임 설명</h3>
            <div className="form-group">
              <label className="form-label">상세 설명 <span className="required">*</span></label>
              <textarea className={`form-input form-textarea ${errors.description ? 'error' : ''}`}
                placeholder="코스, 준비물, 주의사항 등을 설명해주세요."
                value={form.description} onChange={e => setField('description', e.target.value)}
                rows={5} maxLength={500} />
              <div className="char-count">{form.description.length}/500</div>
              {errors.description && <span className="form-error">{errors.description}</span>}
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>취소</button>
            <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
              {submitting ? <span className="btn-spinner" /> : '모임 만들기 🚴'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
