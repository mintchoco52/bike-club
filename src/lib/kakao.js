const KAKAO_KEY = '85f62fa68eab1a5aaf9003be55997cfe'

export function initKakao() {
  if (!window.Kakao) {
    console.error('[Kakao] SDK가 로드되지 않았습니다')
    return false
  }
  if (!window.Kakao.isInitialized()) {
    window.Kakao.init(KAKAO_KEY)
    console.log('[Kakao] 초기화 완료, isInitialized:', window.Kakao.isInitialized())
  }
  return window.Kakao.isInitialized()
}
