#!/usr/bin/env node
// Maru(MDM) 등록기 — bundles/*.json 의 코드·룰을 OASIS 로 등록·저장·확정한다. 기본은 dry-run(쓰기 없음).
// 룰: ruleMng/reg → ruleEdit/save COLUMNS → TABLE(hitPolicy) → CASE → ruleConfirm/confirm, 개정은 ruleMng/copy(MINOR) → TABLE → confirm.
// 코드: codeMng/reg → codeEdit/save(헤더 속성 라벨) → codeItemEdit/save → codeConfirm/confirm.
// 사용: node scripts/mqc-demo/mdm/load.mjs [--apply] [--only codes,lineWidthShrinkage,C10B1074,QC_CUSTOMER] [--base URL] [--verify]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { judge } from "./lib/maru.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const opt = {
  base: "http://localhost:8096", mqc: "http://localhost:8093",
  clientKey: process.env.BACKEND_CLIENT_KEY || "dmes-bff-local-client-key-2026",
  user: "admin", role: "MDM_STEWARD,MDM_STD_ADMIN", apply: false, verify: false, only: null,
  codeApplyFrom: "2026-11-01 00:00:00",
};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => argv[++i];
  if (a === "--apply") opt.apply = true;
  else if (a === "--verify") opt.verify = true;
  else if (a === "--only") opt.only = new Set(next().split(","));
  else if (a === "--base") opt.base = next();
  else if (a === "--mqc") opt.mqc = next();
  else if (a === "--user") opt.user = next();
  else if (a === "--role") opt.role = next();
  else throw new Error(`모르는 옵션 ${a}`);
}

const log = (...a) => console.log(...a);
const tally = { PLAN: 0, SKIP: 0, DONE: 0, FAIL: 0 };
const mark = (k, what) => { tally[k]++; log(`${k.padEnd(4)} ${what}`); };

/** POST(node:http — fetch 는 응답 머리를 5분까지만 기다려 큰 표 저장에서 끊긴다). */
function post(url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: "POST", headers: { ...headers, "Content-Length": Buffer.byteLength(body) } }, (r) => {
      let text = "";
      r.setEncoding("utf8");
      r.on("data", (d) => { text += d; });
      r.on("end", () => resolve({ status: r.statusCode, text }));
    });
    req.setTimeout(900000, () => req.destroy(new Error("15분 안에 응답이 없다")));
    req.on("error", reject);
    req.end(body);
  });
}

async function oasis(service, action, params, grids, base = opt.base, module = "mdm", role = opt.role) {
  const res = await post(`${base}/api/${module}/oasis/${service}/${action}`,
    { "Content-Type": "application/json", "X-Client-Key": opt.clientKey, "X-Authenticated-User": opt.user, "X-Authenticated-Role": role },
    // OASIS 는 null 인 params 값의 타입을 못 정한다(S999) — null 은 빼고 보낸다.
    JSON.stringify({ meta: { menuId: service }, params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined)), ...(grids ? { grids } : {}) }));
  const text = res.text;
  let body;
  try { body = JSON.parse(text); } catch { throw new Error(`${service}/${action}: HTTP ${res.status} ${text.slice(0, 300)}`); }
  if (body?.meta?.success !== true) {
    const e = new Error(`${service}/${action}: ${body?.meta?.code ?? body?.errorCode ?? res.status} ${body?.meta?.message ?? body?.message ?? ""}`);
    e.body = body;
    throw e;
  }
  return body.data?.result ?? body.data ?? {};
}

const issuesText = (e) => JSON.stringify(e.body?.errors ?? e.body?.data ?? "").slice(0, 2500);

// ── 묶음 ────────────────────────────────────────────────────────────

function loadBundles() {
  const dir = join(HERE, "bundles");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const codes = JSON.parse(readFileSync(join(dir, "codes.json"), "utf8")).codes;
  const screens = files.filter((f) => f !== "codes.json").map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
  return { codes, screens };
}

const wanted = (...keys) => !opt.only || keys.some((k) => opt.only.has(k));

// ── 코드 ────────────────────────────────────────────────────────────

async function codeView(id) {
  try { return await oasis("codeEdit", "view", { maruCodeId: id }); } catch (e) {
    if (/찾을 수 없|없습니다|E002|MDM0/.test(e.message) && !/권한/.test(e.message)) return null;
    throw e;
  }
}

