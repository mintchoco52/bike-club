import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Gallery() {
  const { user, profile } = useAuth()
  const fileRef = useRef()
  const commentsEndRef = useRef()

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

  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)

  const fetchPhotos = useCallback(async () => {
    const { data } = await supabase
      .from('photos')
      .select('*, photo_likes(user_id)')
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

  // 댓글 추가 시 스크롤 아래로
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  // ESC 키로 라이트박스 닫기
  useEffect(() => {
    if (!selected) return
    function onKey(e) { if (e.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

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

    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) {
      setUploadError('로그인 세션이 만료됐습니다. 다시 로그인해주세요.')
      setUploading(false)
      return
    }

    const ext = (pendingFile.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${uid}/${Date.now()}.${ext}`
    let publicUrl = ''

    try {
      const { error: storageErr } = await supabase.storage
        .from('photos')
        .upload(path, pendingFile, { contentType: pendingFile.type })
      if (storageErr) throw new Error(`스토리지 업로드 실패: ${storageErr.message}`)
      publicUrl = supabase.storage.from('photos').getPublicUrl(path).data.publicUrl
    } catch (err) {
      setUploadError(err.message)
      setUploading(false)
      return
    }

    try {
      const { error: dbErr } = await supabase.from('photos').insert({
        url: publicUrl,
        title: uploadForm.title.trim(),
        meeting_title: uploadForm.meetingTitle || '',
        uploader_name: profile?.name || '',
        uploaded_by: uid,
      })
      if (dbErr) {
        await supabase.storage.from('photos').remove([path])
        throw new Error(`DB 저장 실패 (${dbErr.code}): ${dbErr.message}`)
      }
      await fetchPhotos()
      setShowUploadModal(false)
      setPendingFile(null)
      setPendingPreview(null)
    } catch (err) {
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
      const { data } = await supabase.from('photos').select('*, photo_likes(user_id)').eq('id', photoId).single()
      setSelected(data)
    }
  }

  async function handleDelete(photoId) {
    if (selected?.id === photoId) setSelected(null)
    await supabase.from('photos').delete().eq('id', photoId).eq('uploaded_by', user.id)
    setPhotos(prev => prev.filter(p => p.id !== photoId))
  }

  async function handleAddComment(e) {
    e.preventDefault()
    if (!commentText.trim() || !user || commentSubmitting) return
    setCommentSubmitting(true)
    const { data } = await supabase
      .from('photo_comments')
      .insert({
        photo_id: selected.id,
        user_id: user.id,
        user_name: profile?.name || user.email,
        content: commentText.trim(),
      })
      .select()
      .single()
    if (data) setComments(prev => [...prev, data])
    setCommentText('')
    setCommentSubmitting(false)
  }

  async function handleDeleteComment(commentId) {
    await supabase.from('photo_comments').delete().eq('id', commentId).eq('user_id', user.id)
    setComments(prev => prev.filter(c => c.id !== commentId))
  }

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

              {/* 좌측: 사진 */}
              <div className="lightbox-photo">
                <img src={selected.url} alt={selected.title} className="lightbox-img" />
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
                      <button
                        className="comment-submit"
                        type="submit"
                        disabled={!commentText.trim() || commentSubmitting}
                      >
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
