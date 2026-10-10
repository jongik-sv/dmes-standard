#!/usr/bin/env node
// 관계 추정 근거 파일을 만든다(단계 1 S6). 리포의 dbml 문서(DOC)와 SQL·JPQL 조인(SQL_JOIN)을 모듈별로 모아
// src/backend/mdm/api/src/main/resources/erd/hints/<module>.json 에 쓴다. 서버(ErdHintsLoader)가 클래스패스에서 읽는다.
// 외부 의존성 없음(node 18.17 이상).
//
// 사용: node scripts/erd/erd-hints.mjs [--root DIR] [--out DIR] [--check]
//   --check  파일을 쓰지 않고, 다시 만들면 내용이 바뀌는 파일이 있으면 종료 코드 1.
//   근거가 그대로면 파일을 건드리지 않는다(generatedAt 도 그대로). 그래서 다시 돌려도 diff 가 생기지 않는다.
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDbml } from "./lib/hints-dbml.mjs";
import { MODULES, buildRefs, moduleOfRef, renderHints, unchangedGeneratedAt } from "./lib/hints-file.mjs";
import { mineJoins, orientJoin, parseDdl, parseEntities } from "./lib/hints-sql.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// bin·generated: IDE 빌드가 mapper·sql 을 복사해 두는 폴더(.gitignore 대상). 읽으면 PC 마다 결과가 달라진다.
const SKIP_DIRS = new Set(["build", "node_modules", ".git", "test", "archive", "out", ".gradle", "logs", "bin", "generated"]);
const OUT_REL = "src/backend/mdm/api/src/main/resources/erd/hints";

function usage(err) {
  if (err) console.error(`오류: ${err}`);
  console.error("사용: node scripts/erd/erd-hints.mjs [--root DIR] [--out DIR] [--check]");
  process.exitCode = err ? 2 : 0;
}

function parseArgs(argv) {
  const opt = { root: join(HERE, "..", ".."), out: null, check: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root" || a === "--out") {
      if (i + 1 >= argv.length) return { error: `${a} 에 값이 없습니다` };
      opt[a.slice(2)] = argv[++i];
    } else if (a === "--check") opt.check = true;
    else if (a === "-h" || a === "--help") return { help: true };
    else return { error: `알 수 없는 인자: ${a}` };
  }
  opt.out = opt.out ?? join(opt.root, OUT_REL);
  return { opt };
}

/** 디렉터리를 이름순으로 훑는다(readdirSync recursive 는 node 20.1+ 라 쓰지 않는다). */
function walk(dir, accept, out = []) {
  if (!existsSync(dir)) return out;
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(p, accept, out);
    } else if (accept(e.name)) out.push(p);
  }
  return out;
}

const toRel = (root, p) => relative(root, p).split(sep).join("/");

/** Flyway 버전("1", "1.1", "1_1")을 마디마다 숫자로 비교한다. */
function compareVersion(a, b) {
  const pa = a.split(/[._]/).map(Number);
  const pb = b.split(/[._]/).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** 모듈 Flyway 폴더의 V 파일을 버전 숫자 순으로. */
function migrationTexts(root) {
  const texts = [];
  for (const m of Object.values(MODULES)) {
    for (const dir of m.migrations) {
      const abs = join(root, dir);
      if (!existsSync(abs)) continue;
      const files = readdirSync(abs)
        .map((n) => [n, /^V(\d+(?:[._]\d+)*)__.*\.sql$/i.exec(n)])
        .filter(([, v]) => v)
        .sort((a, b) => compareVersion(a[1][1], b[1][1]));
      for (const [n] of files) texts.push(readFileSync(join(abs, n), "utf8"));
    }
  }
  return texts;
}

/** 모든 근거(모듈 거르기 전)와 통계를 모은다. */
export function collect(root) {
  const keys = parseDdl(migrationTexts(root));
  const sources = walk(join(root, "src", "backend"), (n) => /\.(java|xml|sql|bpmn)$/.test(n)).map((p) => ({
    path: toRel(root, p),
    text: readFileSync(p, "utf8"),
  }));
  const entities = parseEntities(sources);
  const sql = sources.flatMap((f) => mineJoins(f, entities)).map((j) => orientJoin(j, keys));
  const doc = [];
  const skipped = [];
  for (const p of walk(join(root, "docs"), (n) => n.endsWith(".dbml"))) {
    const r = parseDbml(readFileSync(p, "utf8"), toRel(root, p));
    doc.push(...r.refs);
    skipped.push(...r.skipped);
  }
  return { raw: [...doc, ...sql], stats: { sources: sources.length, entities: entities.size, doc: doc.length, sql: sql.length, skipped } };
}

export function main(argv, now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z")) {
  const { opt, error, help } = parseArgs(argv);
  if (error || help) return usage(error);
  const { raw, stats } = collect(opt.root);
  const outside = raw.filter((r) => moduleOfRef(r) === null).length;
  console.error(`원천 ${stats.sources}개 · 엔티티 ${stats.entities}개 · DOC ${stats.doc}건 · SQL_JOIN ${stats.sql}건 · 모듈 밖(다른 스키마·모듈 사이) ${outside}건`);
  for (const s of stats.skipped) console.error(`읽지 않은 Ref: ${s.ref} (${s.reason})`);
  let stale = 0;
  for (const module of Object.keys(MODULES)) {
    const refs = buildRefs(raw, module);
    const file = join(opt.out, `${module}.json`);
    const existing = existsSync(file) ? readFileSync(file, "utf8") : null;
    const kept = unchangedGeneratedAt(existing, module, refs);
    const count = `DOC ${refs.filter((r) => r.kind === "DOC").length} · SQL_JOIN ${refs.filter((r) => r.kind === "SQL_JOIN").length}`;
    if (kept) {
      console.error(`${module}: 변경 없음 (${count})`);
    } else if (opt.check) {
      stale++;
      console.error(`${module}: 다시 만들어야 합니다 (${count}) — node scripts/erd/erd-hints.mjs`);
    } else {
      mkdirSync(opt.out, { recursive: true });
      writeFileSync(file, renderHints({ module, generatedAt: now(), refs }));
      console.error(`${module}: 썼습니다 ${toRel(opt.root, file)} (${count})`);
    }
  }
  process.exitCode = stale ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) main(process.argv.slice(2));
