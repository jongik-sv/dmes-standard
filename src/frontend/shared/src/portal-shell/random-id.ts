/**
 * 무작위 ID(36자 UUID v4). http 로 IP 접속하면 보안 컨텍스트가 아니라 crypto.randomUUID 가 없으므로
 * getRandomValues(보안 컨텍스트 불필요)로 만든다. 그것도 없으면 Math.random 으로 채운다.
 * 사용 구간 ID·탭 분리 토큰처럼 추측 방지가 필요 없는 식별자에 쓴다.
 */
export function createRandomId(): string {
  const cryptoApi = (globalThis as { crypto?: Partial<Crypto> }).crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // 버전 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 변형
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
