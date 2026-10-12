#!/usr/bin/env node
// DB 컬럼 순서 생성기·검사기 (규칙 = lib/rule.mjs, 반영 절차 = docs/db-column-order/runbook.md).
//   node scripts/db-order/gen.mjs check   [--base <ref>] [--schema a,b]  전 V 파일 정적 검사 보고(어긋나면 exit 1)
//   node scripts/db-order/gen.mjs v1      [--write] [--schema a,b]      V1__baseline 의 create table 컬럼 줄만 규칙 순서로
//   node scripts/db-order/gen.mjs relocate --base <ref> [--write] [--schema a,b]  스키마별 재배치 V 파일
//   node scripts/db-order/gen.mjs rules   [--out <file>]               규칙 순서 데이터(JSON) — 순서 검사 시험이 읽는다
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildModel, shapeMatches } from "./lib/model.mjs";
import { rewriteV1 } from "./lib/rewrite.mjs";
import { relocationSql, relocationTargets } from "./lib/relocate.mjs";
import { versionOf } from "./lib/ddl.mjs";
import { RELOCATE_SUFFIX } from "./config.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const RULES_FILE = "scripts/db-order/column-order.json";

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      o[k] = v;
    } else o._.push(a);
  }
  return o;
}

const order = (rule) => rule.order.map((o) => o.col);

function check(model, out) {
  let bad = 0;
  out.push(`# 컬럼 순서 정적 검사`);
  for (const i of model.entityIssues) {
    out.push(`- 엔티티 파서: ${i}`);
    bad++;
  }
  for (const c of model.conflicts) {
    out.push(`- 충돌: ${c}`);
    bad++;
  }
  for (const s of model.schemas) {
    out.push(`\n## ${s.key} (${s.files.length} 파일${s.reloc ? `, 재배치 ${s.reloc.file}` : ", 재배치 없음"})`);
    for (const i of s.issues) {
      out.push(`- 파서: ${i}`);
      bad++;
    }
    for (const [t, rule] of s.rules) {
      const cur = s.post.get(t);
      const rows = [];
      if (!shapeMatches(cur, rule)) rows.push(`  - 새 DB: ${cur.cols.join(",")}`);
      if (s.basePost) {
        const b = s.basePost.get(t);
        if (b && !b.dropped && !shapeMatches(b, rule)) rows.push(`  - 기존 DB: ${b.cols.join(",")}`);
        const bp = s.basePre?.get(t);
        const same = (a, b) => [...a].sort().join(",") === [...b].sort().join(",");
        if (bp && !bp.dropped && !same(bp.cols, s.pre.get(t).cols)) rows.push(`  - 기존 DB 와 컬럼 집합이 다름`);
      }
      // 검산: 표 본문 전체를 쉼표로 나눠 센 컬럼(+ ALTER ADD) 과 규칙 컬럼 집합이 같아야 한다.
      const declared = s.pre.get(t).declared ?? [];
      const ruleCols = order(rule);
      if (declared.length !== ruleCols.length || declared.some((c) => !ruleCols.includes(c))) {
        rows.push(`  - 컬럼 수 다름: DDL ${declared.length}(${declared.join(",")}) ≠ 규칙 ${ruleCols.length}`);
      }
      const ent = rule.entity.length ? rule.entity.join("/") : "엔티티 없음";
      if (rows.length || rule.issues.length) out.push(`- ${t} [${ent}] 규칙: ${order(rule).join(",")}`);
      for (const i of rule.issues) out.push(`  - 알림: ${i}`);
      if (rows.length) {
        bad++;
        out.push(...rows);
      }
    }
    out.push(`- 표 ${s.rules.size}개(엔티티 ${[...s.rules.values()].filter((r) => r.entity.length).length})`);
  }
  // 스키마 사이 같은 이름 표(SELECT * 복사 사본: TB_MCM_CODE_* 등)는 순서가 같아야 한다.
  const seen = new Map();
  for (const s of model.schemas) {
    for (const [t, rule] of s.rules) {
      const o = order(rule).join(",");
      const prev = seen.get(t);
      if (prev && prev.o !== o) {
        out.push(`- 사본 순서 다름: ${t} (${prev.key} ↔ ${s.key})`);
        bad++;
      } else if (!prev) seen.set(t, { key: s.key, o });
    }
  }
  out.push(`\n어긋난 표·충돌: ${bad}`);
  return bad;
}

