#!/usr/bin/env node
// 컬럼 사전 등록 묶음(columns-*.json)을 MDM 서버의 OASIS termMng·columnMng 로 보낸다(C2).
// 기본은 dry-run(읽기 전용 조회만)이고, --apply 를 줄 때만 save 한다. 자세한 설명은 README.md.
//
// 사용: node scripts/mdm-meta/register-columns.mjs [--file F] [--base URL] [--client-key K] [--user ID]
//                                                  [--role MDM_STD_ADMIN] [--only terms,columns,aliases] [--apply]
import { readFileSync } from "node:fs";

const HERE = new URL("./", import.meta.url).pathname;
const opt = {
  file: HERE + "columns-2026-10-05.json",
  base: "http://localhost:8096",
  clientKey: process.env.BACKEND_CLIENT_KEY || "dmes-bff-local-client-key-2026",
  user: "",
  role: "MDM_STD_ADMIN",
  only: new Set(["terms", "columns", "aliases"]),
  apply: false,
};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => {
    if (i + 1 >= argv.length) usage(`${a} 에 값이 없습니다`);
    return argv[++i];
  };
  if (a === "--file") opt.file = next();
  else if (a === "--base") opt.base = next().replace(/\/+$/, "");
  else if (a === "--client-key") opt.clientKey = next();
  else if (a === "--user") opt.user = next();
  else if (a === "--role") opt.role = next();
  else if (a === "--only") opt.only = new Set(next().split(",").map((s) => s.trim()).filter(Boolean));
  else if (a === "--apply") opt.apply = true;
  else if (a === "-h" || a === "--help") usage();
  else usage(`알 수 없는 인자: ${a}`);
}
for (const s of opt.only) if (!["terms", "columns", "aliases"].includes(s)) usage(`--only 값이 올바르지 않습니다: ${s}`);
if (opt.apply && !opt.user) usage("--apply 에는 --user(기록에 남을 표준관리자 사번)가 필요합니다");

function usage(err) {
  if (err) console.error(`오류: ${err}`);
  console.error("사용: node scripts/mdm-meta/register-columns.mjs [--file F] [--base URL] [--client-key K] [--user ID] [--role R] [--only terms,columns,aliases] [--apply]");
  process.exit(err ? 2 : 0);
}

const bundle = JSON.parse(readFileSync(opt.file, "utf8"));
const counts = { OK: 0, PLAN: 0, SKIP: 0, FAIL: 0 };
const report = (status, kind, name, detail = "") => {
  counts[status]++;
  console.log([status, kind, name, detail].join("\t"));
};

/** null·undefined 값은 뺀다 — OASIS 가 null 값의 타입을 정하지 못한다(화면 callOasis 와 같은 규칙). */
function compact(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
}