function itemRow(it, status = "ADDED") {
  const r = { rowStatus: status, code: it.code, name: it.name, alterName: it.alterName ?? null, seq: it.seq, description: it.description ?? null };
  (it.lvls ?? []).forEach((v, i) => { r[`lvl${i + 1}`] = v; });
  (it.attrs ?? []).forEach((v, i) => { r[`attr${String(i + 1).padStart(2, "0")}`] = v === "" ? null : v; });
  return r;
}

async function loadCode(c) {
  const what = `코드 ${c.codeId} ${c.name} (${c.items.length}건)`;
  let view = opt.apply || opt.verify ? await codeView(c.codeId) : await codeView(c.codeId).catch(() => undefined);
  const v1 = view?.versions?.find((v) => v.ver === "1.000");
  if (v1?.status === "RELEASED") return mark("SKIP", `${what} — 이미 RELEASED`);
  if (!opt.apply) return mark("PLAN", `${what}${view ? ` — ${v1?.status ?? "버전 없음"} 이어 받기` : " — 새로 등록"}`);
  if (!view) {
    await oasis("codeMng", "reg", { maruCodeId: c.codeId, maruCodeName: c.name, description: c.description, lvlCnt: c.lvlCnt });
    view = await codeView(c.codeId);
  }
  const h = view.header;
  const labelsNow = [...Array(10).keys()].map((i) => h[`attr${String(i + 1).padStart(2, "0")}Name`] ?? null);
  const labelsWant = [...Array(10).keys()].map((i) => c.attrNames[i] ?? null);
  if (JSON.stringify(labelsNow) !== JSON.stringify(labelsWant) || h.lvlCnt !== c.lvlCnt || h.description !== c.description) {
    const p = { maruCodeId: c.codeId, auditVer: h.auditVer, maruCodeName: c.name, description: c.description, lvlCnt: c.lvlCnt };
    labelsWant.forEach((l, i) => { p[`attr${String(i + 1).padStart(2, "0")}Name`] = l; });
    await oasis("codeEdit", "save", p);
  }
  let iv = await oasis("codeItemEdit", "view", { maruCodeId: c.codeId, ver: "1.000" });
  const have = new Set((iv.rows ?? []).map((r) => r.code));
  const todo = c.items.filter((it) => !have.has(it.code));
  if (todo.length) {
    await oasis("codeItemEdit", "save", { maruCodeId: c.codeId, ver: "1.000", rowVersion: iv.selected.rowVersion },
      { rows: { rows: todo.map((it) => itemRow(it)) }, categories: { rows: [] }, members: { rows: [] } });
    iv = await oasis("codeItemEdit", "view", { maruCodeId: c.codeId, ver: "1.000" });
  }
  await oasis("codeConfirm", "confirm", { maruCodeId: c.codeId, ver: "1.000", rowVersion: iv.selected.rowVersion, applyFrom: opt.codeApplyFrom, warningsAcknowledged: true });
  mark("DONE", `${what} — 등록·확정(행 ${todo.length} 추가)`);
}

// ── 룰 ──────────────────────────────────────────────────────────────

async function ruleView(id, ver) {
  try { return await oasis("ruleEdit", "view", { maruRuleId: id, ver }); } catch (e) {
    if (String(e.message).includes("룰을 찾을 수 없습니다") || String(e.message).includes("룰 버전을 찾을 수 없습니다")) return null;
    throw e;
  }
}

const verOf = (view, ver) => view?.versions?.find((v) => v.ver === ver) ?? null;
const parseCells = (c) => (typeof c === "string" ? JSON.parse(c) : c ?? {});

/** 묶음 행(varName 키) → 저장 행(varId 키). rowId 는 새 행이면 음수 임시 번호. */
function tableRows(rule, rows, varIdByName, rowIds) {
  return rows.map((r, i) => {
    const cells = {};
    for (const [name, cell] of Object.entries(r.cells)) {
      const id = varIdByName[name];
      if (id == null) throw new Error(`${rule.ruleId}: 변수 ${name} 의 var_id 가 없다`);
      cells[String(id)] = cell;
    }
    return { rowId: rowIds ? rowIds[i] : -(i + 1), rowKind: r.rowKind, cells: JSON.stringify(cells), note: r.note ?? null };
  });
}

function hitValue(rule, hits, rowIdBySeq) {
  if (!hits.length) return null;
  const ids = hits.map((s) => rowIdBySeq[s]);
  return ids.length === 1 ? ids[0] : ids;
}

