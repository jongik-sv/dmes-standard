/** `scripts/inline-worker.ts` — 묶은 Worker 소스 문자열(단위 테스트에서는 빈 문자열). */
declare module "inline-worker:*" {
  const source: string;
  export default source;
}