async function oasis(service, action, params, grids) {
  const res = await fetch(`${opt.base}/api/mdm/oasis/${service}/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Key": opt.clientKey,
      "X-Authenticated-User": opt.user || "mdm-meta-register",
      "X-Authenticated-Role": opt.role,
    },
    body: JSON.stringify({ meta: { menuId: service }, params: compact(params), ...(grids ? { grids } : {}) }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${service}/${action} HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  if (body?.meta?.success !== true) {
    const e = new Error(body?.meta?.message || `${service}/${action} HTTP ${res.status}`);
    e.code = body?.meta?.code;
    throw e;
  }
  return body.data?.result ?? body.data ?? {};
}

/** 표준 물리명으로 컬럼 상세. 없으면 null. */
async function viewColumn(physName) {
  try {
    return await oasis("columnMng", "view", { physName, withDomain: false });
  } catch (e) {
    if (/컬럼을 찾을 수 없습니다/.test(e.message)) return null;
    throw e;
  }
}

const sameAlias = (a, b) => a.systemCode === b.systemCode && a.physName.toUpperCase() === b.physName.toUpperCase();

/** 같은 시스템·이름(대소문자 무시)의 별칭이 다른 컬럼에 이미 있으면 그 설명. */
async function aliasConflicts(aliases, selfPhys) {
  const out = [];
  for (const a of aliases) {
    const r = await oasis("columnMng", "compare", { direction: "REVERSE", input: a.physName });
    for (const d of r.duplicates ?? []) {
      if (d.matchedBy === "SYSTEM_FIELD" && d.systemCode === a.systemCode && d.physName !== selfPhys) {
        out.push(`${a.systemCode}·${a.physName} → ${d.physName}(${d.columnName})`);
      }
    }
  }
  return out;
}

/** 기존 컬럼에 별칭을 더한다 — save 는 필드 전체·시스템 매핑 차분이라 상세의 값을 그대로 다시 보내고 매핑만 더한다. */
async function addAliases(kind, physName, wanted) {
  const v = await viewColumn(physName);
  if (!v) return report("FAIL", kind, physName, "대상 표준 컬럼이 없습니다");
  const have = v.systems ?? [];
  const missing = wanted.filter((w) => !have.some((h) => sameAlias(h, w)));
  if (missing.length === 0) return report("SKIP", kind, physName, "별칭이 이미 모두 있습니다");
  const names = missing.map((m) => `${m.systemCode}:${m.physName}`).join(",");
  if ((v.terms ?? []).some((t) => t.missing || t.termId == null)) {
    return report("FAIL", kind, physName, `용어가 빠진 컬럼이라 다시 저장할 수 없습니다(별칭 ${names})`);
  }
  const conflicts = await aliasConflicts(missing, physName);
  if (conflicts.length) return report("FAIL", kind, physName, `별칭이 다른 컬럼에 있습니다: ${conflicts.join(", ")}`);
  if (!opt.apply) return report("PLAN", kind, physName, `별칭 추가 ${names}`);
  const c = v.column;
  const systems = [...have, ...missing].map((s) => compact({ systemCode: s.systemCode, physName: s.physName, transform: s.transform, note: s.note }));
  await oasis("columnMng", "save", {
    columnId: c.columnId, columnName: c.columnName, physName: c.physName,
    labelLong: c.labelLong, labelMid: c.labelMid, labelShort: c.labelShort,
    description: c.description, domainId: c.domainId, required: c.required === true,
    defaultValue: c.defaultValue, refKind: c.refKind, refTarget: c.refTarget, refCateId: c.refCateId,
    usageNote: c.usageNote,
  }, { systems: { rows: systems }, terms: { rows: v.terms.map((t) => ({ termId: t.termId })) } });
  report("OK", kind, physName, `별칭 추가 ${names}`);
}

async function registerTerm(t) {
  const r = await oasis("termMng", "search", { keyword: t.termName });
  const hit = (r.list ?? []).find((x) => x.termName === t.termName && Number(x.senseNo) === Number(t.senseNo));
  if (hit) return report("SKIP", "term", `${t.termName}#${t.senseNo}`, `이미 있습니다(termId ${hit.termId}, 약어 ${hit.engAbbr ?? "-"})`);
  if (!opt.apply) return report("PLAN", "term", `${t.termName}#${t.senseNo}`, `새 용어(약어 ${t.engAbbr})`);
  const saved = await oasis("termMng", "save", {
    termName: t.termName, senseNo: t.senseNo, definition: t.definition, context: t.context, engName: t.engName,
    engAbbr: t.engAbbr, synonyms: t.synonyms, aliases: t.aliases, systems: t.systems, stdBasis: t.stdBasis,
  });
  report("OK", "term", `${t.termName}#${t.senseNo}`, `termId ${saved.termId}${saved.warnings?.length ? ` 경고 ${saved.warnings.join(",")}` : ""}`);
}

async function registerColumn(c) {
  if (await viewColumn(c.physName)) return addAliases("column", c.physName, c.aliases);
  const f = await oasis("columnMng", "compare", { direction: "FORWARD", input: c.columnName });
  const want = c.terms.map((t) => `${t.termName}#${t.senseNo}`).join(" ");
  const got = (f.tokens ?? []).map((t) => (t.termId ? `${t.termName}#${t.senseNo}` : `${t.surface}=***`)).join(" ");
  if (f.placeholder) {
    return report(opt.apply ? "FAIL" : "PLAN", "column", c.physName, `논리명 '${c.columnName}' 에 미등록 용어가 있습니다(${got}) — 용어 등록 뒤 가능`);
  }
  if (f.physName !== c.physName || got !== want) {
    return report("FAIL", "column", c.physName, `논리명 분해가 다릅니다: 기대 ${c.physName} [${want}], 서버 ${f.physName} [${got}]`);
  }
  if (f.duplicates?.length) {
    return report("FAIL", "column", c.physName, `같은 논리명·물리명 컬럼이 있습니다: ${f.duplicates.map((d) => `${d.physName}(${d.columnName})`).join(", ")}`);
  }
  let domainId = null;
  let domainNote = "";
  if (c.domainName) {
    const d = (f.domains ?? []).find((x) => x.domainName === c.domainName);
    if (d) domainId = d.domainId;
    else domainNote = ` 도메인 '${c.domainName}' 을 추천에서 찾지 못해 비웁니다`;
  }
  const conflicts = await aliasConflicts(c.aliases, c.physName);
  if (conflicts.length) return report("FAIL", "column", c.physName, `별칭이 다른 컬럼에 있습니다: ${conflicts.join(", ")}`);
  const aliasText = c.aliases.length ? ` 별칭 ${c.aliases.map((a) => `${a.systemCode}:${a.physName}`).join(",")}` : "";
  if (!opt.apply) return report("PLAN", "column", c.physName, `새 컬럼 '${c.columnName}' 도메인 ${domainId ?? "-"}${aliasText}${domainNote}`);
  const saved = await oasis("columnMng", "save", {
    columnName: c.columnName, physName: c.physName, labelLong: c.labelLong, labelMid: c.labelMid, labelShort: c.labelShort,
    description: c.description, domainId, required: false, usageNote: c.usageNote,
  }, {
    systems: { rows: c.aliases.map((a) => ({ systemCode: a.systemCode, physName: a.physName })) },
    terms: { rows: f.tokens.map((t) => ({ termId: t.termId })) },
  });
  report("OK", "column", c.physName, `columnId ${saved.columnId}${aliasText}${domainNote}`);
}

async function each(kind, list, fn, name) {
  for (const item of list ?? []) {
    try {
      await fn(item);
    } catch (e) {
      report("FAIL", kind, name(item), `${e.code ? e.code + " " : ""}${e.message}`);
    }
  }
}

console.error(`대상 ${opt.base} · ${opt.apply ? "적용(--apply)" : "dry-run"} · 파일 ${opt.file}`);
if (opt.only.has("terms")) await each("term", bundle.terms, registerTerm, (t) => `${t.termName}#${t.senseNo}`);
if (opt.only.has("columns")) await each("column", bundle.columns, registerColumn, (c) => c.physName);
if (opt.only.has("aliases")) await each("alias", bundle.aliases, (a) => addAliases("alias", a.physName, a.aliases), (a) => a.physName);
console.error(`요약 OK=${counts.OK} PLAN=${counts.PLAN} SKIP=${counts.SKIP} FAIL=${counts.FAIL}`);
process.exit(counts.FAIL ? 1 : 0);
