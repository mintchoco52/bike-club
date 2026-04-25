import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Profile() {
  const { user, profile, updateProfile, uploadAvatar } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef()
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editBio, setEditBio] = useState('')
  const [saving, setSaving] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const [joinedMeetings, setJoinedMeetings] = useState([])
  const [myPhotos, setMyPhotos] = useState([])
  const [loadingData, setLoadingData] = useState(true)

  useEffect(() => {
    if (!user) return
    Promise.all([fetchJoinedMeetings(), fetchMyPhotos()]).finally(() => setLoadingData(false))
  }, [user])

  useEffect(() => {
    if (profile) {
      setEditName(profile.name || '')
      setEditBio(profile.bio || '')
    }
  }, [profile])

  async function fetchJoinedMeetings() {
    const { data } = await supabase
      .from('meeting_participants')
      .select('meeting_id, meetings(*)')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: false })
    setJoinedMeetings((data || []).map(d => d.meetings).filter(Boolean))
  }

  async function fetchMyPhotos() {
    const { data } = await supabase
      .from('photos')
      .select('*, photo_likes(user_id)')
      .eq('uploaded_by', user.id)
      .order('created_at', { ascending: false })
    setMyPhotos(data || [])
  }

  async function handleSave() {
    if (!editName.trim()) return
    setSaving(true)
    try {
      await updateProfile({ name: editName.trim(), bio: editBio.trim() })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleAvatarChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setAvatarError('')
    setAvatarUploading(true)
    try {
      await uploadAvatar(file)
    } catch (err) {
      setAvatarError('아바타 업로드 실패: ' + (err.message || '버킷이 설정되지 않았습니다'))
    } finally {
      setAvatarUploading(false)
    }
    e.target.value = ''
  }

  function formatDate(str) {
    return new Date(str).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  function formatShortDate(str) {
    return new Date(str).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="page profile-page">
      <div className="container narrow">
        <div className="profile-hero-card">
          <div className="profile-avatar-wrap">
            <div className="profile-avatar">
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="프로필 사진" />
                : <span className="avatar-letter">{(profile?.name || user?.email || '?')[0].toUpperCase()}</span>
              }
              {avatarUploading && <div className="avatar-uploading"><div className="spinner" /></div>}
            </div>
            <button className="avatar-edit-btn" onClick={() => fileRef.current.click()} disabled={avatarUploading}>
              📷
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
          </div>

          {avatarError && <p className="form-error" style={{ marginBottom: 8 }}>{avatarError}</p>}

          {editing ? (
            <div className="profile-edit-form">
              <input
                className="form-input profile-name-input"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="이름"
                maxLength={20}
              />
              <textarea
                className="form-input profile-bio-input"
                value={editBio}
                onChange={e => setEditBio(e.target.value)}
                placeholder="자기소개를 입력하세요"
                rows={3}
                maxLength={150}
              />
              <div className="edit-actions">
                <button className="btn btn-outline btn-sm" onClick={() => { setEditing(false); setEditName(profile?.name || ''); setEditBio(profile?.bio || '') }}>취소</button>
                <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                  {saving ? <span className="btn-spinner" /> : '저장'}
                </button>
              </div>
            </div>
          ) : (
            <div className="profile-info">
              <h1 className="profile-name">{profile?.name || '이름 없음'}</h1>
              <p className="profile-bio">{profile?.bio || '자기소개를 작성해보세요'}</p>
              <p className="profile-joined">🗓 {profile?.created_at ? formatDate(profile.created_at) : ''} 가입</p>
              <button className="btn btn-outline btn-sm" onClick={() => setEditing(true)}>프로필 편집</button>
            </div>
          )}

          <div className="profile-stats">
            <div className="stat-box"><strong>{joinedMeetings.length}</strong><span>참가 모임</span></div>
            <div className="stat-box"><strong>{myPhotos.length}</strong><span>업로드 사진</span></div>
            <div className="stat-box">
              <strong>{myPhotos.reduce((s, p) => s + (p.photo_likes?.length || 0), 0)}</strong>
              <span>받은 좋아요</span>
            </div>
          </div>
        </div>

        <div className="profile-section">
          <div className="section-header">
            <h2>참가한 모임 <span className="count-badge">{joinedMeetings.length}</span></h2>
          </div>
          {loadingData ? (
            <div className="spinner-wrap"><div className="spinner" /></div>
          ) : joinedMeetings.length === 0 ? (
            <div className="empty-state small">
              <p>아직 참가한 모임이 없어요</p>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/')}>모임 찾기</button>
            </div>
          ) : (
            <div className="joined-meetings-list">
              {joinedMeetings.map(m => (
                <div key={m.id} className="joined-meeting-item" onClick={() => navigate(`/meeting/${m.id}`)}>
                  <img src={m.image || `https://picsum.photos/seed/${m.id}/140/100`} alt={m.title} className="joined-meeting-img" />
                  <div className="joined-meeting-info">
                    <h4>{m.title}</h4>
                    <p><span className="meta-icon">📅</span>{formatShortDate(m.date)} {m.time?.slice(0, 5)}</p>
                    <p><span className="meta-icon">📍</span>{m.location}</p>
                  </div>
                  <div className="joined-meeting-badge">
                    {m.created_by === user?.id
                      ? <span className="badge badge-blue">주최</span>
                      : <span className="badge badge-green">참가</span>
                    }
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {myPhotos.length > 0 && (
          <div className="profile-section">
            <div className="section-header">
              <h2>내가 올린 사진 <span className="count-badge">{myPhotos.length}</span></h2>
            </div>
            <div className="profile-photo-grid">
              {myPhotos.slice(0, 6).map(p => (
                <div key={p.id} className="profile-photo-item" onClick={() => navigate('/gallery')}>
                  <img src={p.url} alt={p.title} />
                  <div className="photo-overlay">
                    <span>❤️ {p.photo_likes?.length || 0}</span>
                  </div>
                </div>
              ))}
            </div>
            {myPhotos.length > 6 && (
              <button className="btn btn-ghost full-width" onClick={() => navigate('/gallery')}>
                갤러리에서 모두 보기 ({myPhotos.length}장)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
