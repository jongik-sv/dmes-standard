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
      "pages/dma/unitMng/page": "pages/dma/unitMng/page.tsx",
      "pages/dma/termMng/page": "pages/dma/termMng/page.tsx",
      "pages/dma/domainMng/page": "pages/dma/domainMng/page.tsx",
      "pages/dma/columnMng/page": "pages/dma/columnMng/page.tsx",
      "pages/dmb/headerMng/page": "pages/dmb/headerMng/page.tsx",
      "pages/dmb/layoutMng/page": "pages/dmb/layoutMng/page.tsx",
      "pages/dmc/codeItemEdit/page": "pages/dmc/codeItemEdit/page.tsx",
      "pages/dmc/codeCateEdit/page": "pages/dmc/codeCateEdit/page.tsx",
      "pages/dmc/codeMng/page": "pages/dmc/codeMng/page.tsx",
      "pages/dmc/codeEdit/page": "pages/dmc/codeEdit/page.tsx",
      "pages/dmd/dataMng/page": "pages/dmd/dataMng/page.tsx",
      "pages/dmd/dataEdit/page": "pages/dmd/dataEdit/page.tsx",
      "pages/dmd/dataCateEdit/page": "pages/dmd/dataCateEdit/page.tsx",
      "pages/dmd/dataItemMng/page": "pages/dmd/dataItemMng/page.tsx",
      "pages/dmd/dataHistory/page": "pages/dmd/dataHistory/page.tsx",
      "pages/dme/ruleMng/page": "pages/dme/ruleMng/page.tsx",
      "pages/dme/ruleEdit/page": "pages/dme/ruleEdit/page.tsx",
    },
  },
]);
