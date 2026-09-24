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
  dts: true,
  sourcemap: true,
  // clean: false 유지 — 호스트(m-mcm) dev 서버가 dist/ 를 watch 하므로
  // 빌드 시작 순간 dist 가 비면 번들러 캐시가 깨진다(m-mls/m-mqc 와 동일 이유).
  clean: false,
  splitting: true,
  outDir: "dist",
  external,
};

export default defineConfig([
  { ...common, entry: { index: "src/index.ts", "evalex/index": "src/evalex/index.ts" } },
  {
    ...common,
    entry: {
      // 화면 엔트리는 업무 영역이 늘어날 때마다 여기에 1줄씩 추가한다.
      "pages/dma/mdmSample/page": "pages/dma/mdmSample/page.tsx",
      "pages/dma/domainMng/page": "pages/dma/domainMng/page.tsx",
      "pages/dma/columnMng/page": "pages/dma/columnMng/page.tsx",
    },
  },
]);
