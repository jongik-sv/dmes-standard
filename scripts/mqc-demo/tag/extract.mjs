#!/usr/bin/env node
// Tag관리(TAG 발행 시뮬레이터) 시연 데이터 추출 — 목업 `TAG_발행_시뮬레이터.html` 의 `const DATA = {...};`(예시 코일·양식 35종·칸·규칙·운영 비교·그림)를
// 화면 정적 자료로 꺼낸다. 계약: docs/mqc/demo/tag-contract.md §2(DATA 는 서버에 두지 않고 화면 쪽 정적 자료로 둔다).
//
//   node scripts/mqc-demo/tag/extract.mjs <TAG_발행_시뮬레이터.html>      # 저장소 루트에서
//
// 만드는 것(화면이 처음 열릴 때 동적 import 로 불러온다 — 다른 화면 번들에 섞이지 않는다):
//   src/frontend/m-mqc/src/qpr/tagManagement/data/tag-data.json     그림을 뺀 DATA(코일·양식·규칙 표·운영 비교 등)
//   src/frontend/m-mqc/src/qpr/tagManagement/data/tag-images.json   양식 그림(로고·인증 마크, data URL)
//
// 목업 파일은 데이터로만 읽는다(그 안의 스크립트를 실행하지 않는다). 글꼴은 목업이 Google Fonts(화면 글꼴)만 쓰고 TAG 는 시스템 글꼴이라 꺼내지 않는다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SIM = process.argv[2];
if (!SIM) {
  console.error("사용: node scripts/mqc-demo/tag/extract.mjs <TAG_발행_시뮬레이터.html>");
  process.exit(2);
}
const OUT = path.join(ROOT, "src/frontend/m-mqc/src/qpr/tagManagement/data");

const html = fs.readFileSync(SIM, "utf8");
const line = html.split("\n").find((l) => l.startsWith("const DATA = "));
if (!line) throw new Error("DATA 를 찾지 못했습니다");
const body = line.slice("const DATA = ".length).trim().replace(/;$/, "");
const DATA = JSON.parse(body);
for (const k of ["coils", "forms", "tables", "items", "images", "M", "COLS", "DERIVED"]) if (!DATA[k]) throw new Error(`DATA.${k} 가 없습니다`);

const { images, ...rest } = DATA;
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "tag-data.json"), JSON.stringify(rest));
fs.writeFileSync(path.join(OUT, "tag-images.json"), JSON.stringify(images));
const kb = (f) => Math.round(fs.statSync(path.join(OUT, f)).size / 1024);
console.log("ok", { coils: DATA.coils.length, forms: Object.keys(DATA.forms).length, images: Object.keys(images).length, dataKB: kb("tag-data.json"), imagesKB: kb("tag-images.json") });
