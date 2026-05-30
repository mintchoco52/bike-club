import { supabase } from './supabase'

const BUCKET = 'album-photos'
const RECENT_DAYS = 7 // 최근 N일 내 앨범이면 자동 추천
const MAX_FILE_SIZE_MB = 50 // Supabase Storage 기본 제한
const VIDEO_EXTENSIONS = /\.(mp4|mov|webm|m4v)(\?|#|$)/i

export function isVideoUrl(url = '') {
  return VIDEO_EXTENSIONS.test(url)
}

export function isVideoFile(file) {
  if (!file) return false
  if (file.type?.startsWith('video/')) return true
  return VIDEO_EXTENSIONS.test(file.name || '')
}

function todayKST() {
  // KST 기준 YYYY-MM-DD
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

export function defaultAlbumTitle(dateStr = todayKST()) {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}월 ${d.getDate()}일 라이딩`
}

/**
 * 앨범 목록 + 각 앨범의 사진 카운트/올린 사람 수/대표 사진 4장
 * 최신 날짜 우선
 */
export async function fetchAlbums() {
  const { data: albums, error } = await supabase
    .from('albums')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  if (!albums?.length) return []

  const ids = albums.map(a => a.id)
  const [photosRes, commentsRes] = await Promise.all([
    supabase
      .from('album_photos')
      .select('id, album_id, url, uploader_id, uploader_name, created_at')
      .in('album_id', ids)
      .order('created_at', { ascending: false }),
    supabase
      .from('album_comments')
      .select('id, album_id, user_id, user_name, content, created_at')
      .in('album_id', ids)
      .order('created_at', { ascending: true }),
  ])
  if (photosRes.error) throw photosRes.error
  if (commentsRes.error) throw commentsRes.error

  const photosByAlbum = new Map()
  for (const p of photosRes.data || []) {
    if (!photosByAlbum.has(p.album_id)) photosByAlbum.set(p.album_id, [])
    photosByAlbum.get(p.album_id).push(p)
  }
  const commentsByAlbum = new Map()
  for (const c of commentsRes.data || []) {
    if (!commentsByAlbum.has(c.album_id)) commentsByAlbum.set(c.album_id, [])
    commentsByAlbum.get(c.album_id).push(c)
  }

  return albums.map(a => {
    const photoList = photosByAlbum.get(a.id) || []
    const commentList = commentsByAlbum.get(a.id) || []
    // 업로더 정보 - 이름 기준으로 unique (id가 같아도 이름이 비어있을 수 있음)
    const seenIds = new Set()
    const uploaders = []
    for (const p of photoList) {
      const key = p.uploader_id || `name:${p.uploader_name}`
      if (seenIds.has(key)) continue
      seenIds.add(key)
      uploaders.push({ id: p.uploader_id, name: p.uploader_name || '익명' })
    }
    return {
      ...a,
      photoCount: photoList.length,
      uploaderCount: uploaders.length,
      uploaders,
      commentCount: commentList.length,
      comments: commentList,
      coverPhotos: photoList.slice(0, 6),
      allPhotos: photoList,
    }
  })
}

/**
 * 앨범 댓글 추가
 */
export async function addAlbumComment({ albumId, userId, userName, content }) {
  const { data, error } = await supabase
    .from('album_comments')
    .insert({
      album_id: albumId,
      user_id: userId,
      user_name: userName || '',
      content: content.trim(),
    })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * 앨범 댓글 삭제 (본인 댓글만)
 */
export async function deleteAlbumComment(commentId) {
  const { error } = await supabase
    .from('album_comments')
    .delete()
    .eq('id', commentId)
  if (error) throw error
}

/**
 * 이름 기반 결정적 색상 (아바타용)
 */
export function colorForName(name = '') {
  const colors = [
    'oklch(75% 0.12 145)',  // green
    'oklch(75% 0.12 240)',  // blue
    'oklch(80% 0.1 355)',   // pink
    'oklch(82% 0.12 80)',   // yellow
    'oklch(75% 0.12 300)',  // purple
    'oklch(78% 0.12 30)',   // orange
    'oklch(75% 0.1 195)',   // teal
  ]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return colors[Math.abs(h) % colors.length]
}

/**
 * 최근 N일 이내 앨범 중 가장 최신 1개 (있으면 업로드 시 추천)
 */
export async function fetchRecentAlbum() {
  const since = new Date()
  since.setDate(since.getDate() - RECENT_DAYS)
  const sinceStr = since.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('albums')
    .select('id, date, title')
    .gte('date', sinceStr)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return data?.[0] || null
}

/**
 * 새 앨범 생성
 */
export async function createAlbum({ title, date, userId, userName, meetingId = null }) {
  const { data, error } = await supabase
    .from('albums')
    .insert({
      title: title || defaultAlbumTitle(date),
      date: date || todayKST(),
      created_by: userId,
      creator_name: userName || '',
      meeting_id: meetingId,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * 파일들을 storage에 업로드하고 album_photos 행 생성
 * onProgress: (current, total) => void
 */
export async function uploadAlbumPhotos({ files, albumId, userId, userName, onProgress }) {
  const total = files.length
  let success = 0
  let failed = 0
  const errors = []

  for (let i = 0; i < total; i++) {
    const file = files[i]
    onProgress?.(i + 1, total)

    try {
      // 크기 체크
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        throw new Error(`${file.name}: ${MAX_FILE_SIZE_MB}MB를 초과합니다 (${(file.size / 1024 / 1024).toFixed(1)}MB)`)
      }

      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${albumId}/${userId}/${Date.now()}-${i}.${ext}`
      // iPhone .mov 등 contentType 비어 있는 경우 대비
      const contentType = file.type
        || (ext === 'mov' ? 'video/quicktime'
          : ext === 'mp4' ? 'video/mp4'
          : ext === 'webm' ? 'video/webm'
          : 'image/jpeg')

      const { error: storageErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType, upsert: false })
      if (storageErr) throw storageErr

      const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

      const { error: dbErr } = await supabase.from('album_photos').insert({
        album_id: albumId,
        url: publicUrl,
        uploader_id: userId,
        uploader_name: userName || '',
      })
      if (dbErr) {
        // DB 실패하면 storage도 롤백
        await supabase.storage.from(BUCKET).remove([path])
        throw dbErr
      }
      success++
    } catch (err) {
      failed++
      errors.push(err.message || String(err))
    }
  }

  return { success, failed, errors }
}

