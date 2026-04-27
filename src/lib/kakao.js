const KAKAO_KEY = 'a59624d5b895f9829cddba0501e7adbd'

export function initKakao() {
  if (window.Kakao && !window.Kakao.isInitialized()) {
    window.Kakao.init(KAKAO_KEY)
  }
}
