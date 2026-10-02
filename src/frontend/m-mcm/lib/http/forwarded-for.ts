/**
 * 백엔드로 넘길 X-Forwarded-For 값. 들어온 요청의 헤더를 그대로 전달한다.
 * 헤더가 없으면 Next 서버(base-server.js)가 브라우저 소켓 주소를 `x-forwarded-for` 에 채워 주므로
 * 직접 이어 붙이지 않는다(NextRequest 에 소켓 주소 공식 API 없음). 신뢰 판정은 백엔드 ClientIpResolver 몫이다.
 */
export function forwardedForHeader(headers: Headers): string | undefined {
  const value = headers.get("x-forwarded-for")?.trim();
  return value ? value : undefined;
}
