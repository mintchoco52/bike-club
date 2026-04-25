import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Gallery() {
  const { user, profile } = useAuth()
  const fileRef = useRef()
  const [photos, setPhotos] = useState([])
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [filterBy, setFilterBy] = useState('전체')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [pendingFile, setPendingFile] = useState(null)
  const [pendingPreview, setPendingPreview] = useState(null)
  const [uploadForm, setUploadForm] = useState({ title: '', meetingTitle: '' })
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const fetchPhotos = useCallback(async () => {
    const { data } = await supabase
      .from('photos')
      .select('*, photo_likes(user_id)')
      .order('created_at', { ascending: false })
    setPhotos(data || [])
  }, [])

  useEffect(() => {
    async function init() {
      await fetchPhotos()
      const { data } = await supabase.from('meetings').select('id, title').order('date', { ascending: false })
      setMeetings(data || [])
      setLoading(false)
    }
    init()
  }, [fetchPhotos])

  const filterTitles = ['전체', ...new Set(photos.map(p => p.meeting_title).filter(Boolean))]
  const filtered = filterBy === '전체' ? photos : photos.filter(p => p.meeting_title === filterBy)

  function handleFileSelect(e) {
    const file = e.target.files[0]
    if (!file) return
    setPendingFile(file)
    setPendingPreview(URL.createObjectURL(file))
    setUploadForm({ title: '', meetingTitle: meetings[0]?.title || '' })
    setUploadError('')
    setShowUploadModal(true)
    e.target.value = ''
  }

  async function handleUpload() {
    if (!pendingFile || !uploadForm.title.trim()) return
    setUploading(true)
    setUploadError('')
    try {
      const ext = pendingFile.name.split('.').pop()
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error: storageErr } = await supabase.storage
        .from('photos')
        .upload(path, pendingFile, { contentType: pendingFile.type })
      if (storageErr) throw storageErr

      const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(path)

      const { error: dbErr } = await supabase.from('photos').insert({
        url: publicUrl,
        title: uploadForm.title.trim(),
        meeting_title: uploadForm.meetingTitle,
        uploader_name: profile?.name || '',
        uploaded_by: user.id,
      })
      if (dbErr) throw dbErr

      await fetchPhotos()
      setShowUploadModal(false)
      setPendingFile(null)
      setPendingPreview(null)
    } catch (err) {
      setUploadError(err.message || '업로드 실패. Storage 버킷(photos)이 생성되어 있는지 확인하세요.')
    } finally {
      setUploading(false)
    }
  }

  async function handleLike(photoId) {
    if (!user) return
    const photo = photos.find(p => p.id === photoId)
    const isLiked = photo?.photo_likes?.some(l => l.user_id === user.id)
    if (isLiked) {
      await supabase.from('photo_likes').delete().eq('photo_id', photoId).eq('user_id', user.id)
    } else {
      await supabase.from('photo_likes').insert({ photo_id: photoId, user_id: user.id })
    }
    await fetchPhotos()
    if (selected?.id === photoId) {
      const updated = await supabase.from('photos').select('*, photo_likes(user_id)').eq('id', photoId).single()
      setSelected(updated.data)
    }
  }

  async function handleDelete(photoId) {
    if (selected?.id === photoId) setSelected(null)
    await supabase.from('photos').delete().eq('id', photoId).eq('uploaded_by', user.id)
    setPhotos(prev => prev.filter(p => p.id !== photoId))
  }

  function formatDate(str) {
    return new Date(str).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  return (
    <div className="page gallery-page">
      <div className="container">
        <div className="page-header gallery-header">
          <div>
            <h1>라이딩 갤러리 📷</h1>
            <p>함께한 순간들을 기록하고 공유해보세요</p>
          </div>
          <button className="btn btn-primary" onClick={() => fileRef.current.click()}>+ 사진 업로드</button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileSelect} />
        </div>

        <div className="gallery-filter-bar">
          {filterTitles.map(t => (
            <button key={t} className={`filter-tab ${filterBy === t ? 'active' : ''}`} onClick={() => setFilterBy(t)}>
              {t}
            </button>
          ))}
        </div>

        <div className="gallery-stats-bar">
          <span>사진 {filtered.length}장</span>
          <span>❤️ {filtered.reduce((s, p) => s + (p.photo_likes?.length || 0), 0)} 좋아요</span>
        </div>

        {loading ? (
          <div className="center-page" style={{ minHeight: 300 }}>
            <div className="spinner-wrap"><div className="spinner" /><p>불러오는 중...</p></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p>📷 아직 사진이 없습니다</p>
            <button className="btn btn-primary" onClick={() => fileRef.current.click()}>첫 사진 올리기</button>
          </div>
        ) : (
          <div className="gallery-masonry">
            {filtered.map((photo, i) => {
              const isLiked = photo.photo_likes?.some(l => l.user_id === user?.id)
              const likeCount = photo.photo_likes?.length || 0
              return (
                <div key={photo.id} className={`gallery-item ${i % 5 === 0 || i % 5 === 3 ? 'tall' : ''}`}>
                  <img src={photo.url} alt={photo.title} className="gallery-img" loading="lazy" onClick={() => setSelected(photo)} />
                  <div className="gallery-item-overlay">
                    <div className="gallery-item-info">
                      <p className="gallery-item-title">{photo.title}</p>
                      <p className="gallery-item-meta">{photo.uploader_name} · {formatDate(photo.created_at)}</p>
                    </div>
                    <div className="gallery-item-actions">
                      <button className={`like-btn ${isLiked ? 'liked' : ''}`} onClick={() => handleLike(photo.id)}>
                        {isLiked ? '❤️' : '🤍'} {likeCount}
                      </button>
                      {photo.uploaded_by === user?.id && (
                        <button className="delete-btn" onClick={() => handleDelete(photo.id)} title="삭제">🗑</button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Upload modal */}
      {showUploadModal && (
        <div className="modal-backdrop" onClick={() => setShowUploadModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>사진 업로드</h3>
              <button className="modal-close" onClick={() => setShowUploadModal(false)}>✕</button>
            </div>
            {pendingPreview && <img src={pendingPreview} alt="미리보기" className="upload-preview" />}
            <div className="modal-body">
              {uploadError && <div className="auth-error" style={{ marginBottom: 12 }}>{uploadError}</div>}
              <div className="form-group">
                <label className="form-label">사진 제목 *</label>
                <input className="form-input" type="text" placeholder="어떤 순간인가요?"
                  value={uploadForm.title} onChange={e => setUploadForm(f => ({ ...f, title: e.target.value }))}
                  maxLength={50} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">관련 모임</label>
                <select className="form-input" value={uploadForm.meetingTitle}
                  onChange={e => setUploadForm(f => ({ ...f, meetingTitle: e.target.value }))}>
                  <option value="">선택 안함</option>
                  {meetings.map(m => <option key={m.id} value={m.title}>{m.title}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowUploadModal(false)}>취소</button>
              <button className="btn btn-primary" onClick={handleUpload} disabled={!uploadForm.title.trim() || uploading}>
                {uploading ? <span className="btn-spinner" /> : '업로드'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {selected && (() => {
        const isLiked = selected.photo_likes?.some(l => l.user_id === user?.id)
        const likeCount = selected.photo_likes?.length || 0
        return (
          <div className="modal-backdrop" onClick={() => setSelected(null)}>
            <div className="lightbox" onClick={e => e.stopPropagation()}>
              <button className="modal-close lightbox-close" onClick={() => setSelected(null)}>✕</button>
              <img src={selected.url} alt={selected.title} className="lightbox-img" />
              <div className="lightbox-info">
                <div>
                  <h3>{selected.title}</h3>
                  {selected.meeting_title && <p className="lightbox-meeting">📍 {selected.meeting_title}</p>}
                  <p className="lightbox-meta">{selected.uploader_name} · {formatDate(selected.created_at)}</p>
                </div>
                <button className={`like-btn lg ${isLiked ? 'liked' : ''}`} onClick={() => handleLike(selected.id)}>
                  {isLiked ? '❤️' : '🤍'} {likeCount}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
