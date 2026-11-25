#!/usr/bin/env node
// 검사증명서(MTC) 시연 데이터 추출 — 목업 `검사증명서_발행_시뮬레이터.html` 에 들어 있는 DATA(양식 배치·CSS·표 머리 구조·예시 증명서·이미지)와
// 글꼴(부분 집합)을 꺼내 화면 데이터와 서버 시드를 만든다. 계약: docs/mqc/demo/mtc-contract.md §4.
//
//   node scripts/mqc-demo/mtc/extract.mjs <시뮬레이터.html>      # 저장소 루트에서
//
// 만드는 것:
//   src/frontend/m-mqc/src/qpr/inspectionCertificate/data/formdef.json       양식 3종 배치·CSS·표 머리(화면 엔진이 정적으로 읽는다)
//   src/frontend/m-mqc/src/qpr/inspectionCertificate/data/paper-assets.json  글꼴·로고·마크 그림(화면이 지연 로딩한다)
//   scripts/mqc-demo/mtc/base.json                                            예시 증명서·서명 세트·서명·도장 그림(시드 원천)
//   src/backend/mqc/lib/src/main/resources/mqc/mtc/seed.json                  서버 시드(발행본은 화면 TS 엔진으로 계산)
//
// 목업 파일은 데이터로만 읽는다(그 안의 스크립트를 실행하지 않는다).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SIM = process.argv[2];
if (!SIM) {
  console.error("사용: node scripts/mqc-demo/mtc/extract.mjs <검사증명서_발행_시뮬레이터.html>");
  process.exit(2);
}
const FE = path.join(ROOT, "src/frontend/m-mqc/src/qpr/inspectionCertificate");
const OUT_DATA = path.join(FE, "data");
const OUT_BASE = path.join(ROOT, "scripts/mqc-demo/mtc/base.json");
const OUT_SEED = path.join(ROOT, "src/backend/mqc/lib/src/main/resources/mqc/mtc/seed.json");

const html = fs.readFileSync(SIM, "utf8");

/** `const DATA = {...};` 본문(JSON) — build_sim.py 가 json.dumps 로 넣었다. */
export function readData(text) {
  const i = text.indexOf("const DATA = ");
  const end = text.indexOf("const { FORMDEF", i);
  if (i < 0 || end < 0) throw new Error("DATA 를 찾지 못했습니다");
  const j = text.lastIndexOf(";", end);
  return JSON.parse(text.slice(i + "const DATA = ".length, j).replace(/<\\\//g, "</"));
}

const DATA = readData(html);
const style = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
const fontCss = [...style.matchAll(/@font-face\{[^}]*\}/g)].map((m) => m[0]).join("\n");
if (!fontCss.includes("MtcSans80") || !fontCss.includes("MtcKr80")) throw new Error("글꼴을 찾지 못했습니다");

// 종이 위 고정 그림(로고·마크)과 시연용 예시 서명. 서명·도장 그림은 서버 이미지 등록함(시드)에 둔다.
const PAPER_IMGS = ["cm_logo_eng.jpg", "cm_dongkuk_kor.jpg", "original_mark.png", "isi_mark.png", "copymark_dk.png", "copymark_dongkuk.png", "sign_sample.png"];

fs.mkdirSync(OUT_DATA, { recursive: true });
fs.writeFileSync(path.join(OUT_DATA, "formdef.json"), JSON.stringify(DATA.FORMDEF));
fs.writeFileSync(
  path.join(OUT_DATA, "paper-assets.json"),
  JSON.stringify({ fontCss, imgs: Object.fromEntries(PAPER_IMGS.map((n) => [n, DATA.IMGS[n]])) }),
);
const signImgs = Object.fromEntries(Object.entries(DATA.IMGS).filter(([n]) => !PAPER_IMGS.includes(n) || n === "sign_sample.png"));
delete signImgs["sign_sample.png"];
fs.writeFileSync(OUT_BASE, JSON.stringify({ certs: DATA.CERTS, signsets: DATA.SIGNSETS, imgs: signImgs }, null, 1));

// 시드: 화면 TS 엔진(engine/seed.ts)을 esbuild 로 묶어 불러와 목업 fresh() 와 같게 계산한다.
const require = createRequire(path.join(ROOT, "src/frontend/m-mqc/package.json"));
const esbuild = createRequire(require.resolve("tsup"))("esbuild");
const bundle = await esbuild.build({
  entryPoints: [path.join(FE, "engine/seed.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  logLevel: "error",
});
const tmp = path.join(ROOT, "scripts/mqc-demo/mtc/.seed-build.mjs");
fs.writeFileSync(tmp, bundle.outputFiles[0].text);
try {
  const { buildSeed } = await import(pathToFileURL(tmp).href);
  const seed = buildSeed(JSON.parse(fs.readFileSync(OUT_BASE, "utf8")));
  fs.mkdirSync(path.dirname(OUT_SEED), { recursive: true });
  fs.writeFileSync(OUT_SEED, JSON.stringify(seed, null, 1));
  const kb = (f) => Math.round(fs.statSync(f).size / 1024);
  console.log(
    "ok",
    { formdef: kb(path.join(OUT_DATA, "formdef.json")), paperAssets: kb(path.join(OUT_DATA, "paper-assets.json")), seed: kb(OUT_SEED) },
    "KB · forms",
    seed.forms.length,
    "rules",
    seed.rules.length,
    "certs",
    seed.certs.length,
    "imgs",
    seed.imgs.length,
    "issued",
    seed.issued.length,
  );
} finally {
  fs.rmSync(tmp, { force: true });
}
