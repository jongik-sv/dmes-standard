// 스키마별 V 파일을 읽어 표의 최종 모양과 규칙 순서를 만든다. 생성기(V1 다시 쓰기·재배치 V)와 검사가 함께 쓴다.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ENTITY_ROOTS, RELOCATE_SUFFIX, SCHEMAS } from "../config.mjs";
import { byVersion, maskSql, parseSqlFile, simulate, versionOf } from "./ddl.mjs";
import { flattenEntities, scanJava } from "./java-entities.mjs";
import { ruleOrder, sameOrder } from "./rule.mjs";

export const isRelocFile = (name) => new RegExp(`^V\\d+__${RELOCATE_SUFFIX}\\.sql$`).test(name);

/** 작업 트리에서 스키마 폴더의 V 파일들을 버전 순으로 읽는다. */
export function readWorkTree(root, dir) {
  const abs = path.join(root, dir);
  return fs
    .readdirSync(abs)
    .filter((n) => versionOf(n) && n.endsWith(".sql"))
    .sort(byVersion)
    .map((name) => ({ name, text: fs.readFileSync(path.join(abs, name), "utf8") }));
}

/** git ref 의 스키마 폴더 V 파일들. 옛 모양(기존 DB) 흉내용. */
export function readGitRef(root, ref, dir) {
  let out;
  try {
    out = execFileSync("git", ["ls-tree", "--name-only", `${ref}:${dir}`], { cwd: root, encoding: "utf8" });
  } catch {
    return [];
  }
  return out
    .split("\n")
    .filter((n) => versionOf(n) && n.endsWith(".sql"))
    .sort(byVersion)
    .map((name) => ({
      name,
      text: execFileSync("git", ["show", `${ref}:${dir}/${name}`], { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 }),
    }));
}

const parseAll = (files) => files.map((f) => ({ file: f.name, text: f.text, parsed: parseSqlFile(f.text, f.name) }));

/**
 * 전체 모델.
 * @param opts.base   기존 DB 모양을 흉내 낼 git ref(없으면 생략)
 * @param opts.schemas 대상 스키마 key 목록(없으면 전부)
 */
export function buildModel(root, opts = {}) {
  const { entities, issues: entityIssues } = flattenEntities(scanJava(ENTITY_ROOTS.map((r) => path.join(root, r))));
  const byTable = new Map();
  for (const e of entities) {
    const k = e.table.toUpperCase();
    if (!byTable.has(k)) byTable.set(k, []);
    byTable.get(k).push(e);
  }
  const schemas = SCHEMAS.filter((s) => !opts.schemas || opts.schemas.includes(s.key)).map((s) => {
    const files = parseAll(readWorkTree(root, s.dir));
    const pre = files.filter((f) => !isRelocFile(f.file));
    const reloc = files.find((f) => isRelocFile(f.file)) ?? null;
    const baseAll = opts.base ? readGitRef(root, opts.base, s.dir) : [];
    const base = opts.base ? parseAll(baseAll.filter((f) => !isRelocFile(f.name))) : null;
    return {
      ...s,
      files,
      reloc,
      baseHasReloc: baseAll.some((f) => isRelocFile(f.name)),
      views: [...new Set(files.flatMap((f) => [...maskSql(f.text).matchAll(/\bcreate\s+(?:or\s+replace\s+)?(?:(?:no\s+)?force\s+)?view\s+(?:"?\w+"?\.)?"?(\w+)"?/gi)].map((m) => m[1].toUpperCase())))],
      issues: [] /* 아래에서 채운다 */,
      pre: simulate(pre),
      post: simulate(files),
      basePre: base ? simulate(base) : null,
      basePost: base ? simulate(reloc ? [...base, reloc] : base) : null,
    };
  });
  for (const s of schemas) {
    s.issues = [...s.files.flatMap((f) => f.parsed.issues), ...s.pre.issues, ...s.post.issues, ...(s.basePost?.issues ?? [])];
  }
  // PK 없는 사본 표(MCMAPUSER 의 TB_MCM_CODE_* 등)는 같은 이름 표의 PK 순서를 빌린다 — SELECT * 복사 사본끼리 순서가 같아야 하므로.
  const pkByTable = new Map();
  for (const s of schemas) for (const [t, v] of s.pre) if (v.pk.length && !pkByTable.has(t)) pkByTable.set(t, v.pk);
  const conflicts = [];
  for (const s of schemas) {
    s.rules = new Map();
    for (const [t, v] of s.pre) {
      if (v.dropped) continue;
      const ents = byTable.get(t) ?? [];
      let pk = v.pk;
      const notes = [];
      if (!pk.length && pkByTable.has(t)) {
        pk = pkByTable.get(t);
        notes.push(`PK 없음 → 같은 이름 표의 PK 순서 사용(${pk.join(",")})`);
      }
      const results = ents.map((e) => ({ e, r: ruleOrder(v.cols, pk, e) }));
      const r = results[0]?.r ?? ruleOrder(v.cols, pk, null);
      for (const x of results.slice(1)) {
        if (!sameOrder(x.r.order.map((o) => o.col), r.order.map((o) => o.col))) {
          conflicts.push(`${s.key}.${t}: 엔티티 ${results[0].e.name} 와 ${x.e.name} 의 순서가 다름`);
        }
      }
      s.rules.set(t, { entity: ents.map((e) => e.name), pk, order: r.order, issues: [...notes, ...r.issues] });
    }
  }
  return { schemas, entities, entityIssues, conflicts };
}

/** 표 모양이 규칙 순서와 같은지. */
export function shapeMatches(shape, rule) {
  return sameOrder(shape.cols, rule.order.map((o) => o.col));
}
