/**
 * 로그인 화면 자리표시자.
 *
 * 실제 인증은 @dk-oasis/shared/auth-login-page 의 createPortalLoginPage 와
 * @dk-oasis/shared/auth-login-form 의 PortalLoginForm 을 조합해 구성한다
 * (세션 조회는 shared/src/auth 의 서버 헬퍼). 이 파일은 인증 UI 가 놓일 자리와
 * 폼 구조만 보여주며 실제 인증 로직을 포함하지 않는다.
 */
export default function LoginPage() {
  return (
    <main
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
      }}
    >
      <form
        action="/api/auth/callback/credentials"
        method="post"
        style={{
          width: 320,
          padding: 24,
          border: "1px solid #d6dbe3",
          borderRadius: 8,
        }}
      >
        <h1 style={{ fontSize: 18, marginBottom: 16 }}>로그인</h1>
        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ display: "block", fontSize: 12, marginBottom: 4 }}>아이디</span>
          <input name="username" autoComplete="username" style={{ width: "100%", padding: 6 }} />
        </label>
        <label style={{ display: "block", marginBottom: 20 }}>
          <span style={{ display: "block", fontSize: 12, marginBottom: 4 }}>비밀번호</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            style={{ width: "100%", padding: 6 }}
          />
        </label>
        <button type="submit" style={{ width: "100%", padding: 8 }}>
          로그인
        </button>
      </form>
    </main>
  );
}
