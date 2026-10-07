// 폴더 이름이 같으면 어디든 허용(끝 두 성분만 본다)
export async function load() { return fetch(`/api/auth/me`); }
