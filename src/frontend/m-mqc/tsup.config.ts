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
      // 품질관리 시연 화면 19개(docs/mqc/demo/README.md §2). 포털 codegen 이 `{pkg}/pages/{folder}/{objectId}/page` 로 import 하므로
      // entry key 는 `page` 로 끝난다. 화면 본체는 src/{folder}/{objectId}/ 에 있다.
      "pages/qdm/qualitySpec/page": "pages/qdm/qualitySpec/page.tsx",
      "pages/qdm/rawMaterialGrade/page": "pages/qdm/rawMaterialGrade/page.tsx",
      "pages/qdm/specCode/page": "pages/qdm/specCode/page.tsx",
      "pages/qdm/rollingThicknessSet/page":
        "pages/qdm/rollingThicknessSet/page.tsx",
      "pages/qdm/processRouting/page": "pages/qdm/processRouting/page.tsx",
      "pages/qdm/lineWidthShrinkage/page":
        "pages/qdm/lineWidthShrinkage/page.tsx",
      "pages/qdm/lineWidthMargin/page": "pages/qdm/lineWidthMargin/page.tsx",
      "pages/qdf/orderWeightError/page": "pages/qdf/orderWeightError/page.tsx",
      "pages/qdf/orderConsistency/page": "pages/qdf/orderConsistency/page.tsx",
      "pages/qdf/productionFeasibility/page":
        "pages/qdf/productionFeasibility/page.tsx",
      "pages/qdr/qualityDesignResult/page":
        "pages/qdr/qualityDesignResult/page.tsx",
      "pages/qcd/designSimulation/page": "pages/qcd/designSimulation/page.tsx",
      "pages/qdb/masterCode/page": "pages/qdb/masterCode/page.tsx",
      "pages/qdb/colorSubmaterial/page": "pages/qdb/colorSubmaterial/page.tsx",
      "pages/qdb/colorBom/page": "pages/qdb/colorBom/page.tsx",
      "pages/qjd/qualityJudgment/page": "pages/qjd/qualityJudgment/page.tsx",
      "pages/qpr/qualityCertificate/page":
        "pages/qpr/qualityCertificate/page.tsx",
      "pages/qpr/inspectionCertificate/page":
        "pages/qpr/inspectionCertificate/page.tsx",
      "pages/qpr/tagManagement/page": "pages/qpr/tagManagement/page.tsx",
    },
  },
]);
