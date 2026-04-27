const KAKAO_KEY = 'a59624d5b895f9829cddba0501e7adbd'

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
