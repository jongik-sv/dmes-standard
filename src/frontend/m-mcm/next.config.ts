import * as path from "node:path";
import type { NextConfig } from "next";
import { portalTranspilePackages } from "./app/portal/module-config";

const nextConfig: NextConfig = {
  transpilePackages: portalTranspilePackages,
  // 자체 Node 단독 실행 배포용 (Vercel 미사용). 산출물: .next/standalone/m-mcm/server.js
  output: "standalone",
  // pnpm 모노레포: 워크스페이스 루트(frontend/)를 트레이싱 루트로 지정해야
  // shared / m-mpn 등 workspace:* 의존성이 standalone 에 포함된다.
  outputFileTracingRoot: path.join(__dirname, ".."),
  turbopack: {},
  experimental: {
    // proxy.ts(미들웨어, matcher /api/:path*)를 지나는 요청 본문은 이 크기까지만 라우트로 넘어간다(Next 16 기본 10MB,
    // 넘으면 잘린 본문이 간다 — next/dist/server/body-streams.js). 미디어 위젯 동영상 100MB 올리기(스펙
    // 2026-10-02-widget-admin-generic §4.3) + multipart 머리말 여유 1MB. BE spring.servlet.multipart.max-request-size 와 같은 값.
    // 옛 이름 middlewareClientMaxBodySize 와 함께 두면 Next 가 기동을 거부한다.
    proxyClientMaxBodySize: "101mb",
  },
};

export default nextConfig;