/** 묶음 rows 로 케이스 기대값(hit 포함)을 다시 계산해 묶음 기대값과 견준다. */
function caseBodies(rule, rowIdBySeq) {
  return rule.cases.map((c) => {
    const r = judge(rule, c.input);
    for (const [k, v] of Object.entries(c.expect)) {
      if (k === "hit") { if (v === null && r.hits.length) throw new Error(`${rule.ruleId} ${c.name}: 적중이 없어야 하는데 ${r.hits}`); continue; }
      if (JSON.stringify(r.results[k]) !== JSON.stringify(v)) throw new Error(`${rule.ruleId} ${c.name}: ${k} 흉내 ${JSON.stringify(r.results[k])} ≠ 기대 ${JSON.stringify(v)}`);
    }
    const expected = { ...c.expect };
    if (rowIdBySeq) expected.hit = hitValue(rule, r.hits, rowIdBySeq);
    return { part: "CASE", maruRuleId: rule.ruleId, caseName: c.name.slice(0, 200), inputJson: JSON.stringify(c.input), expectedJson: JSON.stringify(expected), description: c.description ?? "" };
  });
}

async function confirmRule(id, ver, applyFrom) {
  const v = await ruleView(id, ver);
  const rv = Number(verOf(v, ver)?.rowVersion);
  await oasis("ruleConfirm", "confirm", { maruRuleId: id, ver, rowVersion: rv, applyFrom, warningsAcknowledged: true });
}

/** MDM 에 저장된 테스트 케이스를 그 버전 정의로 돌린다(ruleEdit/execute runCases). */
async function runCases(id, ver) {
  const r = await oasis("ruleEdit", "execute", { maruRuleId: id, target: "VERSION", ver, runCases: true, inputJson: "{}" });
  const cases = r.cases ?? [];
  const bad = cases.filter((c) => c.pass !== true);
  for (const c of bad) log(`     케이스 실패 ${ver} ${c.caseName}: ${JSON.stringify(c.mismatches ?? c.errors).slice(0, 300)}`);
  return { total: cases.length, pass: cases.length - bad.length };
}

