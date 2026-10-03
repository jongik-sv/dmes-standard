/**
 * 백엔드로 넘길 X-Forwarded-For 값 — 신뢰할 앞단(리버스 프록시) 단계 수 {@link trustedProxyHops} 만큼 오른쪽에서 고른 주소 하나.
 *
 * <p>옛 동작은 들어온 헤더를 그대로 넘겨, 브라우저가 `X-Forwarded-For: 1.2.3.4` 를 붙이면 BE(ClientIpResolver — BFF 를 신뢰
 * 프록시로 보고 XFF 를 믿는다)가 그 주소를 사용자 IP 로 기록했다(2026-10-03 보안 지적).
 *
 * <p>BFF 가 소켓 주소를 직접 얻을 수 없는 이유: Next 16 의 NextRequest 에는 클라이언트 주소 API 가 없다(`req.ip` 는 15 에서 없어졌다).
 * Next 서버(base-server.js)는 `x-forwarded-for ??= socket.remoteAddress` 로 헤더가 <b>없을 때만</b> 소켓 주소를 채우므로,
 * 라우트가 보는 값이 Next 가 채운 소켓 주소인지 클라이언트가 보낸 위조 값인지 구별할 수 없다. 그래서:
 * <ul>
 *   <li>단계 수 0(기본 — 앞단 없이 브라우저가 BFF 에 바로 붙는 로컬 개발 등): XFF 를 넘기지 않는다. BE 는 BFF 주소(remoteAddr)를 쓴다.</li>
 *   <li>단계 수 N(≥1, 앞단 N 단계를 지나 들어오는 운영): 각 앞단이 오른쪽에 하나씩 덧붙이므로 오른쪽에서 N 번째가 가장 바깥 앞단이 본
 *       클라이언트 주소다. 그 하나만 넘긴다. 왼쪽(클라이언트가 보낸 부분)은 버린다. 항목이 N 개보다 적거나 IP 가 아니면 넘기지 않는다.</li>
 * </ul>
 * Nginx 권장: `proxy_set_header X-Forwarded-For $remote_addr;`(클라이언트 값을 덮어쓴다) + BFF `TRUSTED_PROXY_HOPS=1`.
 * BE 쪽은 `dmes.client-ip.trusted-proxies` 에 BFF 주소가 있어야 이 값을 쓴다(docs/guide/Operations/DMES-Deployment-Guide.md).
 */
import { isIP } from "node:net";

/** 앞단 단계 수 상한 — 터무니없는 설정값을 막는다. */
const MAX_TRUSTED_PROXY_HOPS = 10;

/** 신뢰할 앞단 단계 수(TRUSTED_PROXY_HOPS). 없거나 0~10 정수가 아니면 0 — 클라이언트 XFF 를 믿지 않는 쪽으로 둔다. */
export function trustedProxyHops(): number {
  const raw = process.env.TRUSTED_PROXY_HOPS?.trim();
  if (!raw || !/^\d+$/.test(raw)) return 0;
  const hops = Number(raw);
  return hops <= MAX_TRUSTED_PROXY_HOPS ? hops : 0;
}

/**
 * BE 로 넘길 X-Forwarded-For 값. 넘기지 않을 때는 undefined.
 * @param headers 들어온 요청 헤더
 * @param hops 신뢰할 앞단 단계 수(기본: 환경변수 TRUSTED_PROXY_HOPS)
 */
export function forwardedForHeader(headers: Headers, hops = trustedProxyHops()): string | undefined {
  if (hops <= 0) return undefined;
  const raw = headers.get("x-forwarded-for");
  if (!raw) return undefined;
  const entries = raw.split(",").map((entry) => entry.trim());
  if (entries.length < hops) return undefined;
  const client = entries[entries.length - hops];
  return client && isIP(client) !== 0 ? client : undefined;
}
