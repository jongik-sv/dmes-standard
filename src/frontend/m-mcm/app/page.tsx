import Link from "next/link";

/**
 * 랜딩 페이지.
 * 실제 배포에서는 세션 유무를 확인해 /portal 또는 /login 으로 redirect 한다
 * (@dk-oasis/shared/auth-server 의 세션 헬퍼 사용).
 */
export default function Home() {
  return (
    <main style={{ padding: 48, maxWidth: 640 }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>DK Oasis Portal</h1>
      <p style={{ color: "#5b6472", marginBottom: 24 }}>
        업무 화면 라이브러리(@dk-oasis/m-*)를 조합해 렌더링하는 포털 호스트다.
      </p>
      <ul style={{ lineHeight: 2 }}>
        <li>
          <Link href="/portal">포털 셸 열기</Link>
        </li>
        <li>
          <Link href="/login">로그인</Link>
        </li>
      </ul>
    </main>
  );
}
