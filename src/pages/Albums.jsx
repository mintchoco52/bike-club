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
} from '../lib/albums'

const LAST_SEEN_KEY = 'albums_last_seen_at'

function formatAlbumDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
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
  const [stats, setStats] = useState({ yearAlbumCount: 0, totalPhotoCount: 0, uniqueMemberCount: 0 })

  // 업로드 모달 상태
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingFiles, setPendingFiles] = useState([])
  const [recentAlbum, setRecentAlbum] = useState(null)
  const [mode, setMode] = useState('recent') // 'recent' | 'new'
  const [newTitle, setNewTitle] = useState(defaultAlbumTitle())
  const [newDate, setNewDate] = useState(todayKST())
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(null)

  // 라이트박스 상태
  const [lightbox, setLightbox] = useState(null) // { album, index }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      let lastSeen = localStorage.getItem(LAST_SEEN_KEY)
      // 첫 방문이면 지금 시각을 기록하고 알림은 안 띄움 (이후부터 새 사진 기준)
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
      // 본인 사진은 알림에서 제외
      setNewPhotos(fresh.filter(p => p.uploader_id !== user?.id))
      setStats(st)
    } catch (err) {
      setError(err.message || '앨범을 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => { load() }, [load])

  // 알림 닫기 = 마지막 본 시각 갱신
  function dismissNotice() {
    localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString())
    setNewPhotos([])
  }

  // 알림 띠 요약: 최근 업로더 이름 + 사진 N장 (여러 명이면 "외 N명")
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

  function openFilePicker() {
    fileInputRef.current?.click()
  }

  async function handleFilesSelected(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = '' // 같은 파일 다시 선택 가능
    if (!files.length) return

    setPendingFiles(files)
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

  async function confirmUpload() {
    if (!pendingFiles.length || !user) return
    setUploading(true)
    setProgress({ current: 0, total: pendingFiles.length })
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

      const result = await uploadAlbumPhotos({
        files: pendingFiles,
        albumId,
        userId: user.id,
        userName: profile?.name || '',
        onProgress: (current, total) => setProgress({ current, total }),
      })

      if (result.failed > 0) {
        setError(`${result.failed}장 업로드 실패. ${result.success}장 성공.`)
      }
      closePicker()
      await load()
    } catch (err) {
      setError(err.message || '업로드 실패')
    } finally {
      setUploading(false)
      setProgress(null)
    }
  }

  function closePicker() {
    if (uploading) return
    setPickerOpen(false)
    setPendingFiles([])
    setRecentAlbum(null)
  }

  function openLightbox(album, index) {
    setLightbox({ album, index })
  }
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

  return (
    <div className="page albums-page">
      <div className="container">
        <header className="albums-header">
          <div>
            <h1>모임 앨범</h1>
            <p className="albums-subtitle">함께한 라이딩의 순간들을 모아보세요</p>
          </div>
          <button className="btn btn-primary btn-lg upload-cta" onClick={openFilePicker}>
            📸 사진·영상 올리기
          </button>
        </header>

        {noticeText && (
          <div className="albums-notice" role="status">
            <span className="albums-notice-icon">🔔</span>
            <span className="albums-notice-text">{noticeText}</span>
            <button className="albums-notice-close" onClick={dismissNotice} aria-label="알림 닫기">
              ✕
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,.mov,.mp4,.webm,.m4v"
          multiple
          style={{ display: 'none' }}
          onChange={handleFilesSelected}
        />

        {error && (
          <div className="albums-error">
            ⚠️ {error}
            <button onClick={() => setError('')}>닫기</button>
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
            <button className="btn btn-primary btn-lg" onClick={openFilePicker}>첫 사진 올리기</button>
          </div>
        ) : (
          <div className="albums-list">
            {albums.map(album => (
              <AlbumCard
                key={album.id}
                album={album}
                onPhotoClick={(idx) => openLightbox(album, idx)}
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
                <span className="albums-stat-num">{stats.uniqueMemberCount}</span>
                <span className="albums-stat-label">활동 멤버</span>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* 업로드 선택 모달 */}
      {pickerOpen && (
        <div className="modal-backdrop" onClick={closePicker}>
          <div className="modal album-modal" onClick={e => e.stopPropagation()}>
            <h3>{pendingFiles.length}개 파일 올리기</h3>
            <p className="modal-hint">어느 모임 앨범에 추가할까요?</p>

            <div className="album-modal-options">
              {recentAlbum && (
                <label className={`album-option ${mode === 'recent' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="albumMode"
                    checked={mode === 'recent'}
                    onChange={() => setMode('recent')}
                  />
                  <div>
                    <strong>{recentAlbum.title}</strong>
                    <span>{formatAlbumDate(recentAlbum.date)} · 최근 앨범에 추가</span>
                  </div>
                </label>
              )}

              <label className={`album-option ${mode === 'new' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="albumMode"
                  checked={mode === 'new'}
                  onChange={() => setMode('new')}
                />
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
                        // 사용자가 제목을 직접 안 고쳤으면 자동 갱신
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
                  <div
                    className="upload-progress-fill"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
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
              <img
                src={lightbox.album.allPhotos[lightbox.index].url}
                alt=""
                className="lightbox-img"
              />
            )}
            <div className="lightbox-meta">
              <span>📸 {lightbox.album.allPhotos[lightbox.index].uploader_name || '익명'}</span>
              <span>· {lightbox.index + 1} / {lightbox.album.allPhotos.length}</span>
              {lightbox.album.allPhotos[lightbox.index].uploader_id === user?.id && (
                <button
                  className="lightbox-delete"
                  onClick={() => handleDeletePhoto(lightbox.album.allPhotos[lightbox.index])}
                >
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

function AlbumCard({ album, onPhotoClick }) {
  const remaining = album.photoCount - album.coverPhotos.length

  return (
    <article className="album-card">
      <header className="album-card-head">
        <div>
          <h2>{album.title}</h2>
          <p className="album-card-meta">
            {formatAlbumDate(album.date)}
            {album.photoCount > 0 && (
              <>
                <span className="dot">·</span>
                <span>사진 {album.photoCount}장</span>
                {album.uploaderCount > 1 && (
                  <>
                    <span className="dot">·</span>
                    <span>{album.uploaderCount}명이 올림</span>
                  </>
                )}
              </>
            )}
          </p>
        </div>
      </header>

      {album.coverPhotos.length === 0 ? (
        <div className="album-card-empty">아직 사진이 없어요</div>
      ) : (
        <div className={`album-card-grid count-${Math.min(album.coverPhotos.length, 4)}`}>
          {album.coverPhotos.map((photo, idx) => {
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
                {idx === 3 && remaining > 0 && (
                  <span className="album-tile-more">+{remaining}</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </article>
  )
}