export function main(argv) {
  const o = args(argv);
  const cmd = o._[0];
  const schemas = typeof o.schema === "string" ? o.schema.split(",") : undefined;
  const base = typeof o.base === "string" ? o.base : undefined;
  const model = buildModel(ROOT, { base, schemas });
  const out = [];
  if (cmd === "check") {
    const bad = check(model, out);
    console.log(out.join("\n"));
    return bad ? 1 : 0;
  }
  if (cmd === "v1") {
    let fail = 0;
    for (const s of model.schemas) {
      const v1 = s.files.find((f) => versionOf(f.file)?.[0] === 1);
      if (!v1) continue;
      const r = rewriteV1(v1.text, v1.parsed, s.rules);
      console.log(`${s.key}/${v1.file}: 바뀐 표 ${r.changed.length}${r.changed.length ? ` (${r.changed.join(",")})` : ""}`);
      for (const e of r.errors) console.log(`  오류: ${e}`);
      if (r.errors.length) fail++;
      else if (o.write && r.changed.length) fs.writeFileSync(path.join(ROOT, s.dir, v1.file), r.text);
    }
    return fail ? 1 : 0;
  }
  if (cmd === "relocate") {
    if (!base) {
      console.error("relocate 는 --base <ref> 가 필요하다(기존 DB 모양).");
      return 2;
    }
    for (const s of model.schemas) {
      const targets = relocationTargets(s);
      const last = s.files.filter((f) => !s.reloc || f !== s.reloc).at(-1);
      // 이미 기준 ref(=적용됐을 수 있는 DB)에 있는 재배치 파일은 다시 쓰지 않는다 — 체크섬이 바뀐다.
      if (s.reloc && s.baseHasReloc) {
        console.log(`${s.key}: ${s.reloc.file} 이 --base 에 이미 있어 덮어쓰지 않는다(새 재배치가 필요하면 새 번호로).`);
        continue;
      }
      const name = s.reloc ? s.reloc.file : `V${versionOf(last.file)[0] + 1}__${RELOCATE_SUFFIX}.sql`;
      console.log(`${s.key}: 재배치 표 ${targets.length} → ${targets.length ? name : "파일 없음"}`);
      if (o.write && targets.length) fs.writeFileSync(path.join(ROOT, s.dir, name), relocationSql(s, targets));
    }
    return 0;
  }
  if (cmd === "rules") {
    const data = { generatedBy: "scripts/db-order/gen.mjs rules", groups: ["pk", "field", "other", "version", "audit"], schemas: {} };
    for (const s of model.schemas) {
      const tables = {};
      for (const [t, rule] of [...s.rules].sort(([a], [b]) => a.localeCompare(b))) {
        tables[t] = rule.order.map((x) => ({ col: x.col, group: x.group }));
      }
      data.schemas[s.key] = { dir: s.dir, tables };
    }
    const file = path.resolve(ROOT, typeof o.out === "string" ? o.out : RULES_FILE);
    // 표 하나 = 한 줄(diff 를 읽기 쉽게). 내용은 보통 JSON 이다.
    const lines = ["{", `"generatedBy":${JSON.stringify(data.generatedBy)},`, `"groups":${JSON.stringify(data.groups)},`, `"schemas":{`];
    const keys = Object.keys(data.schemas);
    keys.forEach((k, i) => {
      const s = data.schemas[k];
      lines.push(`${JSON.stringify(k)}:{"dir":${JSON.stringify(s.dir)},"tables":{`);
      const ts = Object.keys(s.tables);
      ts.forEach((t, j) => lines.push(`${JSON.stringify(t)}:${JSON.stringify(s.tables[t])}${j < ts.length - 1 ? "," : ""}`));
      lines.push(`}}${i < keys.length - 1 ? "," : ""}`);
    });
    lines.push("}}");
    fs.writeFileSync(file, lines.join("\n") + "\n");
    console.log(`썼다: ${path.relative(ROOT, file)}`);
    return 0;
  }
  console.error("사용법: gen.mjs check|v1|relocate|rules (파일 머리 주석 참고)");
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
