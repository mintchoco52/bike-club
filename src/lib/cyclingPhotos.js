// picsum.photos 아웃도어/자연/도로 느낌 사진 ID 목록 (확실하게 로드됨)
const PHOTO_IDS = [13, 15, 16, 17, 28, 29, 30, 43, 76, 91, 107, 167]

export function getCyclingPhoto(seed, { width = 600, height = 300 } = {}) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  const id = PHOTO_IDS[Math.abs(hash) % PHOTO_IDS.length]
  return `https://picsum.photos/id/${id}/${width}/${height}`
}
