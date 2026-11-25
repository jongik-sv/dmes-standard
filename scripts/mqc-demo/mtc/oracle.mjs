#!/usr/bin/env node
// 검사증명서 엔진 대조 기준 만들기 — 목업 시뮬레이터의 계산 함수(resolve·paperHtml·snapDiff)를 happy-dom 안에서 돌려
// 처음 상태 발행본 5건(목업 fresh())과 종이 HTML 의 지문을 시험 기준 파일로 남긴다. 화면 TS 엔진 시험이 이 파일과 비교한다.
//
//   node scripts/mqc-demo/mtc/oracle.mjs <검사증명서_발행_시뮬레이터.html>     # 저장소 루트에서
//
// 목업 스크립트는 네트워크·파일 접근이 없는 happy-dom 창 안에서만 돈다(localStorage 는 빈 상태).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SIM = process.argv[2];
if (!SIM) {
  console.error("사용: node scripts/mqc-demo/mtc/oracle.mjs <검사증명서_발행_시뮬레이터.html>");
  process.exit(2);
}
const OUT = path.join(ROOT, "src/frontend/m-mqc/tests/qpr/inspectionCertificate/oracle.json");

const html = fs.readFileSync(SIM, "utf8");
const script = html.slice(html.indexOf("<script>") + "<script>".length, html.lastIndexOf("</script>"));
const body = html.slice(html.indexOf("<body>") + 6, html.indexOf("<script>"));

const require = createRequire(path.join(ROOT, "src/frontend/m-mqc/package.json"));
const { Window } = require("happy-dom");
const win = new Window({ url: "http://localhost/", settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } });
win.document.body.innerHTML = body;

// 목업 스크립트 끝(첫 그리기)까지 돌리고, 같은 전역 렉시컬 범위에서 대조 값을 뽑는다.
const probe = `
;(() => {
  const S0 = fresh();
  const out = { snaps: {}, papers: {}, diffs: {}, forms: S0.forms, rules: S0.rules.map(r => r.id) };
  for (const id of ['C1','C2','C3','C4','C5']) {
    out.snaps[id] = S0.issued[id].snap;
    S = S0;
    out.papers[id] = { orig: paperHtml(S0.issued[id].snap, { copy: '원본' }), copy: paperHtml(S0.issued[id].snap, { copy: '사본' }) };
  }
  out.diffs.C5 = snapDiff(S0.issued.C5.snap, resolve('C5', S0));
  // 단건 수정 한 건: C4 P/O·REMARK·코일 중량, C3 양식을 영문으로
  const S1 = JSON.parse(JSON.stringify(S0));
  S1.ovr.C4 = { head: { po: 'PO-2026-118' }, remark: 'Packing : Export standard', coil: { '0.net': '3,000\\n6,614' }, reason: '고객 요청' };
  S1.ovr.C3 = { form: 'en', head: {} };
  out.ovr = { C4: resolve('C4', S1), C3: resolve('C3', S1) };
  S = S1;
  out.papers.ovrC4 = { orig: paperHtml(out.ovr.C4, { copy: '원본' }) };
  return JSON.stringify(out);
})()`;
// 목업은 'use strict' 라 eval 하나 안에서만 전역 이름이 보인다 — 스크립트와 대조 식을 이어 한 번에 돌린다.
const out = JSON.parse(win.eval(script + probe));
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
for (const k of Object.keys(out.papers)) for (const m of Object.keys(out.papers[k])) out.papers[k][m] = { sha: sha(out.papers[k][m]), len: out.papers[k][m].length };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log("ok", OUT, Math.round(fs.statSync(OUT).size / 1024), "KB");
await win.happyDOM.abort();
win.close();
