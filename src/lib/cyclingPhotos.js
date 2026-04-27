const CYCLING_PHOTOS = [
  'photo-1558618666-fcd25c85cd64',
  'photo-1502781252888-9143e1f71b72',
  'photo-1541625602330-2277a4c46182',
  'photo-1571068316344-75bc098b0077',
  'photo-1517649763962-0c623066013b',
  'photo-1519583272095-6433daf26b6e',
  'photo-1534787238-3c40b0dd1404',
  'photo-1551698618-1dfe5d97d256',
  'photo-1504280390367-361c6d9f38f4',
  'photo-1541746972996-4e0b0f43e02a',
  'photo-1576858574244-84c5e290ab5a',
  'photo-1526888935184-a82d2a4b7e67',
]

export function getCyclingPhoto(seed, { width = 600, height = 300 } = {}) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  const id = CYCLING_PHOTOS[Math.abs(hash) % CYCLING_PHOTOS.length]
  return `https://images.unsplash.com/${id}?w=${width}&h=${height}&fit=crop&q=80&auto=format`
}
