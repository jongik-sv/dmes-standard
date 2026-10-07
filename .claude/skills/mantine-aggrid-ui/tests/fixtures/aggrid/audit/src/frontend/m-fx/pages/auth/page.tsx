// P-K: /api/auth/me 직접 호출, P-R10: 탭 활성화 이벤트
export function a() {
  fetch('/api/auth/me');
  fetch( "/x/auth/me" );
  fetch(`/api/auth/me`, { cache: 'no-store' });
  fetch("/api/auth/meX");
  fetch(url + '/auth/me');
  // fetch('/api/auth/me') 주석 안은 걸리지 않는다
  /* fetch('/api/auth/me') 블록 주석 */
  const s = "// fetch('/api/auth/me') 문자열 안의 // 는 주석이 아니다";
  window.addEventListener("portal-tab-activated", () => reload());
}
