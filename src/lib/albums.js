import { supabase } from './supabase'

const BUCKET = 'album-photos'
const RECENT_DAYS = 7 // 최근 N일 내 앨범이면 자동 추천

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
  const { data: photos, error: pErr } = await supabase
    .from('album_photos')
    .select('id, album_id, url, uploader_id, uploader_name, created_at')
    .in('album_id', ids)
    .order('created_at', { ascending: false })
  if (pErr) throw pErr

  const byAlbum = new Map()
  for (const p of photos || []) {
    if (!byAlbum.has(p.album_id)) byAlbum.set(p.album_id, [])
    byAlbum.get(p.album_id).push(p)
  }

  return albums.map(a => {
    const list = byAlbum.get(a.id) || []
    const uploaderIds = new Set(list.map(p => p.uploader_id).filter(Boolean))
    return {
      ...a,
      photoCount: list.length,
      uploaderCount: uploaderIds.size,
      coverPhotos: list.slice(0, 4),
      allPhotos: list,
    }
  })
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
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${albumId}/${userId}/${Date.now()}-${i}.${ext}`
      const contentType = file.type || 'image/jpeg'

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
 * 누적 통계 (올해 모임 수, 사진 수, 멤버 수)
 */
export async function fetchAlbumStats() {
  const year = new Date().getFullYear()
  const yearStart = `${year}-01-01`
  const yearEnd = `${year + 1}-01-01`

  const [albumsRes, photosRes] = await Promise.all([
    supabase
      .from('albums')
      .select('id', { count: 'exact', head: true })
      .gte('date', yearStart)
      .lt('date', yearEnd),
    supabase
      .from('album_photos')
      .select('uploader_id'),
  ])

  if (albumsRes.error) throw albumsRes.error
  if (photosRes.error) throw photosRes.error

  const photoList = photosRes.data || []
  const uniqueUploaders = new Set(photoList.map(p => p.uploader_id).filter(Boolean))

  return {
    yearAlbumCount: albumsRes.count ?? 0,
    totalPhotoCount: photoList.length,
    uniqueMemberCount: uniqueUploaders.size,
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
