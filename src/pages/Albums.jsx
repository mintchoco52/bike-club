import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  fetchAlbums,
  fetchRecentAlbum,
  createAlbum,
  uploadAlbumPhotos,
  deleteAlbumPhoto,
  defaultAlbumTitle,
  fetchNewPhotosSince,
  fetchAlbumStats,
  isVideoUrl,
  addAlbumComment,
  deleteAlbumComment,
  colorForName,
} from '../lib/albums'

const LAST_SEEN_KEY = 'albums_last_seen_at'
const COVER_LIMIT = 6
const COMMENT_PREVIEW_LIMIT = 2

function formatAlbumDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
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

function todayKST() {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

export default function Albums() {
  const { user, profile } = useAuth()
  const fileInputRef = useRef(null)

  const [albums, setAlbums] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newPhotos, setNewPhotos] = useState([])
  const [stats, setStats] = useState({ yearAlbumCount: 0, totalPhotoCount: 0, memoryCount: 0 })

  // 업로드 상태
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingFiles, setPendingFiles] = useState([])
  const [recentAlbum, setRecentAlbum] = useState(null)
  const [mode, setMode] = useState('recent')
  const [newTitle, setNewTitle] = useState(defaultAlbumTitle())
  const [newDate, setNewDate] = useState(todayKST())
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [directAlbumId, setDirectAlbumId] = useState(null) // 카드 안 버튼에서 직접 업로드 대상

  // 라이트박스
  const [lightbox, setLightbox] = useState(null) // { album, index }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      let lastSeen = localStorage.getItem(LAST_SEEN_KEY)
      if (!lastSeen) {
        const now = new Date().toISOString()
        localStorage.setItem(LAST_SEEN_KEY, now)
        lastSeen = now
      }
      const [list, fresh, st] = await Promise.all([
        fetchAlbums(),
        fetchNewPhotosSince(lastSeen),
        fetchAlbumStats(),
      ])
      setAlbums(list)
      setNewPhotos(fresh.filter(p => p.uploader_id !== user?.id))
      setStats(st)
    } catch (err) {
      setError(err.message || '앨범을 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => { load() }, [load])

  function dismissNotice() {
    localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString())
    setNewPhotos([])
  }

  const noticeText = (() => {
    if (!newPhotos.length) return null
    const names = [...new Set(newPhotos.map(p => p.uploader_name || '누군가').filter(Boolean))]
    const firstName = names[0]
    const otherCount = names.length - 1
    const photoCount = newPhotos.length
    if (otherCount > 0) {
      return `${firstName}님 외 ${otherCount}명이 사진 ${photoCount}장 올렸어요`
    }
    return `${firstName}님이 사진 ${photoCount}장 올렸어요`
  })()

  // 업로드 흐름
  function openFilePicker(targetAlbumId = null) {
    setDirectAlbumId(targetAlbumId)
    fileInputRef.current?.click()
  }

  async function handleFilesSelected(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return

    setPendingFiles(files)

    // 카드 안 버튼에서 호출 → 모달 건너뛰고 바로 업로드
    if (directAlbumId) {
      await doUpload({ albumId: directAlbumId, files })
      setDirectAlbumId(null)
      return
    }

    try {
      const recent = await fetchRecentAlbum()
      setRecentAlbum(recent)
      setMode(recent ? 'recent' : 'new')
      setNewTitle(defaultAlbumTitle())
      setNewDate(todayKST())
      setPickerOpen(true)
    } catch (err) {
      setError(err.message || '최근 앨범 조회 실패')
    }
  }

  async function doUpload({ albumId, files }) {
    setUploading(true)
    setProgress({ current: 0, total: files.length })
    try {
      const result = await uploadAlbumPhotos({
        files,
        albumId,
        userId: user.id,
        userName: profile?.name || '',
        onProgress: (current, total) => setProgress({ current, total }),
      })
      if (result.failed > 0) {
        setError(`${result.failed}장 업로드 실패. ${result.success}장 성공.`)
      }
      setPendingFiles([])
      await load()
    } catch (err) {
      setError(err.message || '업로드 실패')
    } finally {
      setUploading(false)
      setProgress(null)
    }
  }

  async function confirmUpload() {
    if (!pendingFiles.length || !user) return
    try {
      let albumId
      if (mode === 'recent' && recentAlbum) {
        albumId = recentAlbum.id
      } else {
        const album = await createAlbum({
          title: newTitle.trim() || defaultAlbumTitle(newDate),
          date: newDate,
          userId: user.id,
          userName: profile?.name || '',
        })
        albumId = album.id
      }
      setPickerOpen(false)
      await doUpload({ albumId, files: pendingFiles })
    } catch (err) {
      setError(err.message || '업로드 실패')
    }
  }

  function closePicker() {
    if (uploading) return
    setPickerOpen(false)
    setPendingFiles([])
    setRecentAlbum(null)
  }

  // 라이트박스
  function openLightbox(album, index) { setLightbox({ album, index }) }
  function closeLightbox() { setLightbox(null) }
  function lightboxPrev() {
    if (!lightbox) return
    const len = lightbox.album.allPhotos.length
    setLightbox({ ...lightbox, index: (lightbox.index - 1 + len) % len })
  }
  function lightboxNext() {
    if (!lightbox) return
    const len = lightbox.album.allPhotos.length
    setLightbox({ ...lightbox, index: (lightbox.index + 1) % len })
  }

  async function handleDeletePhoto(photo) {
    if (!confirm('이 파일을 삭제할까요?')) return
    try {
      await deleteAlbumPhoto(photo)
      setLightbox(null)
      await load()
    } catch (err) {
      alert(err.message || '삭제 실패')
    }
  }

  // 댓글
  async function handleAddComment(albumId, content) {
    if (!content.trim() || !user) return
    try {
      await addAlbumComment({
        albumId,
        userId: user.id,
        userName: profile?.name || '',
        content,
      })
      await load()
    } catch (err) {
      alert(err.message || '댓글 작성 실패')
    }
  }

  async function handleDeleteComment(commentId) {
    if (!confirm('이 댓글을 삭제할까요?')) return
    try {
      await deleteAlbumComment(commentId)
      await load()
    } catch (err) {
      alert(err.message || '댓글 삭제 실패')
    }
  }

  return (
    <div className="page albums-page">
      <div className="container">
        <header className="albums-header">
          <div>
            <h1>모임 앨범</h1>
            <p className="albums-subtitle">함께한 라이딩의 순간들을 모아보세요</p>
          </div>
          <button className="btn btn-primary btn-lg upload-cta" onClick={() => openFilePicker()}>
            📸 사진·영상 올리기
          </button>
        </header>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,.mov,.mp4,.webm,.m4v"
          multiple
          style={{ display: 'none' }}
          onChange={handleFilesSelected}
        />

        {noticeText && (
          <div className="albums-notice" role="status">
            <span className="albums-notice-icon">🔔</span>
            <span className="albums-notice-text">{noticeText}</span>
            <button className="albums-notice-close" onClick={dismissNotice} aria-label="알림 닫기">✕</button>
          </div>
        )}

        {error && (
          <div className="albums-error">
            ⚠️ {error}
            <button onClick={() => setError('')}>닫기</button>
          </div>
        )}

        {uploading && progress && !pickerOpen && (
          <div className="upload-floating">
            <div className="upload-progress-bar">
              <div className="upload-progress-fill" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
            </div>
            <span>{progress.current} / {progress.total} 업로드 중...</span>
          </div>
        )}

        {loading ? (
          <div className="center-page" style={{ minHeight: 240 }}>
            <div className="spinner-wrap"><div className="spinner" /><p>불러오는 중...</p></div>
          </div>
        ) : albums.length === 0 ? (
          <div className="albums-empty">
            <div className="albums-empty-icon">📷</div>
            <h3>아직 모임 앨범이 없어요</h3>
            <p>첫 사진을 올리면 자동으로 앨범이 만들어져요.</p>
            <button className="btn btn-primary btn-lg" onClick={() => openFilePicker()}>첫 사진 올리기</button>
          </div>
        ) : (
          <div className="albums-list">
            {albums.map((album, idx) => (
              <AlbumCard
                key={album.id}
                album={album}
                isLatest={idx === 0}
                currentUserId={user?.id}
                onPhotoClick={(photoIdx) => openLightbox(album, photoIdx)}
                onUploadClick={() => openFilePicker(album.id)}
                onAddComment={(content) => handleAddComment(album.id, content)}
                onDeleteComment={handleDeleteComment}
              />
            ))}
          </div>
        )}

        {!loading && (stats.yearAlbumCount > 0 || stats.totalPhotoCount > 0) && (
          <section className="albums-stats">
            <div className="albums-stats-head">
              <h3>올해 우리가 쌓은 것</h3>
              <span className="albums-stats-year">{new Date().getFullYear()}년</span>
            </div>
            <div className="albums-stats-grid">
              <div className="albums-stat">
                <span className="albums-stat-num">{stats.yearAlbumCount}</span>
                <span className="albums-stat-label">함께한 모임</span>
              </div>
              <div className="albums-stat">
                <span className="albums-stat-num">{stats.totalPhotoCount}</span>
                <span className="albums-stat-label">쌓인 사진</span>
              </div>
              <div className="albums-stat">
                <span className="albums-stat-num">{stats.memoryCount}</span>
                <span className="albums-stat-label">남긴 추억</span>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* 업로드 모달 (페이지 상단 버튼에서 호출됐을 때만) */}
      {pickerOpen && (
        <div className="modal-backdrop" onClick={closePicker}>
          <div className="modal album-modal" onClick={e => e.stopPropagation()}>
            <h3>{pendingFiles.length}개 파일 올리기</h3>
            <p className="modal-hint">어느 모임 앨범에 추가할까요?</p>

            <div className="album-modal-options">
              {recentAlbum && (
                <label className={`album-option ${mode === 'recent' ? 'selected' : ''}`}>
                  <input type="radio" name="albumMode" checked={mode === 'recent'} onChange={() => setMode('recent')} />
                  <div>
                    <strong>{recentAlbum.title}</strong>
                    <span>{formatAlbumDate(recentAlbum.date)} · 최근 앨범에 추가</span>
                  </div>
                </label>
              )}
              <label className={`album-option ${mode === 'new' ? 'selected' : ''}`}>
                <input type="radio" name="albumMode" checked={mode === 'new'} onChange={() => setMode('new')} />
                <div>
                  <strong>새 앨범 만들기</strong>
                  <span>다른 날짜의 라이딩이거나 새 모임</span>
                </div>
              </label>

              {mode === 'new' && (
                <div className="album-new-form">
                  <div className="form-group">
                    <label className="form-label">날짜</label>
                    <input
                      type="date"
                      className="form-input"
                      value={newDate}
                      onChange={e => {
                        setNewDate(e.target.value)
                        if (newTitle === defaultAlbumTitle() || newTitle === '' ||
                            newTitle.match(/^\d+월 \d+일 라이딩$/)) {
                          setNewTitle(defaultAlbumTitle(e.target.value))
                        }
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">앨범 이름</label>
                    <input
                      type="text"
                      className="form-input"
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      placeholder="예: 한강 라이딩"
                      maxLength={40}
                    />
                  </div>
                </div>
              )}
            </div>

            {uploading && progress && (
              <div className="upload-progress">
                <div className="upload-progress-bar">
                  <div className="upload-progress-fill" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
                </div>
                <span>{progress.current} / {progress.total} 업로드 중...</span>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={closePicker} disabled={uploading}>취소</button>
              <button className="btn btn-primary" onClick={confirmUpload} disabled={uploading}>
                {uploading ? '업로드 중...' : `${pendingFiles.length}개 올리기`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 라이트박스 */}
      {lightbox && (
        <div className="lightbox-backdrop" onClick={closeLightbox}>
          <button className="lightbox-close" onClick={closeLightbox}>✕</button>
          {lightbox.album.allPhotos.length > 1 && (
            <>
              <button className="lightbox-nav prev" onClick={e => { e.stopPropagation(); lightboxPrev() }}>‹</button>
              <button className="lightbox-nav next" onClick={e => { e.stopPropagation(); lightboxNext() }}>›</button>
            </>
          )}
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            {isVideoUrl(lightbox.album.allPhotos[lightbox.index].url) ? (
              <video
                key={lightbox.album.allPhotos[lightbox.index].id}
                src={lightbox.album.allPhotos[lightbox.index].url}
                className="lightbox-img"
                controls
                autoPlay
                playsInline
              />
            ) : (
              <img src={lightbox.album.allPhotos[lightbox.index].url} alt="" className="lightbox-img" />
            )}
            <div className="lightbox-meta">
              <span>📸 {lightbox.album.allPhotos[lightbox.index].uploader_name || '익명'}</span>
              <span>· {lightbox.index + 1} / {lightbox.album.allPhotos.length}</span>
              {lightbox.album.allPhotos[lightbox.index].uploader_id === user?.id && (
                <button className="lightbox-delete" onClick={() => handleDeletePhoto(lightbox.album.allPhotos[lightbox.index])}>
                  🗑 삭제
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AlbumCard({ album, isLatest, currentUserId, onPhotoClick, onUploadClick, onAddComment, onDeleteComment }) {
  const [draft, setDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const photos = album.coverPhotos
  const photoCount = album.photoCount
  const showLimit = COVER_LIMIT - 1 // 마지막 칸은 +N 더보기용
  const overflow = photoCount > COVER_LIMIT
  const visiblePhotos = overflow ? photos.slice(0, showLimit) : photos
  const remaining = overflow ? photoCount - showLimit : 0

  const comments = album.comments || []
  const visibleComments = expanded ? comments : comments.slice(-COMMENT_PREVIEW_LIMIT)
  const hiddenCount = comments.length - visibleComments.length

  const gridCount = Math.min(photoCount, COVER_LIMIT)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!draft.trim() || submitting) return
    setSubmitting(true)
    try {
      await onAddComment(draft)
      setDraft('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <article className="album-card">
      <header className="album-card-head">
        <div className="album-card-titleline">
          <h2>{album.title}</h2>
          {isLatest && <span className="album-card-badge">최근 모임</span>}
        </div>
        <p className="album-card-meta">
          {formatAlbumDate(album.date)}
          {photoCount > 0 && (
            <>
              <span className="dot">·</span>
              <span>사진 {photoCount}장</span>
              {album.uploaderCount > 1 && (
                <>
                  <span className="dot">·</span>
                  <span>{album.uploaderCount}명이 올림</span>
                </>
              )}
            </>
          )}
        </p>
      </header>

      {photoCount === 0 ? (
        <div className="album-card-empty">아직 사진이 없어요</div>
      ) : (
        <div className={`album-card-grid count-${gridCount}`}>
          {visiblePhotos.map((photo, idx) => {
            const isVideo = isVideoUrl(photo.url)
            return (
              <button
                key={photo.id}
                type="button"
                className={`album-tile${isVideo ? ' is-video' : ''}`}
                onClick={() => onPhotoClick(idx)}
                style={isVideo ? undefined : { backgroundImage: `url(${photo.url})` }}
                aria-label={isVideo ? `영상 ${idx + 1}` : `사진 ${idx + 1}`}
              >
                {isVideo && (
                  <>
                    <video src={photo.url} muted playsInline preload="metadata" />
                    <span className="album-tile-play" aria-hidden="true">▶</span>
                  </>
                )}
              </button>
            )
          })}
          {overflow && (
            <button
              type="button"
              className="album-tile album-tile-overflow"
              onClick={() => onPhotoClick(showLimit)}
              aria-label={`${remaining}장 더 보기`}
            >
              <span className="album-tile-more-num">+{remaining}</span>
              <span className="album-tile-more-label">더보기</span>
            </button>
          )}
        </div>
      )}

      {album.uploaders.length > 0 && (
        <div className="album-uploaders">
          <span className="album-uploaders-label">올린 사람</span>
          <div className="album-uploaders-stack">
            {album.uploaders.slice(0, 6).map((u, i) => (
              <span
                key={`${u.id || u.name}-${i}`}
                className="album-uploader-avatar"
                style={{ background: colorForName(u.name) }}
                title={u.name}
              >
                {u.name[0] || '?'}
              </span>
            ))}
            {album.uploaders.length > 6 && (
              <span className="album-uploader-avatar album-uploader-more">+{album.uploaders.length - 6}</span>
            )}
          </div>
        </div>
      )}

      <button type="button" className="album-card-upload" onClick={onUploadClick}>
        <span>📸 내 사진 올리기</span>
        <small>여러 장 한 번에 선택할 수 있어요</small>
      </button>

      <div className="album-comments-section">
        <div className="album-comments-head">
          💬 댓글 {comments.length}개
        </div>
        {comments.length === 0 ? (
          <p className="album-comments-empty">첫 댓글을 남겨보세요</p>
        ) : (
          <div className="album-comments-list">
            {hiddenCount > 0 && !expanded && (
              <button type="button" className="album-comments-more" onClick={() => setExpanded(true)}>
                이전 댓글 {hiddenCount}개 더 보기
              </button>
            )}
            {visibleComments.map(c => (
              <div key={c.id} className="album-comment">
                <span
                  className="album-comment-avatar"
                  style={{ background: colorForName(c.user_name || '') }}
                  aria-hidden="true"
                >
                  {(c.user_name || '?')[0]}
                </span>
                <div className="album-comment-body">
                  <div className="album-comment-head">
                    <strong>{c.user_name || '익명'}</strong>
                    <span className="album-comment-time">{formatCommentTime(c.created_at)}</span>
                    {c.user_id === currentUserId && (
                      <button
                        type="button"
                        className="album-comment-delete"
                        onClick={() => onDeleteComment(c.id)}
                        aria-label="댓글 삭제"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <p className="album-comment-content">{c.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        <form className="album-comment-form" onSubmit={handleSubmit}>
          <input
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="댓글 달기..."
            disabled={submitting}
            maxLength={300}
          />
          <button type="submit" disabled={!draft.trim() || submitting}>
            {submitting ? '...' : '등록'}
          </button>
        </form>
      </div>
    </article>
  )
}
