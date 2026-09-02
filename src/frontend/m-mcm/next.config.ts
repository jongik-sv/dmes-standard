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
};

export default nextConfig;
