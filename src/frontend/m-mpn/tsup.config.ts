import { defineConfig, type Options } from "tsup";

const external = [
  "react",
  "react-dom",
  "next",
  "next/navigation",
  "next-auth",
  "next-auth/react",
  "@dk-oasis/shared",
  /^@dk-oasis\/shared\/.*/,
];

const common: Options = {
  format: ["esm"],
  target: "es2022",
  charset: "utf8",
  // TSUP_DTS=0 이면 .d.ts 를 만들지 않는다(scripts/lib-dev.mjs watch 의 JS 전용 빌드).
  dts: process.env.TSUP_DTS !== "0",
  sourcemap: true,
  // clean: false 유지 — 호스트(m-mcm) dev 서버가 dist/ 를 watch 하므로
  // 빌드 시작 순간 dist 가 비면 번들러 캐시가 깨진다.
  clean: false,
  splitting: true,
  outDir: "dist",
  external,
};

export default defineConfig([
  {
    ...common,
    entry: {
      index: "src/index.ts",
    },
  },
  {
    ...common,
    entry: {
      // 화면 엔트리는 업무 영역이 늘어날 때마다 여기에 1줄씩 추가한다.
      //   "pages/{area}/{screenId}": "pages/{area}/{screenId}.tsx"
      // package.json 의 exports "./pages/*" 가 dist/pages/* 를 그대로 노출하므로
      // 별도 exports 수정 없이 서브패스 import 가 가능하다.
      "pages/sample": "pages/sample/index.tsx",
    },
  },
]);
