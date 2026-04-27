// Unsplash 사이클링 검색 페이지에서 직접 확인된 자전거 사진 ID
const CYCLING_PHOTOS = [
  'photo-1452573992436-6d508f200b30',
  'photo-1541625602330-2277a4c46182',
  'photo-1534787238916-9ba6764efd4f',
  'photo-1681295692638-97ace05f56b4',
  'photo-1517649763962-0c623066013b',
  'photo-1631276893368-554b60393efb',
  'photo-1471506480208-91b3a4cc78be',
  'photo-1601625193660-86f2807b024b',
  'photo-1606224547099-b15c94ca5ef2',
  'photo-1444491741275-3747c53c99b4',
  'photo-1600403477955-2b8c2cfab221',
  'photo-1632050592122-6b730e1ac63f',
]

export function getCyclingPhoto(seed, { width = 600, height = 300 } = {}) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  const id = CYCLING_PHOTOS[Math.abs(hash) % CYCLING_PHOTOS.length]
  return `https://images.unsplash.com/${id}?w=${width}&h=${height}&fit=crop&q=80&auto=format`
}
