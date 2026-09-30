import { defineConfig } from "tsup";

const external = [
  "react",
  "react-dom",
  "next",
  "next/navigation",
  "next-auth",
  "next-auth/react",
  "@dk-oasis/shared",
  /^@dk-oasis\/shared\/.*/,
  // monaco-editor 는 대용량 — 번들에 넣지 않고 런타임(m-mcm Next)에서 동적 import 로 해석한다.
  // react18-json-view 컴포넌트도 dependencies 자동 external 로 남는다.
  "monaco-editor",
  "react18-json-view",
];

// react18-json-view 의 style.css 서브패스만 번들 대상으로 강제 — tsup 은 dependencies 를
// (서브패스 포함) 자동 external 처리하므로, noExternal 로 되돌려 페이지 CSS
// (dist/pages/anl/logViewer.css)에 함께 추출되게 한다.
const noExternal = [/^react18-json-view\/src\/style\.css$/];

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
    },
    format: ["esm"],
    target: "es2022",
    // TSUP_DTS=0 이면 .d.ts 를 만들지 않는다(scripts/lib-dev.mjs watch 의 JS 전용 빌드).
    dts: process.env.TSUP_DTS !== "0",
    sourcemap: true,
    clean: false,
    splitting: false,
    outDir: "dist",
    external,
  },
  {
    entry: {
      "pages/anl/logViewer": "pages/anl/logViewer.tsx",
    },
    format: ["esm"],
    target: "es2022",
    // TSUP_DTS=0 이면 .d.ts 를 만들지 않는다(scripts/lib-dev.mjs watch 의 JS 전용 빌드).
    dts: process.env.TSUP_DTS !== "0",
    sourcemap: true,
    clean: false,
    splitting: false,
    outDir: "dist",
    external,
    noExternal,
  },
]);
