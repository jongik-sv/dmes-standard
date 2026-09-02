import * as path from "node:path";
import type { NextConfig } from "next";

/**
 * 워크스페이스 화면 라이브러리는 소스(ESM + JSX)를 그대로 내보내므로
 * 호스트가 직접 트랜스파일해야 한다. 새 @dk-oasis/* 패키지를 추가하면 여기에 1줄 등록한다.
 */
const workspacePackages = [
  "@dk-oasis/shared",
  "@dk-oasis/m-mpn",
  "@dk-oasis/m-mls",
  "@dk-oasis/m-mqc",
  "@dk-oasis/m-mpp",
  "@dk-oasis/m-analog",
];

const nextConfig: NextConfig = {
  transpilePackages: workspacePackages,
  // 자체 Node 단독 실행 배포용 산출물: .next/standalone/m-mcm/server.js
  output: "standalone",
  // pnpm 모노레포 — 워크스페이스 루트(frontend/)를 트레이싱 루트로 지정해야
  // workspace:* 의존성이 standalone 산출물에 포함된다.
  outputFileTracingRoot: path.join(__dirname, ".."),
  turbopack: {},
};

export default nextConfig;
