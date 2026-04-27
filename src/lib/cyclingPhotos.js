const PHOTOS = Array.from({ length: 17 }, (_, i) => `/images/bike${i + 1}.jpg`)

export function getCyclingPhoto(seed) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  return PHOTOS[Math.abs(hash) % PHOTOS.length]
}