/**
 * 마지막으로 본 시각 이후 새로 올라온 사진들 (알림 띠용)
 * @param {string|null} sinceIso - ISO 문자열. null이면 빈 결과
 */
export async function fetchNewPhotosSince(sinceIso) {
  if (!sinceIso) return []
  const { data, error } = await supabase
    .from('album_photos')
    .select('id, album_id, uploader_id, uploader_name, created_at')
    .gt('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data || []
}

/**
 * 누적 통계 (올해 모임 수, 사진 수, 남긴 추억 = 사진+댓글 합산)
 */
export async function fetchAlbumStats() {
  const year = new Date().getFullYear()
  const yearStart = `${year}-01-01`
  const yearEnd = `${year + 1}-01-01`

  const [albumsRes, photosRes, commentsRes] = await Promise.all([
    supabase
      .from('albums')
      .select('id', { count: 'exact', head: true })
      .gte('date', yearStart)
      .lt('date', yearEnd),
    supabase
      .from('album_photos')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('album_comments')
      .select('id', { count: 'exact', head: true }),
  ])

  if (albumsRes.error) throw albumsRes.error
  if (photosRes.error) throw photosRes.error
  if (commentsRes.error) throw commentsRes.error

  const photoCount = photosRes.count ?? 0
  const commentCount = commentsRes.count ?? 0

  return {
    yearAlbumCount: albumsRes.count ?? 0,
    totalPhotoCount: photoCount,
    memoryCount: photoCount + commentCount,  // 남긴 추억
  }
}

/**
 * 앨범 사진 삭제 (storage + DB)
 */
export async function deleteAlbumPhoto(photo) {
  // url에서 storage path 추출
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const idx = photo.url.indexOf(marker)
  const path = idx >= 0 ? photo.url.slice(idx + marker.length).split('?')[0] : null

  if (path) {
    await supabase.storage.from(BUCKET).remove([path])
  }
  const { error } = await supabase.from('album_photos').delete().eq('id', photo.id)
  if (error) throw error
}