async function loadRule(rule) {
  const id = rule.ruleId;
  const what = `룰 ${id} ${rule.name} (${rule.hitPolicy}, 행 ${rule.rows.length}, 케이스 ${rule.cases.length})`;
  caseBodies(rule, null); // 흉내 판정으로 묶음 케이스부터 확인
  let view = opt.apply || opt.verify ? await ruleView(id, "1.000") : await ruleView(id, "1.000").catch(() => undefined);
  const s1 = verOf(view, "1.000")?.status ?? null;
  const revs = rule.revisions ?? [];
  const pendingRevs = revs.filter((rv) => verOf(view, rv.ver)?.status !== "RELEASED");
  if (s1 === "RELEASED" && !pendingRevs.length && opt.apply) {
    const res = [];
    for (const v of ["1.000", ...revs.map((r) => r.ver)]) { const c = await runCases(id, v); res.push(`${v} ${c.pass}/${c.total}`); if (c.pass !== c.total) tally.FAIL++; }
    log(`     MDM 케이스 ${res.join(" · ")}`);
  }
  if (s1 === "RELEASED" && !pendingRevs.length) return mark("SKIP", `${what} — 이미 RELEASED${revs.length ? `(개정 ${revs.map((r) => r.ver).join(",")} 포함)` : ""}`);
  if (!opt.apply) return mark("PLAN", `${what} — ${s1 ? `1.000 ${s1}` : "새로 등록"}${pendingRevs.length ? ` · 개정 ${pendingRevs.map((r) => r.ver).join(",")}` : ""}`);

  if (s1 !== "RELEASED") {
    if (!view) {
      await oasis("ruleMng", "reg", { maruRuleId: id, maruRuleName: rule.name, ruleKind: "DECISION", sourceKind: "MDM", description: rule.description, usageNote: rule.note });
      view = await ruleView(id, "1.000");
    }
    let rv = Number(verOf(view, "1.000").rowVersion);
    // 적중 정책을 행보다 먼저 빈 표로 저장한다. 한 요청에서 정책을 바꾸며 행을 저장하면 MDM 이 저장 뒤 분석을 옛 정책(FIRST)으로
    // 돌려(RuleTableService.storedHitPolicy 가 네이티브 UPDATE 전 엔티티를 읽는다) 열이 많은 표에서 도달 불가 분석이 끝나지 않는다.
    if (!(view.rows ?? []).length && verOf(view, "1.000").hitPolicy !== rule.hitPolicy) {
      const saved = await oasis("ruleEdit", "save", { part: "TABLE", maruRuleId: id, ver: "1.000", rowVersion: rv, hitPolicy: rule.hitPolicy }, { rows: { rows: [] } });
      rv = Number(saved.rowVersion);
      view = await ruleView(id, "1.000");
    }
    if (!(view.vars ?? []).length) {
      const cols = rule.columns.map((c, i) => ({ varId: -(i + 1), varKind: c.varKind, dispType: c.dispType, varName: c.varName, dataType: c.dataType,
        label: c.unit ? `${c.label}(${c.unit})` : c.label, description: c.desc ?? null }));
      const saved = await oasis("ruleEdit", "save", { part: "COLUMNS", maruRuleId: id, ver: "1.000", rowVersion: rv }, { rows: { rows: cols } });
      rv = Number(saved.rowVersion);
      view = await ruleView(id, "1.000");
    }
    const varIdByName = Object.fromEntries(view.vars.map((v) => [v.varName, v.varId]));
    if (!(view.rows ?? []).length) {
      try {
        const tbl = await oasis("ruleEdit", "save", { part: "TABLE", maruRuleId: id, ver: "1.000", rowVersion: rv, hitPolicy: rule.hitPolicy },
          { rows: { rows: tableRows(rule, rule.rows, varIdByName) } });
        const warn = (tbl.issues ?? []).length;
        if (warn) log(`     TABLE 경고 ${warn}건: ${[...new Set(tbl.issues.map((x) => x.code))].join(",")}`);
      } catch (e) { throw new Error(`${e.message} ${issuesText(e)}`); }
      view = await ruleView(id, "1.000");
    }
    const rowIdBySeq = Object.fromEntries(view.rows.filter((r) => r.rowKind === "NORMAL").map((r) => [r.seq, r.rowId]));
    if (Object.keys(rowIdBySeq).length !== rule.rows.length) throw new Error(`${id}: 저장된 행 ${Object.keys(rowIdBySeq).length} ≠ 묶음 ${rule.rows.length}`);
    const have = new Set((view.testCases ?? []).map((t) => t.caseName));
    const bodies = caseBodies(rule, rowIdBySeq).filter((b) => !have.has(b.caseName));
    for (const b of bodies) await oasis("ruleEdit", "save", b);
    try { await confirmRule(id, "1.000", rule.applyFrom); } catch (e) { throw new Error(`${e.message} ${issuesText(e)}`); }
    log(`     1.000 확정(적용 ${rule.applyFrom}), 케이스 ${bodies.length} 추가`);
  }

  for (const rev of revs) {
    let v = await ruleView(id, rev.ver);
    let st = verOf(v, rev.ver)?.status ?? null;
    if (st === "RELEASED") continue;
    if (!st) {
      const made = await oasis("ruleMng", "copy", { maruRuleId: id, verKind: "MINOR" });
      if (made.ver !== rev.ver) throw new Error(`${id}: 새 버전 ${made.ver} ≠ 묶음 ${rev.ver}`);
      v = await ruleView(id, rev.ver);
      st = verOf(v, rev.ver).status;
    }
    const varIdByName = Object.fromEntries(v.vars.map((x) => [x.varName, x.varId]));
    const rows = [...v.rows].sort((a, b) => a.seq - b.seq);
    let changed = false;
    const out = rows.map((r) => {
      const cells = parseCells(r.cells);
      const p = rev.patch.find((x) => x.seq === r.seq && r.rowKind === "NORMAL");
      if (p) for (const [name, cell] of Object.entries(p.cells)) {
        const k = String(varIdByName[name]);
        if (JSON.stringify(cells[k]) !== JSON.stringify(cell)) { cells[k] = cell; changed = true; }
      }
      return { rowId: r.rowId, rowKind: r.rowKind, cells: JSON.stringify(cells), note: r.note ?? null };
    });
    if (changed) {
      try {
        await oasis("ruleEdit", "save", { part: "TABLE", maruRuleId: id, ver: rev.ver, rowVersion: Number(verOf(v, rev.ver).rowVersion), hitPolicy: rule.hitPolicy }, { rows: { rows: out } });
      } catch (e) { throw new Error(`${e.message} ${issuesText(e)}`); }
    }
    await confirmRule(id, rev.ver, rev.applyFrom);
    log(`     ${rev.ver} 확정(적용 ${rev.applyFrom}) — ${rev.note}`);
  }
  const res = [];
  for (const v of ["1.000", ...revs.map((r) => r.ver)]) { const c = await runCases(id, v); res.push(`${v} ${c.pass}/${c.total}`); if (c.pass !== c.total) tally.FAIL++; }
  mark("DONE", `${what} — MDM 케이스 ${res.join(" · ")}`);
}

