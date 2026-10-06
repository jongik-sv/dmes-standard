import * as path from "node:path";
import type { NextConfig } from "next";
import { portalTranspilePackages } from "./app/portal/module-config";
import { API_BODY_MAX_BYTES } from "./lib/http/body-limit";

const nextConfig: NextConfig = {
  transpilePackages: portalTranspilePackages,
  // 자체 Node 단독 실행 배포용 (Vercel 미사용). 산출물: .next/standalone/m-mcm/server.js
  output: "standalone",
  // pnpm 모노레포: 워크스페이스 루트(frontend/)를 트레이싱 루트로 지정해야
  // shared / m-mpn 등 workspace:* 의존성이 standalone 에 포함된다.
  outputFileTracingRoot: path.join(__dirname, ".."),
  turbopack: {},
  experimental: {
    // proxy.ts 가 도는 요청은 Next 가 본문을 이 크기까지 메모리에 복제해 라우트로 넘기고, 넘는 부분은 잘라 버린다
    // (next/dist/server/body-streams.js cloneBodyStream · next-server.js runMiddleware finalize). 값은 전역 하나뿐이라
    // Next 기본값 10MB(config-shared.js)로 둔다. 미디어 동영상 100MB 올리기는 proxy matcher 에서 뺀 전용 라우트가
    // 복제 없이 흘려보내며 101MB 상한을 직접 지킨다(lib/http/body-limit.ts, 스펙 2026-10-02-widget-admin-generic §16.3).
    // 옛 이름 middlewareClientMaxBodySize 와 함께 두면 Next 가 기동을 거부한다.
    proxyClientMaxBodySize: API_BODY_MAX_BYTES,
  },
};

export default nextConfig;
