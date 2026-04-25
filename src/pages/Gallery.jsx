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

  // ESC 키로 라이트박스 닫기
  useEffect(() => {
    if (!selected) return
    function onKey(e) { if (e.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

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

    // 세션에서 uid를 직접 확인
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id

    console.group('[handleUpload]')
    console.log('uid:', uid, '| state user.id:', user?.id)

    if (!uid) {
      setUploadError('로그인 세션이 만료됐습니다. 다시 로그인해주세요.')
      setUploading(false)
      console.groupEnd()
      return
    }

    // --- 1) Storage 업로드 ---
    const ext = (pendingFile.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${uid}/${Date.now()}.${ext}`
    let publicUrl = ''

    try {
      const { error: storageErr } = await supabase.storage
        .from('photos')
        .upload(path, pendingFile, { contentType: pendingFile.type })

      if (storageErr) {
        console.error('[storage] error:', storageErr)
        throw new Error(`스토리지 업로드 실패: ${storageErr.message}`)
      }

      publicUrl = supabase.storage.from('photos').getPublicUrl(path).data.publicUrl
      console.log('[storage] 성공, url:', publicUrl)
    } catch (err) {
      setUploadError(err.message)
      setUploading(false)
      console.groupEnd()
      return
    }

    // --- 2) photos 테이블 INSERT ---
    try {
      const payload = {
        url: publicUrl,
        title: uploadForm.title.trim(),
        meeting_title: uploadForm.meetingTitle || '',
        uploader_name: profile?.name || '',
        uploaded_by: uid,
      }
      console.log('[db] insert payload:', payload)

      const { data, error: dbErr } = await supabase
        .from('photos')
        .insert(payload)
        .select()
        .single()

      console.log('[db] result:', data, '| error:', dbErr)

      if (dbErr) {
        // 스토리지에 올라간 파일 롤백
        await supabase.storage.from('photos').remove([path])
        throw new Error(`DB 저장 실패 (${dbErr.code}): ${dbErr.message}`)
      }

      console.log('✅ 업로드 완료')
      console.groupEnd()
      await fetchPhotos()
      setShowUploadModal(false)
      setPendingFile(null)
      setPendingPreview(null)
    } catch (err) {
      console.error('❌ DB 저장 실패:', err)
      console.groupEnd()
      setUploadError(err.message)
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
            {filtered.map((photo) => {
              const isLiked = photo.photo_likes?.some(l => l.user_id === user?.id)
              const likeCount = photo.photo_likes?.length || 0
              return (
                <div key={photo.id} className="gallery-item">
                  <img src={photo.url} alt={photo.title} className="gallery-img" loading="lazy" onClick={() => setSelected(photo)} />
                  <div className="gallery-item-overlay">
                    <div className="gallery-item-info">
                      <p className="gallery-item-title">{photo.title}</p>
                      <p className="gallery-item-meta">{photo.uploader_name} · {formatDate(photo.created_at)}</p>
                    </div>
                    <div className="gallery-item-actions">
                      <button className={`like-btn ${isLiked ? 'liked' : ''}`} onClick={e => { e.stopPropagation(); handleLike(photo.id) }}>
                        {isLiked ? '❤️' : '🤍'} {likeCount}
                      </button>
                      {photo.uploaded_by === user?.id && (
                        <button className="delete-btn" onClick={e => { e.stopPropagation(); handleDelete(photo.id) }} title="삭제">🗑</button>
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
          <div className="modal-backdrop lightbox-backdrop" onClick={() => setSelected(null)}>
            <div className="lightbox" onClick={e => e.stopPropagation()}>
              <button className="modal-close lightbox-close" onClick={() => setSelected(null)}>✕</button>
              <div className="lightbox-img-wrap">
                <img src={selected.url} alt={selected.title} className="lightbox-img" />
              </div>
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