// ── mqc 읽기 확인 ───────────────────────────────────────────────────

async function verifyMqc(screens, codes) {
  const mqc = (action, params) => oasis("qcdRule", action, params, null, opt.mqc, "mqc", "SYSADMIN");
  const report = { rules: {}, codes: {} };
  for (const s of screens) for (const rule of s.rules) {
    if (!wanted(s.screen, rule.ruleId)) continue;
    try { await verifyRule(rule); } catch (e) { mark("FAIL", `mqc ${rule.ruleId}: ${e.message}`); }
  }
  async function verifyRule(rule) {
    const r = (await mqc("search", { ruleIds: rule.ruleId })).rules[0];
    const h = await mqc("history", { ruleId: rule.ruleId });
    const ok = r.rows.length === rule.rows.length && r.hitPolicy === rule.hitPolicy;
    let judged = 0, pass = 0;
    const fails = [];
    for (const c of rule.cases) {
      const j = await mqc("judge", { ruleId: rule.ruleId, inputJson: JSON.stringify(c.input) });
      judged++;
      const want = Object.entries(c.expect).filter(([k]) => k !== "hit");
      const good = c.expect.hit === null && want.length === 0
        ? j.status === "NO_MATCH"
        : j.status === "MATCHED" && want.every(([k, v]) => JSON.stringify(Array.isArray(v) ? v : v === null ? null : String(v)) === JSON.stringify(Array.isArray(j.results?.[k]) ? j.results[k].map(String) : j.results?.[k] == null ? null : String(j.results[k])) || (Number.isFinite(Number(v)) && Number(v) === Number(j.results?.[k])));
      if (good) pass++; else fails.push(`${c.name} → ${j.status} ${j.message ?? ""} ${JSON.stringify(j.results ?? {}).slice(0, 200)}`);
    }
    report.rules[rule.ruleId] = { ver: r.ver, versions: h.versions.map((v) => v.ver), rows: r.rows.length, hitPolicy: r.hitPolicy, judged, pass };
    mark(ok && pass === judged ? "DONE" : "FAIL", `mqc ${rule.ruleId} ver ${r.ver} 버전 [${h.versions.map((v) => v.ver).join(",")}] 행 ${r.rows.length}/${rule.rows.length} 판정 ${pass}/${judged}`);
    for (const f of fails) log(`     판정 불일치: ${f}`);
  }
  const ids = codes.filter((c) => wanted("codes", c.codeId)).map((c) => c.codeId);
  for (let i = 0; i < ids.length; i += 10) {
    let got;
    try { got = (await mqc("codes", { codeIds: ids.slice(i, i + 10).join(",") })).codes; } catch (e) { mark("FAIL", `mqc 코드 ${ids.slice(i, i + 10).join(",")}: ${e.message}`); continue; }
    for (const g of got) {
      const want = codes.find((c) => c.codeId === g.codeId);
      report.codes[g.codeId] = { ver: g.ver, items: g.items.length };
      mark(g.items.length === want.items.length ? "DONE" : "FAIL", `mqc 코드 ${g.codeId} ver ${g.ver} 항목 ${g.items.length}/${want.items.length}`);
    }
  }
  writeFileSync(join(HERE, "verify-result.json"), `${JSON.stringify(report, null, 1)}\n`);
}

// ── 실행 ────────────────────────────────────────────────────────────

async function main() {
  const { codes, screens } = loadBundles();
  log(`${opt.apply ? "APPLY" : opt.verify ? "VERIFY" : "DRY-RUN"} — MDM ${opt.base}${opt.only ? ` · only ${[...opt.only].join(",")}` : ""}`);
  if (opt.verify) {
    await verifyMqc(screens, codes);
  } else {
    for (const c of codes) {
      if (!wanted("codes", c.codeId, ...(c.screens ?? []))) continue;
      try { await loadCode(c); } catch (e) { mark("FAIL", `코드 ${c.codeId}: ${e.message} ${issuesText(e)}`); }
    }
    for (const s of screens) for (const r of s.rules) {
      if (!wanted(s.screen, r.ruleId)) continue;
      try { await loadRule(r); } catch (e) { mark("FAIL", `룰 ${r.ruleId}: ${e.message}`); }
    }
  }
  console.error(`\n요약 PLAN ${tally.PLAN} · SKIP ${tally.SKIP} · DONE ${tally.DONE} · FAIL ${tally.FAIL}`);
  process.exit(tally.FAIL ? 1 : 0);
}
main().catch((e) => { console.error(e.message); process.exit(2); });
