import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

function cleanFileName(name) {
  return name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').trim() || '사진'
}

export default function Gallery() {
  const { user, profile } = useAuth()
  const fileRef = useRef()
  const commentsEndRef = useRef()

  const [photos, setPhotos] = useState([])
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [filterBy, setFilterBy] = useState('전체')

  // 다중 업로드 상태
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [pendingFiles, setPendingFiles] = useState([]) // [{file, preview, title}]
  const [uploadMeeting, setUploadMeeting] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null) // {current, total}
  const [uploadError, setUploadError] = useState('')

  // 댓글 상태
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)

  const fetchPhotos = useCallback(async () => {
    const { data } = await supabase
      .from('photos')
      .select('*, photo_likes(user_id), photo_comments(id)')
      .order('created_at', { ascending: false })
    setPhotos(data || [])
  }, [])

  const fetchComments = useCallback(async (photoId) => {
    const { data } = await supabase
      .from('photo_comments')
      .select('*')
      .eq('photo_id', photoId)
      .order('created_at', { ascending: true })
    setComments(data || [])
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

  // 사진 선택 시 댓글 로드
  useEffect(() => {
    if (!selected) { setComments([]); setCommentText(''); return }
    fetchComments(selected.id)
  }, [selected?.id, fetchComments])

  // 댓글 추가 시 스크롤
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  const filterTitles = ['전체', ...new Set(photos.map(p => p.meeting_title).filter(Boolean))]
  const filtered = filterBy === '전체' ? photos : photos.filter(p => p.meeting_title === filterBy)

  // 라이트박스 현재 위치
  const currentIdx = selected ? filtered.findIndex(p => p.id === selected.id) : -1
  const hasPrev = currentIdx > 0
  const hasNext = currentIdx < filtered.length - 1

  // 키보드: ESC 닫기, ← → 탐색
  useEffect(() => {
    if (!selected) return
    function onKey(e) {
      if (e.key === 'Escape') setSelected(null)
      if (e.key === 'ArrowLeft' && currentIdx > 0) setSelected(filtered[currentIdx - 1])
      if (e.key === 'ArrowRight' && currentIdx < filtered.length - 1) setSelected(filtered[currentIdx + 1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, currentIdx, filtered])

  // ── 파일 선택 (다중) ──────────────────────────────────
  function handleFileSelect(e) {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setPendingFiles(files.map(f => ({
      file: f,
      preview: URL.createObjectURL(f),
      title: cleanFileName(f.name),
    })))
    setUploadMeeting('')
    setUploadError('')
    setShowUploadModal(true)
    e.target.value = ''
  }

  function closeUploadModal() {
    pendingFiles.forEach(pf => URL.revokeObjectURL(pf.preview))
    setPendingFiles([])
    setShowUploadModal(false)
    setUploadError('')
    setUploadProgress(null)
  }

  // ── 업로드 (순차 처리) ────────────────────────────────
  async function handleUpload() {
    if (!pendingFiles.length) return
    setUploading(true)
    setUploadError('')

    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) {
      setUploadError('로그인 세션이 만료됐습니다. 다시 로그인해주세요.')
      setUploading(false)
      return
    }

    let failCount = 0
    for (let i = 0; i < pendingFiles.length; i++) {
      const { file, title } = pendingFiles[i]
      setUploadProgress({ current: i + 1, total: pendingFiles.length })

      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${uid}/${Date.now()}_${i}.${ext}`

      try {
        const { error: storageErr } = await supabase.storage
          .from('photos')
          .upload(path, file, { contentType: file.type })
        if (storageErr) throw new Error(storageErr.message)

        const publicUrl = supabase.storage.from('photos').getPublicUrl(path).data.publicUrl

        const { error: dbErr } = await supabase.from('photos').insert({
          url: publicUrl,
          title: title.trim() || '사진',
          meeting_title: uploadMeeting || '',
          uploader_name: profile?.name || '',
          uploaded_by: uid,
        })
        if (dbErr) {
          await supabase.storage.from('photos').remove([path])
          failCount++
        }
      } catch {
        failCount++
      }
    }

    await fetchPhotos()
    setUploading(false)
    setUploadProgress(null)

    if (failCount > 0) {
      setUploadError(`${failCount}장 업로드에 실패했습니다.`)
    } else {
      closeUploadModal()
    }
  }

  // ── 좋아요 ────────────────────────────────────────────
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
      const { data } = await supabase.from('photos').select('*, photo_likes(user_id), photo_comments(id)').eq('id', photoId).single()
      setSelected(data)
    }
  }

  // ── 사진 삭제 ─────────────────────────────────────────
  async function handleDelete(photoId) {
    if (selected?.id === photoId) setSelected(null)
    await supabase.from('photos').delete().eq('id', photoId).eq('uploaded_by', user.id)
    setPhotos(prev => prev.filter(p => p.id !== photoId))
  }

  // ── 댓글 ─────────────────────────────────────────────
  async function handleAddComment(e) {
    e.preventDefault()
    if (!commentText.trim() || !user || commentSubmitting) return
    setCommentSubmitting(true)
    const { data } = await supabase
      .from('photo_comments')
      .insert({ photo_id: selected.id, user_id: user.id, user_name: profile?.name || user.email, content: commentText.trim() })
      .select().single()
    if (data) setComments(prev => [...prev, data])
    setCommentText('')
    setCommentSubmitting(false)
  }

  async function handleDeleteComment(commentId) {
    await supabase.from('photo_comments').delete().eq('id', commentId).eq('user_id', user.id)
    setComments(prev => prev.filter(c => c.id !== commentId))
  }

  // ── 날짜 포맷 ─────────────────────────────────────────
  function formatDate(str) {
    return new Date(str).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  function formatCommentTime(str) {
    const diff = Date.now() - new Date(str).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return '방금'
    if (mins < 60) return `${mins}분 전`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}시간 전`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}일 전`
    return new Date(str).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
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
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileSelect} />
        </div>

        <div className="gallery-filter-bar">
          {filterTitles.map(t => (
            <button key={t} className={`filter-tab ${filterBy === t ? 'active' : ''}`} onClick={() => setFilterBy(t)}>{t}</button>
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
              const commentCount = photo.photo_comments?.length || 0
              return (
                <div key={photo.id} className="gallery-item" onClick={() => setSelected(photo)}>
                  <img src={photo.url} alt={photo.title} className="gallery-img" loading="lazy" />
                  <div className="gallery-item-overlay">
                    <div className="gallery-item-info">
                      <p className="gallery-item-title">{photo.title}</p>
                      <p className="gallery-item-meta">{photo.uploader_name} · {formatDate(photo.created_at)}</p>
                    </div>
                    <div className="gallery-item-actions">
                      <button className={`like-btn ${isLiked ? 'liked' : ''}`} onClick={e => { e.stopPropagation(); handleLike(photo.id) }}>
                        {isLiked ? '❤️' : '🤍'} {likeCount}
                      </button>
                      <span className="comment-count-badge">💬 {commentCount}</span>
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

      {/* ── 다중 업로드 모달 ── */}
      {showUploadModal && (
        <div className="modal-backdrop" onClick={closeUploadModal}>
          <div className="modal upload-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>사진 업로드 {pendingFiles.length > 1 ? `(${pendingFiles.length}장)` : ''}</h3>
              <button className="modal-close" onClick={closeUploadModal}>✕</button>
            </div>
            <div className="modal-body">
              {uploadError && <div className="auth-error" style={{ marginBottom: 12 }}>{uploadError}</div>}
              <div className="upload-grid">
                {pendingFiles.map((pf, i) => (
                  <div key={i} className="upload-grid-item">
                    <img src={pf.preview} alt="" className="upload-grid-thumb" />
                    <input
                      className="form-input upload-grid-title"
                      value={pf.title}
                      onChange={e => setPendingFiles(prev => prev.map((f, j) => j === i ? { ...f, title: e.target.value } : f))}
                      placeholder="제목"
                      maxLength={50}
                    />
                  </div>
                ))}
              </div>
              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label">관련 모임</label>
                <select className="form-input" value={uploadMeeting} onChange={e => setUploadMeeting(e.target.value)}>
                  <option value="">선택 안함</option>
                  {meetings.map(m => <option key={m.id} value={m.title}>{m.title}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={closeUploadModal} disabled={uploading}>취소</button>
              <button className="btn btn-primary" onClick={handleUpload} disabled={uploading}>
                {uploading && uploadProgress
                  ? `${uploadProgress.current} / ${uploadProgress.total} 업로드 중...`
                  : uploading
                    ? <span className="btn-spinner" />
                    : `${pendingFiles.length}장 업로드`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 라이트박스 ── */}
      {selected && (() => {
        const isLiked = selected.photo_likes?.some(l => l.user_id === user?.id)
        const likeCount = selected.photo_likes?.length || 0
        return (
          <div className="modal-backdrop lightbox-backdrop" onClick={() => setSelected(null)}>
            <div className="lightbox" onClick={e => e.stopPropagation()}>
              <button className="modal-close lightbox-close" onClick={() => setSelected(null)}>✕</button>

              {/* 좌측: 사진 + 화살표 */}
              <div className="lightbox-photo">
                {hasPrev && (
                  <button className="lightbox-nav lightbox-nav-prev" onClick={e => { e.stopPropagation(); setSelected(filtered[currentIdx - 1]) }}>‹</button>
                )}
                <img src={selected.url} alt={selected.title} className="lightbox-img" />
                {hasNext && (
                  <button className="lightbox-nav lightbox-nav-next" onClick={e => { e.stopPropagation(); setSelected(filtered[currentIdx + 1]) }}>›</button>
                )}
                {filtered.length > 1 && (
                  <span className="lightbox-counter">{currentIdx + 1} / {filtered.length}</span>
                )}
              </div>

              {/* 우측: 정보 + 댓글 */}
              <div className="lightbox-panel">
                <div className="lightbox-info">
                  <div className="lightbox-info-text">
                    <h3>{selected.title}</h3>
                    {selected.meeting_title && <p className="lightbox-meeting">📍 {selected.meeting_title}</p>}
                    <p className="lightbox-meta">{selected.uploader_name} · {formatDate(selected.created_at)}</p>
                  </div>
                  <button className={`like-btn lg ${isLiked ? 'liked' : ''}`} onClick={() => handleLike(selected.id)}>
                    {isLiked ? '❤️' : '🤍'} {likeCount}
                  </button>
                </div>

                <div className="lightbox-comments">
                  <p className="comments-title">댓글 {comments.length > 0 ? comments.length : ''}</p>
                  <div className="comments-list">
                    {comments.length === 0 ? (
                      <p className="comments-empty">첫 댓글을 남겨보세요 💬</p>
                    ) : (
                      comments.map(c => (
                        <div key={c.id} className="comment-item">
                          <div className="comment-avatar">{(c.user_name || '?')[0].toUpperCase()}</div>
                          <div className="comment-body">
                            <div className="comment-header">
                              <span className="comment-author">{c.user_name}</span>
                              <span className="comment-time">{formatCommentTime(c.created_at)}</span>
                              {c.user_id === user?.id && (
                                <button className="comment-delete" onClick={() => handleDeleteComment(c.id)} title="삭제">✕</button>
                              )}
                            </div>
                            <p className="comment-text">{c.content}</p>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={commentsEndRef} />
                  </div>

                  {user ? (
                    <form className="comment-form" onSubmit={handleAddComment}>
                      <div className="comment-avatar comment-my-avatar">
                        {(profile?.name || user.email || '?')[0].toUpperCase()}
                      </div>
                      <input
                        className="comment-input"
                        placeholder="댓글을 입력하세요..."
                        value={commentText}
                        onChange={e => setCommentText(e.target.value)}
                        maxLength={200}
                      />
                      <button className="comment-submit" type="submit" disabled={!commentText.trim() || commentSubmitting}>
                        {commentSubmitting ? <span className="btn-spinner" style={{ width: 14, height: 14 }} /> : '전송'}
                      </button>
                    </form>
                  ) : (
                    <p className="comments-login-hint">댓글을 달려면 로그인이 필요합니다</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
