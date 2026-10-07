// 공용 캐시 모듈: /api/auth/me 직접 호출 허용(경로 끝 두 성분 portal-shell/current-user.ts)
export async function load() { return fetch('/api/auth/me'); }
