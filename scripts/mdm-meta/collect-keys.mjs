#!/usr/bin/env node
// 화면이 MDM 메타 조회에 쓰는 키를 모은다(C1 분류표·C3 hit 비교의 키 목록).
//
// 사용: node scripts/mdm-meta/collect-keys.mjs [--json out.json] [--names] [루트...]
//   루트를 주지 않으면 m-mcm·m-mls·m-mdm 화면 폴더를 훑는다.
//   --json  발견 위치 전체(키·종류·파일·줄·메타 덮어쓰기)를 파일로 쓴다.
//   --names 메타 조회에 보낼 물리명만 한 줄에 하나씩 출력한다(meta=false 는 뺀다).
//
// 정규식 기반 근사 수집이다. 수집 규칙:
//   grid   : 열 객체 { key: "X", header: ... } — 같은 객체 안 meta: "Y" | false 를 함께 읽는다.
//   form   : <FormGroup name="X" meta=...>
//   label  : <MdmFieldLabel name="X" meta=...>
//   search : <SearchField value={filters.pX}> — 검색 조건 키의 p 접두어를 떼어 X 로 본다.
//   th     : 상세 표 <th> 다음 몇 줄 안에서 처음 바인딩한 데이터 키(item.X·row.X·closed("X") 등).
// 물리명 변환은 src/frontend/shared/src/mdm-meta/names.ts·cactus-core mdm/MdmNames.java 와 같은 규칙이다(바꾸면 셋을 함께 바꾼다).
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_ROOTS = [
  "src/frontend/m-mcm/page-components",
  "src/frontend/m-mcm/widget-types",
  "src/frontend/m-mls/pages",
  "src/frontend/m-mdm/pages",
  "src/frontend/m-mdm/src",
];

const args = process.argv.slice(2);
let jsonOut = null;
let namesOnly = false;
const roots = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--json") {
    jsonOut = args[++i];
    if (!jsonOut) {
      console.error("--json 에 파일 경로가 없습니다");
      process.exit(2);
    }
  }
  else if (args[i] === "--names") namesOnly = true;
  else roots.push(args[i]);
}

function toPhysName(name) {
  if (name == null) return null;
  const t = String(name).trim();
  if (!t) return null;
  if (t === t.toUpperCase()) return t;
  let out = "";
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (i > 0 && c !== c.toLowerCase() && c === c.toUpperCase()) {
      const p = t[i - 1];
      if ((p !== p.toUpperCase() && p === p.toLowerCase()) || /\p{Nd}/u.test(p)) out += "_";
    }
    out += c.toUpperCase();
  }
  return out;
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const p = resolve(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e) && !/\.(test|spec)\.tsx?$/.test(e) && !/\.d\.ts$/.test(e)) out.push(p);
  }
  return out;
}

const lineOf = (src, idx) => src.slice(0, idx).split("\n").length;

function metaIn(text) {
  const m = /\bmeta\s*[:=]\s*(?:\{\s*)?(false|"([^"]*)"|'([^']*)')/.exec(text);
  if (!m) return undefined;
  if (m[1] === "false") return false;
  return m[2] ?? m[3];
}

function scanFile(abs) {
  const src = readFileSync(abs, "utf8");
  const file = relative(REPO, abs);
  const hits = [];
  const push = (kind, key, idx, meta, label) => hits.push({ kind, key, meta, label, file, line: lineOf(src, idx) });

  // grid 열: key 다음 객체 끝(또는 다음 key)까지에 header 가 있어야 열로 본다.
  const keyRe = /\bkey:\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/g;
  for (let m; (m = keyRe.exec(src)); ) {
    const rest = src.slice(m.index + m[0].length, m.index + m[0].length + 600);
    const nextKey = rest.search(/\bkey:\s*["']/);
    const body = nextKey >= 0 ? rest.slice(0, nextKey) : rest;
    const before = src.slice(Math.max(0, m.index - 200), m.index);
    const objStart = before.lastIndexOf("{");
    const head = objStart >= 0 ? before.slice(objStart) : "";
    if (!/\bheader:/.test(body) && !/\bheader:/.test(head)) continue;
    const hm = /\bheader:\s*["'`]([^"'`]*)["'`]/.exec(head + body);
    push("grid", m[1], m.index, metaIn(head + body), hm?.[1]);
  }

  // JSX 태그 속성: FormGroup·MdmFieldLabel 의 name, SearchField 의 value 바인딩.
  const tagRe = /<(FormGroup|MdmFieldLabel|SearchField)\b([\s\S]*?)\/?>/g;
  for (let m; (m = tagRe.exec(src)); ) {
    const attrs = m[2];
    const label = /\blabel=\s*(?:\{\s*)?["']([^"']*)["']/.exec(attrs)?.[1];
    if (m[1] === "SearchField") {
      const nm = /\bname=\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/.exec(attrs);
      if (nm) {
        push("search", nm[1], m.index, metaIn(attrs), label);
        continue;
      }
      const v = /\bvalue=\{\s*(?:[A-Za-z_$][\w$]*\??\.)?([A-Za-z_][A-Za-z0-9_]*)/.exec(attrs);
      if (v) {
        let k = v[1];
        if (/^p[A-Z]/.test(k)) k = k.slice(1);
        push("search", k, m.index, metaIn(attrs), label);
      }
      continue;
    }
    const nm = /\bname=\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/.exec(attrs);
    if (nm) push(m[1] === "FormGroup" ? "form" : "label", nm[1], m.index, metaIn(attrs), label);
  }

  // 상세 표 <th>: 다음 8줄 안에서 처음 바인딩한 데이터 키.
  const thRe = /<th\b[^>]*>([^<]*)<\/th>/g;
  for (let m; (m = thRe.exec(src)); ) {
    const after = src.slice(m.index + m[0].length).split("\n").slice(0, 8).join("\n");
    const end = after.search(/<th\b/);
    const scope = end >= 0 ? after.slice(0, end) : after;
    const b =
      /\b(?:item|row|detail|data|selected|current|form|values|record|target|info|d|r)\w*\??\.([A-Z][A-Z0-9_]*|[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*)\b/.exec(scope) ||
      /\b(?:closed|set|field|get)\w*\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/.exec(scope) ||
      /\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/.exec(scope);
    push("th", b ? b[1] : null, m.index, undefined, m[1].trim());
  }
  return hits;
}

const files = (roots.length ? roots : DEFAULT_ROOTS).flatMap((r) => {
  const dir = resolve(REPO, r); // 절대 경로면 그대로
  if (!existsSync(dir)) {
    console.error(`루트가 없습니다: ${dir}`);
    process.exit(2);
  }
  return walk(dir);
});
const hits = files.flatMap(scanFile).map((h) => ({
  ...h,
  phys: h.meta === false ? null : toPhysName(typeof h.meta === "string" && h.meta.trim() ? h.meta : h.key),
}));

if (jsonOut) writeFileSync(jsonOut, JSON.stringify(hits, null, 2) + "\n");
if (namesOnly) {
  const names = [...new Set(hits.map((h) => h.phys).filter(Boolean))].sort();
  process.stdout.write(names.join("\n") + "\n");
} else if (!jsonOut) {
  for (const h of hits) console.log([h.kind, h.key ?? "-", h.phys ?? "-", h.meta === false ? "meta=false" : h.meta ?? "", `${h.file}:${h.line}`, h.label ?? ""].join("\t"));
}
if (jsonOut) console.error(`${hits.length} hits, ${new Set(hits.map((h) => h.phys).filter(Boolean)).size} phys names → ${jsonOut}`);
