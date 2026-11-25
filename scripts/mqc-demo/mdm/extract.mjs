#!/usr/bin/env node
// 프로토타입(mes-to-be) 시드 → Maru 등록 묶음(bundles/*.json). 손으로 행을 적지 않는다.
// 사용: node scripts/mqc-demo/mdm/extract.mjs   (환경변수 MES_TO_BE 로 프로토타입 위치를 바꾼다)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toCell, resultCell, judge, numText, escapePattern } from "./lib/maru.mjs";
import { readModule, readBuildJson, literal, literalAfter, sliceBalanced, evalLiteral } from "./lib/proto.mjs";
import { buildCodes } from "./codes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "bundles");

// ── 공통 ────────────────────────────────────────────────────────────

/** 실명 가리기 — 메시지·비고에 남은 고객사 실명을 가명으로 바꾼다. */
const MASK = [[/삼성전자/g, "수요가 A"], [/삼성/g, "수요가 A"], [/LG전자/g, "수요가 B"], [/LG/g, "수요가 B"]];
export function mask(s) {
  let t = String(s ?? "");
  for (const [re, to] of MASK) t = t.replace(re, to);
  return t;
}

function col(varName, varKind, dataType, label, extra = {}) {
  return { varName, varKind, dataType, dispType: varKind === "RESULT" ? "Value" : dataType === "NUMBER" ? "2" : "1", label, ...extra };
}

/** 열 목록과 조건 맵(varName → As-Is 조건)·결과 맵(varName → 값)으로 행을 만든다. */
function makeRow(columns, conds, results, note) {
  const cells = {};
  for (const c of columns) {
    if (c.varKind === "COND") cells[c.varName] = conds[c.varName] && conds[c.varName].op ? conds[c.varName] : { op: "NA" };
    else {
      // 결과 셀은 비울 수 없다(MDM INCOMPLETE_RESULT) — 빈 문자 결과는 "-" 로 둔다.
      const v = results[c.varName];
      const rc = resultCell(v === null || v === undefined || v === "" ? (c.dataType === "STRING" ? "-" : null) : v, c.dataType);
      if (!rc) throw new Error(`결과 ${c.varName} 값이 없다`);
      cells[c.varName] = rc;
    }
  }
  return { rowKind: "NORMAL", cells, note: note ? mask(note).slice(0, 1000) : undefined };
}

function condOf(columns, varName, asIs, where) {
  const c = columns.find((x) => x.varName === varName);
  return toCell(asIs, c.dataType, where);
}

/** 입력 하나로 판정해 기대값을 만든다(FIRST: 결과 + RULE_KEY, COLLECT: 목록). */
function expectFrom(rule, input, keys) {
  const r = judge(rule, input);
  const expect = {};
  for (const k of keys) expect[k] = r.results[k];
  return { expect, hits: r.hits };
}

/** 행 하나를 만족하는 입력(자동 케이스). 숫자 NA 는 0, 문자 NA 는 "". */
function satisfyingInput(rule, row) {
  const input = {};
  for (const c of rule.columns.filter((x) => x.varKind === "COND")) {
    const cell = row.cells[c.varName];
    const num = c.dataType === "NUMBER";
    let v = num ? "0" : "";
    switch (cell.op) {
      case "NA": v = num ? "0" : ""; break;
      case "EQ": v = num ? cell.left : cell.left.replace(/%/g, "X").replace(/\\(.)/g, "$1"); break;
      case "IN": v = cell.list[0]; break;
      case "NE": v = num ? String(Number(cell.left) + 1) : `${cell.left}Z`; break;
      case "NOT_IN": v = num ? "999999" : "ZZZ"; break;
      case "GT": v = String(Number(cell.left) + 1); break;
      case "GE": case "LE": v = cell.left; break;
      case "LT": v = String(Number(cell.left) - 1); break;
      case "IS_NULL": v = null; break;
      case "NOT_NULL": v = num ? "1" : "X"; break;
      default: v = cell.op.startsWith("<=") ? cell.left : String((Number(cell.left) + Number(cell.right)) / 2);
    }
    input[c.varName] = v;
  }
  return input;
}

/** 자동 케이스 — 행 몇 개를 골라 그 행을 만족하는 입력과, 흉내 판정의 기대값. */
function autoCases(rule, picks, keys) {
  const out = [];
  for (const i of picks) {
    const row = rule.rows[i];
    if (!row) continue;
    const input = satisfyingInput(rule, row);
    const { expect } = expectFrom(rule, input, keys);
    const key = row.cells.RULE_KEY?.val ?? `순번 ${i + 1}`;
    out.push({ name: `자동: ${key} 조건을 채운 입력`, input, expect, description: "행 조건을 채운 입력의 첫 적중(As-Is 판정 흉내로 기대값 계산)" });
  }
  return out;
}

function evenPicks(n, k) {
  if (n <= k) return [...Array(n).keys()];
  return [...new Set([...Array(k).keys()].map((i) => Math.round((i * (n - 1)) / (k - 1))))];
}

// ── 1·2. 폭수축량·폭마진량 (C10B1073~1079) ─────────────────────────

const WIDTH_LABEL = {
  reduction: {
    PLTCM: { THK: "PLTCM 출측두께", WID: "PLTCM 폭" }, CGL: { THK: "압연SET 두께", WID: "CGL 적용 폭" },
    EGL: { THK: "압연SET 두께", WID: "EGL 적용 폭" }, JZ: { THK: "압연SET 두께", WID: "주문 폭" }, CCL: { THK: "압연SET 두께", WID: "주문 폭" },
  },
  margin: { PLTCM: { WID: "PLTCM 출측폭" }, JZ: { THK: "두께" } },
};
const WIDTH_VAR = {
  rawCd: ["RAW_MAT_CD", "STRING", "원자재코드"], procCd: ["PROC_CD", "STRING", "공정(라인)코드"], prodCd: ["PRD_NM_CD", "STRING", "품명코드"],
  matCd: ["MAT_CD", "STRING", "재질코드"], pltcmThk: ["THK", "NUMBER", "두께"], prodWid: ["WID", "NUMBER", "폭"], pltcmWid: ["WID", "NUMBER", "폭"],
  rawThk: ["RAW_THK", "NUMBER", "원자재두께"], cust: ["CUS_CD", "STRING", "고객사"], edge: ["ORD_EDG_ASG_TP", "STRING", "주문Edge지정구분"],
  prodForm: ["PRD_SHP", "STRING", "제품형태"], coatWay: ["COAT_WAY_CD", "STRING", "코팅방식"], resin: ["RESIN_TP", "STRING", "수지타입"],
  thk: ["THK", "NUMBER", "두께"], bom: ["CCL_BOM_NO", "STRING", "CCL BOM번호"], spangle: ["ORD_SPNL_TP", "STRING", "주문Spangle구분"],
};
const PROC_LABEL = { PLTCM: "PLTCM", CGL: "CGL(냉연도금)", EGL: "EGL(전해도금)", JZ: "정전(정전처리)", CCL: "CCL(칼라코팅)" };

function widthRule(kind, p) {
  const resName = kind === "reduction" ? "WID_SHRINK_QTY" : "WID_MARGIN_QTY";
  const resLabel = kind === "reduction" ? "폭감소량" : "마진폭";
  const labels = WIDTH_LABEL[kind][p.proc] ?? {};
  const columns = p.fields.map((f) => {
    const [name, type, base] = WIDTH_VAR[f.key];
    const label = labels[name] ?? base;
    const unit = type === "NUMBER" ? "mm" : undefined;
    return col(name, "COND", type, label, { unit, desc: `레거시 조건 이름 "${f.label}"` });
  });
  columns.push(col(resName, "RESULT", "NUMBER", resLabel, { unit: "mm", desc: kind === "reduction" ? "진입 폭 − 폭감소량 = 출측 폭" : "주문 폭 − 마진폭 = 제품 폭" }));
  columns.push(col("RULE_KEY", "RESULT", "STRING", "룰 ID", { desc: "프로토타입 룰 ID(WR-·WM-)" }));
  columns.push(col("PRIO", "RESULT", "NUMBER", "우선순위", { desc: "작을수록 먼저 평가(행 순서에 이미 반영)" }));
  columns.push(col("LEGACY_NO", "RESULT", "NUMBER", "순번", { desc: "레거시 순번(no). 0 = 예외" }));
  columns.push(col("SRC_NOTE", "RESULT", "STRING", "원본 주의", { desc: "NOT_CHECK 인데 비교값이 남은 원본 행 표시(판정 미사용)" }));
  const sorted = [...p.rules].filter((r) => r.status === "Y").sort((a, b) => a.prio - b.prio || a.no - b.no || a.id.localeCompare(b.id));
  const rows = sorted.map((r) => {
    const conds = {};
    for (const f of p.fields) conds[WIDTH_VAR[f.key][0]] = condOf(columns, WIDTH_VAR[f.key][0], r.cond[f.key] ?? { op: "NOT_CHECK" }, `${p.ruleId} ${r.id} ${f.key}`);
    const stray = (r.stray ?? []).map((s) => `원본주의 ${s.label} ${s.v1}~${s.v2} 보존(판정 미사용)`).join(" · ");
    const note = [`레거시 no.${r.no} · 우선순위 ${r.prio} · 원본 ${r.srcRow}행`, stray, r.note].filter(Boolean).join(" · ");
    return makeRow(columns, conds, { [resName]: r.res, RULE_KEY: r.id, PRIO: r.prio, LEGACY_NO: r.no, SRC_NOTE: stray || null }, note);
  });
  return {
    ruleId: p.ruleId, name: p.name, title: p.name, legacyIds: [p.ruleId], group: p.proc, groupLabel: PROC_LABEL[p.proc] ?? p.proc,
    hitPolicy: "FIRST", applyFrom: p.startAt,
    description: `레거시 업무기준 ${p.ruleId} ${p.name} v${p.version}(유형 ${p.type}, 시작 ${p.startAt}) 이관 — mes-to-be width_rule_seed.json`,
    note: `행 순서 = 우선순위 → 레거시 순번 → ID. 첫 적중 적용, 없으면 ${resLabel} 0 으로 본다.`,
    columns, rows, cases: [],
  };
}

const OLD_WIDTH_CASES = [
  ["C10B1074", "H32 두께 0.23 폭 800 → 순번 1 수축 2", { RAW_MAT_CD: "H32", THK: "0.23", WID: "800" }, 2],
  ["C10B1074", "H32 두께 0.249 경계 포함 → 순번 1", { RAW_MAT_CD: "H32", THK: "0.249", WID: "800" }, 2],
  ["C10B1074", "H32 두께 0.3 폭 1100.9 → 수축 2", { RAW_MAT_CD: "H32", THK: "0.3", WID: "1100.9" }, 2],
  ["C10B1074", "H32 두께 0.3 폭 1101 → 수축 3", { RAW_MAT_CD: "H32", THK: "0.3", WID: "1101" }, 3],
  ["C10B1074", "E32 는 순번 22 수축 0", { RAW_MAT_CD: "E32", THK: "0.6", WID: "1000" }, 0],
  ["C10B1075", "84 L EA H36 0.5 1000 → 순번 1 수축 0", { PROC_CD: "84", PRD_NM_CD: "L", MAT_CD: "EA", RAW_MAT_CD: "H36", THK: "0.5", WID: "1000" }, 0],
  ["C10B1075", "82 L 5A 0.3 1000 → 순번 15 수축 7", { PROC_CD: "82", PRD_NM_CD: "L", MAT_CD: "5A", RAW_MAT_CD: "", THK: "0.3", WID: "1000" }, 7],
  ["C10B1075", "82 L 4A 0.4 1000 → 순번 12 수축 5", { PROC_CD: "82", PRD_NM_CD: "L", MAT_CD: "4A", RAW_MAT_CD: "", THK: "0.4", WID: "1000" }, 5],
  ["C10B1075", "82 L CA H35 1.0 1000 → 순번 17 수축 3", { PROC_CD: "82", PRD_NM_CD: "L", MAT_CD: "CA", RAW_MAT_CD: "H35", THK: "1.0", WID: "1000" }, 3],
  ["C10B1075", "82 L CA ZZZ → 적중 없음", { PROC_CD: "82", PRD_NM_CD: "L", MAT_CD: "CA", RAW_MAT_CD: "ZZZ", THK: "1.0", WID: "1000" }, null],
  ["C10B1076", "92 2 5A H7J 0.7 900 → 순번 1 수축 4", { PROC_CD: "92", PRD_NM_CD: "2", MAT_CD: "5A", RAW_MAT_CD: "H7J", THK: "0.7", WID: "900" }, 4],
  ["C10B1076", "91 E 1A N25 → NOT_IN 걸려 수축 0", { PROC_CD: "91", PRD_NM_CD: "E", MAT_CD: "1A", RAW_MAT_CD: "N25", THK: "0.5", WID: "1000" }, 0],
  ["C10B1076", "91 E 1A H32 → 수축 2", { PROC_CD: "91", PRD_NM_CD: "E", MAT_CD: "1A", RAW_MAT_CD: "H32", THK: "0.5", WID: "1000" }, 2],
  ["C10B1077", "A 1.0 1000 → 수축 2", { PRD_NM_CD: "A", MAT_CD: "", THK: "1.0", WID: "1000" }, 2],
  ["C10B1077", "A 3.2 경계 포함 → 수축 2", { PRD_NM_CD: "A", MAT_CD: "", THK: "3.2", WID: "1000" }, 2],
  ["C10B1077", "A 3.3 → 수축 0", { PRD_NM_CD: "A", MAT_CD: "", THK: "3.3", WID: "1000" }, 0],
  ["C10B1078", "2 5A 0.5 1000 → 순번 1 수축 0", { PRD_NM_CD: "2", MAT_CD: "5A", THK: "0.5", WID: "1000" }, 0],
];

function widthBundles() {
  const seed = readBuildJson("width_rule_seed.json");
  const red = seed.processes.reduction.map((p) => widthRule("reduction", p));
  const mar = seed.processes.margin.map((p) => widthRule("margin", p));
  for (const [id, name, input, qty] of OLD_WIDTH_CASES) {
    const rule = red.find((r) => r.ruleId === id);
    const { expect } = expectFrom(rule, input, ["WID_SHRINK_QTY", "RULE_KEY"]);
    const got = expect.WID_SHRINK_QTY == null ? null : Number(expect.WID_SHRINK_QTY);
    if (qty !== undefined && got !== qty) throw new Error(`${id} ${name}: 흉내 판정 ${got} ≠ 프로토타입 기대 ${qty}`);
    rule.cases.push({ name, input, expect: expect.RULE_KEY == null ? { hit: null } : expect, description: "mes-to-be tests/width-rule-seed.test.js 기대값" });
  }
  for (const r of mar) r.cases.push(...autoCases(r, evenPicks(r.rows.length, 4), ["WID_MARGIN_QTY", "RULE_KEY"]));
  for (const r of red) if (r.cases.length < 3) r.cases.push(...autoCases(r, evenPicks(r.rows.length, 3 - r.cases.length + 1).slice(1), ["WID_SHRINK_QTY", "RULE_KEY"]));
  return [
    { screen: "lineWidthShrinkage", rules: red },
    { screen: "lineWidthMargin", rules: mar },
  ];
}

// ── 3. 압연두께Set (C10B2060) ───────────────────────────────────────

function rollingBundle() {
  const seed = readBuildJson("rolling_thickness_set_seed.json");
  const h = seed.head;
  const F = [
    ["prod", "PRD_NM_CD", "STRING", "품명코드"], ["org", "SPEC_ORG_CD", "STRING", "규격기관"], ["spec", "SPC_AVR", "STRING", "규격약호"],
    ["use", "ORD_USG_CD", "STRING", "주문용도"], ["cust", "CUS_CD", "STRING", "고객사"], ["thkKind", "ORD_THK_TP", "STRING", "주문두께구분"],
    ["thkMng", "ORD_THK_MNG_CD", "STRING", "두께관리코드"], ["coat", "GW_ASG_CD", "STRING", "도금량코드"],
    ["thk", "THK", "NUMBER", "주문두께"], ["wid", "WID", "NUMBER", "주문폭"],
  ];
  const columns = F.map(([, n, t, l]) => col(n, "COND", t, l, t === "NUMBER" ? { unit: "mm" } : {}));
  columns.push(col("THK_ADJ", "RESULT", "NUMBER", "두께보정치", { unit: "mm", desc: "Set 두께 = 주문두께 + 보정치(음수 = 얇게)" }));
  columns.push(col("THK_COR_UNT", "RESULT", "STRING", "두께보정단위", { desc: "코드 QC_THK_COR_UNT(현재 모두 CRN)" }));
  columns.push(col("RULE_KEY", "RESULT", "STRING", "룰 ID", { desc: "프로토타입 룰 ID(TS-nnn)" }));
  const rules = [...seed.rules].filter((r) => r.status === "Y").sort((a, b) => a.no - b.no);
  const rows = rules.map((r) => {
    const conds = {};
    for (const [k, n] of F) conds[n] = condOf(columns, n, r.cond[k], `C10B2060 no.${r.no} ${k}`);
    const key = `TS-${String(r.no).padStart(3, "0")}`;
    return makeRow(columns, conds, { THK_ADJ: r.adj, THK_COR_UNT: r.unit, RULE_KEY: key }, `레거시 no.${r.no} · 원본 ${r.srcRow}행 · 원문 ${r.adjRaw}`);
  });
  const rule = {
    ruleId: "C10B2060", name: h.name, title: "압연두께Set치보정기준", legacyIds: ["C10B2060"], hitPolicy: "FIRST", applyFrom: h.startAt,
    description: `레거시 업무기준 C10B2060 ${h.name} v${h.version}(유형 ${h.type}, 시작 ${h.startAt}) 이관 — mes-to-be rolling_thickness_set_seed.json`,
    note: "행 순서 = 레거시 순번. 첫 적중 적용, 없으면 보정 0 (Set 두께 = 주문두께).",
    columns, rows, cases: [],
  };
  const blank = Object.fromEntries(F.map(([, n, t]) => [n, t === "NUMBER" ? "1000" : ""]));
  const ex = { ...blank, PRD_NM_CD: "4", SPEC_ORG_CD: "KS", ORD_USG_CD: "C11004", ORD_THK_TP: "1", ORD_THK_MNG_CD: "Q", THK: "0.45", WID: "1000" };
  const e1 = expectFrom(rule, ex, ["THK_ADJ", "RULE_KEY"]).expect;
  if (e1.RULE_KEY !== "TS-016" || Number(e1.THK_ADJ) !== -0.04) throw new Error(`C10B2060 화면 예시 불일치 ${JSON.stringify(e1)}`);
  rule.cases.push({ name: "품명 4 · KS · C11004 · 두께구분 1 · 두께관리 Q · 0.45 → 순번 16 보정 −0.04", input: ex, expect: e1, description: "rolling-thickness-set.html 간편판정 예시" });
  rule.cases.push(...autoCases(rule, [0, 30, 60, 81], ["THK_ADJ", "RULE_KEY"]));
  return { screen: "rollingThicknessSet", rules: [rule] };
}

// ── 4. 공정라우팅 ──────────────────────────────────────────────────

function routingBundle() {
  const src = readModule("process-routing.html");
  const seed = literalAfter(src, /\/\/ 공정라우팅모듈\.xlsx[^\n]*\n/);
  const columns = [
    col("PRD_NM_CD", "COND", "STRING", "제품군"), col("MAT_CD", "COND", "STRING", "재질코드"), col("EMBS_CD", "COND", "STRING", "엠보스무늬"),
    col("ORD_SPNL_TP", "COND", "STRING", "Spangle구분"), col("GW_ASG_CD", "COND", "STRING", "도금량코드"), col("ORD_SUR_HND_CD", "COND", "STRING", "표면처리코드"),
    col("THK", "COND", "NUMBER", "주문두께", { unit: "mm" }), col("WID", "COND", "NUMBER", "주문폭", { unit: "mm" }),
    col("ROUTE_CD", "RESULT", "STRING", "냉연도금공정", { desc: "1P(PLTCM) → 83(CGL) → AX(CCL) 처럼 통과 공정을 잇는 코드" }),
    col("RULE_KEY", "RESULT", "STRING", "룰 ID"),
  ];
  const rows = seed.map((p, i) => makeRow(columns, {
    PRD_NM_CD: { op: "EQ", left: escapePattern(p.prod) },
    THK: toCell({ op: "BETWEEN2", v1: p.thk[0], v2: p.thk[1] }, "NUMBER"), WID: toCell({ op: "BETWEEN2", v1: p.wid[0], v2: p.wid[1] }, "NUMBER"),
  }, { ROUTE_CD: p.route, RULE_KEY: `PR-${String(i + 1).padStart(3, "0")}` }, "공정라우팅모듈.xlsx"));
  const rule = {
    ruleId: "QD_PROCESS_ROUTING", name: "공정라우팅", title: "공정라우팅(냉연도금공정)", hitPolicy: "FIRST", applyFrom: "2026-11-01 00:00:00",
    description: "공정라우팅모듈.xlsx(조건 8열·결과 1열) — mes-to-be process-routing.html 시드", note: "제품군은 체크 안 함으로 둘 수 없다. 첫 적중 적용.",
    columns, rows, cases: [],
  };
  const base = { PRD_NM_CD: "", MAT_CD: "", EMBS_CD: "", ORD_SPNL_TP: "", GW_ASG_CD: "", ORD_SUR_HND_CD: "" };
  const ex = [
    ["제품군 G · 두께 1.0 · 폭 1000 → 1P-83", { ...base, PRD_NM_CD: "G", THK: "1.0", WID: "1000" }, "1P-83"],
    ["제품군 3 · 두께 0.5 · 폭 1200 → 1P-83-AX", { ...base, PRD_NM_CD: "3", THK: "0.5", WID: "1200" }, "1P-83-AX"],
    ["제품군 3 · 두께 2.0 → 두께범위 밖이라 해당 없음", { ...base, PRD_NM_CD: "3", THK: "2.0", WID: "1200" }, null],
    ["제품군 G · 폭 1600 → 상한 미포함이라 해당 없음", { ...base, PRD_NM_CD: "G", THK: "1.0", WID: "1600" }, null],
  ];
  for (const [name, input, route] of ex) {
    const { expect } = expectFrom(rule, input, ["ROUTE_CD", "RULE_KEY"]);
    if (expect.ROUTE_CD !== route) throw new Error(`공정라우팅 ${name}: ${expect.ROUTE_CD}`);
    rule.cases.push({ name, input, expect: route == null ? { hit: null } : expect, description: "process-routing.html 간편판정 예시" });
  }
  return { screen: "processRouting", rules: [rule] };
}

// ── 5. 원자재강종 ──────────────────────────────────────────────────

function rawGradeBundle() {
  const src = readModule("raw-material-grade.html");
  const i = src.indexOf("st.rules=[", src.indexOf("function seedState"));
  const text = sliceBalanced(src, i);
  const ruleFn = (o) => ({ id: o.id, no: o.no, kind: o.kind, baseId: o.baseId || null, prod: o.prod, spec: o.spec, useOp: o.useOp || "NOT_CHECK", use: o.use || "",
    thkOp: o.thkOp || "BETWEEN2", thk1: o.thk1, thk2: o.thk2, mat: o.mat || "", pri: o.pri || "", alt: o.alt || [], msg: o.msg || "", type: o.type || "1A0",
    status: o.status || "Y", review: !!o.review, note: o.note || "" });
  const seed = evalLiteral(text, { rule: ruleFn });
  const byId = Object.fromEntries(seed.map((r) => [r.id, r]));
  const columns = [
    col("PRD_NM_CD", "COND", "STRING", "품명코드"), col("SPC_AVR", "COND", "STRING", "규격약호"), col("ORD_USG_CD", "COND", "STRING", "주문용도코드"),
    col("THK", "COND", "NUMBER", "두께", { unit: "mm" }),
    col("MAT_CD", "RESULT", "STRING", "재질코드"), col("RAW_MAT_PRI", "RESULT", "STRING", "적정원료"),
    col("RAW_MAT_ALT", "RESULT", "STRING", "차선원료", { desc: "쉼표 목록, 우선순위 순" }), col("RAW_GRADE_MSG", "RESULT", "STRING", "원자재강종 메시지"),
    col("RULE_KEY", "RESULT", "STRING", "룰 ID", { desc: "RM-nnn" }), col("RULE_KIND", "RESULT", "STRING", "기준유형", { desc: "BASE 도금기준 · DERIVED 칼라파생 · STANDALONE 칼라전용(QC_RULE_KIND)" }),
    col("BASE_RULE_KEY", "RESULT", "STRING", "원판 룰 ID", { desc: "DERIVED 일 때 상속받은 도금기준 룰" }),
    col("INHERIT_NOTE", "RESULT", "STRING", "출처", { desc: "원판 상속 여부(재질·적정원료·차선원료)" }),
    col("LEGACY_TYPE", "RESULT", "STRING", "유형", { desc: "1A0 일반 · 1B1 연관판단(QC_LEGACY_RULE_TYPE)" }),
    col("LEGACY_NO", "RESULT", "NUMBER", "순번", { desc: "0 = 예외(먼저 평가)" }),
  ];
  const kept = seed.filter((r) => r.status === "Y").sort((a, b) => a.no - b.no || a.id.localeCompare(b.id));
  const rows = kept.map((r) => {
    let mat = r.mat, pri = r.pri, alt = r.alt, src2 = "자체 기준";
    if (r.kind === "DERIVED") {
      const b = byId[r.baseId];
      mat = b.mat; pri = b.pri;
      const own = r.alt.length > 0;
      alt = own ? r.alt : b.alt;
      src2 = own ? `원판 ${b.id} 상속 (재질·적정원료)` : `원판 ${b.id} 상속 (차선 포함)`;
    }
    const conds = {
      PRD_NM_CD: toCell({ op: "=", v1: r.prod }, "STRING"), SPC_AVR: toCell({ op: "=", v1: r.spec }, "STRING"),
      ORD_USG_CD: toCell({ op: r.useOp, v1: r.use }, "STRING"), THK: toCell({ op: r.thkOp, v1: r.thk1, v2: r.thk2 }, "NUMBER"),
    };
    const note = [r.no === 0 ? "예외(순번 0)" : "", r.review ? "재검토 필요(원판 변경)" : "", r.note].filter(Boolean).join(" · ");
    return makeRow(columns, conds, {
      MAT_CD: mat, RAW_MAT_PRI: pri, RAW_MAT_ALT: alt.join(","), RAW_GRADE_MSG: mask(r.msg), RULE_KEY: r.id, RULE_KIND: r.kind,
      BASE_RULE_KEY: r.baseId, INHERIT_NOTE: src2, LEGACY_TYPE: r.type, LEGACY_NO: r.no,
    }, note);
  });
  const excluded = seed.filter((r) => r.status !== "Y").map((r) => `${r.id}(상태 ${r.status}: ${mask(r.note)})`);
  const rule = {
    ruleId: "QD_RAW_MATERIAL_GRADE", name: "원자재강종", title: "원자재강종(원판연계)", hitPolicy: "FIRST", applyFrom: "2026-11-01 00:00:00",
    description: "AS-IS 원자재강종 룰 시트를 원판연계(도금기준→칼라파생) 모델로 정리 — mes-to-be raw-material-grade.html 시드. 파생 룰의 재질·원료는 원판에서 풀어 넣었다.",
    note: `행 순서 = 순번(0 예외 먼저) → ID. 파생(DERIVED) 행의 재질·적정원료·차선원료는 원판 값을 풀어 넣었다(BASE_RULE_KEY 로 원판을 가리킨다). 사용중(Y)만 실었다 — 제외: ${excluded.join(", ")}. v1.001: RM-006 두께범위 0.2≤t<2.2 → 0.2≤t<2.5(프로토타입 변경 이력), RM-007 재검토 필요.`,
    columns, rows, cases: [],
  };
  // v1.000 은 변경 전 모습(RM-006 상한 2.2), v1.001 이 현재 시드(2.5).
  const rm6 = rows.findIndex((r) => r.cells.RULE_KEY.val === "RM-006");
  rule.revisions = [{ ver: "1.001", applyFrom: "2026-11-20 09:00:00", note: "RM-006 두께범위 상한 2.2 → 2.5(박서연)", patch: [{ seq: rm6 + 1, cells: { THK: rows[rm6].cells.THK } }] }];
  rows[rm6] = { ...rows[rm6], cells: { ...rows[rm6].cells, THK: { ...rows[rm6].cells.THK, right: "2.2" } } };
  const base = { ORD_USG_CD: "" };
  const ex = [
    ["품명 3 · KS-3-CGCC · 두께 0.4 → 예외(순번 0) BA", { ...base, PRD_NM_CD: "3", SPC_AVR: "KS-3-CGCC", THK: "0.4" }, "RM-011"],
    ["품명 3 · KS-3-CGCC · 두께 1.0 → 예외 RM-012", { ...base, PRD_NM_CD: "3", SPC_AVR: "KS-3-CGCC", THK: "1.0" }, "RM-012"],
    ["품명 3 · KS-3-CGCC · 두께 0.3 → 칼라파생 RM-002(원판 RM-001 상속)", { ...base, PRD_NM_CD: "3", SPC_AVR: "KS-3-CGCC", THK: "0.3" }, "RM-002"],
    ["품명 G · KS-G-SGCC · 두께 1.0 → 도금기준 RM-001", { ...base, PRD_NM_CD: "G", SPC_AVR: "KS-G-SGCC", THK: "1.0" }, "RM-001"],
    ["품명 3 · KS-3-CGC400 → 미완료(F) 룰은 판정 제외", { ...base, PRD_NM_CD: "3", SPC_AVR: "KS-3-CGC400", THK: "0.4" }, null],
  ];
  for (const [name, input, key] of ex) {
    const { expect } = expectFrom(rule, input, ["MAT_CD", "RAW_MAT_PRI", "RAW_MAT_ALT", "RULE_KEY"]);
    if (expect.RULE_KEY !== key) throw new Error(`원자재강종 ${name}: ${expect.RULE_KEY}`);
    rule.cases.push({ name, input, expect: key == null ? { hit: null } : expect, description: "raw-material-grade.html 간편판정 예시" });
  }
  return { screen: "rawMaterialGrade", rules: [rule] };
}

// ── 6. 규격약호 ────────────────────────────────────────────────────

function specCodeBundle() {
  const src = readModule("spec-code.html");
  const thk = literalAfter(src, /\/\/ AS-IS 규격약호 시트\(캡쳐\) — 규격코드 → 두께관리기준\s*\n/);
  const map = literalAfter(src, /\/\/ AS-IS 규격약호 시트\(캡쳐\) — 규격코드 \+ 강종코드 → 원판강종코드\s*\n/);
  const c1 = [col("SPEC_ORG_CD", "COND", "STRING", "규격코드"), col("THK_STD_CD", "RESULT", "STRING", "두께관리기준", { desc: "BMT 소지철 두께 · TCT 도금 포함 두께(QC_THK_STD)" }), col("RULE_KEY", "RESULT", "STRING", "룰 ID")];
  const rows1 = [];
  const excluded = [];
  thk.forEach(([spec, std], i) => {
    const key = `TK-${String(i + 1).padStart(3, "0")}`;
    if (!std) { excluded.push(`${key} ${spec}(상태 F, 두께관리기준 미확정 — AS-IS "??")`); return; }
    rows1.push(makeRow(c1, { SPEC_ORG_CD: toCell({ op: "=", v1: spec }, "STRING") }, { THK_STD_CD: std, RULE_KEY: key }));
  });
  const r1 = {
    ruleId: "QD_SPEC_THK_STD", name: "규격약호 두께관리기준", title: "두께관리기준(규격코드 → BMT/TCT)", hitPolicy: "FIRST", applyFrom: "2026-11-01 00:00:00",
    description: "AS-IS 규격약호 시트(캡쳐) — 규격코드 → 두께관리기준. mes-to-be spec-code.html 시드",
    note: `사용중(Y)만 실었다 — 제외: ${excluded.join(", ")}. v1.001: TK-004 EN 두께관리기준 BMT → TCT(프로토타입 변경 이력, 박서연).`,
    columns: c1, rows: rows1, cases: [],
  };
  const en = rows1.findIndex((r) => r.cells.RULE_KEY.val === "TK-004");
  r1.revisions = [{ ver: "1.001", applyFrom: "2026-11-20 09:00:00", note: "TK-004 EN 두께관리기준 BMT → TCT(박서연)", patch: [{ seq: en + 1, cells: { THK_STD_CD: { val: "TCT" } } }] }];
  rows1[en] = { ...rows1[en], cells: { ...rows1[en].cells, THK_STD_CD: { val: "BMT" } } };

  const c2 = [col("SPEC_ORG_CD", "COND", "STRING", "규격코드"), col("STL_GRD_CD", "COND", "STRING", "강종코드"),
    col("BASE_STL_GRD_CD", "RESULT", "STRING", "원판강종코드"), col("RULE_KEY", "RESULT", "STRING", "룰 ID")];
  const rows2 = map.map(([g, b], i) => makeRow(c2, { SPEC_ORG_CD: toCell({ op: "=", v1: "KS" }, "STRING"), STL_GRD_CD: toCell({ op: "=", v1: g }, "STRING") },
    { BASE_STL_GRD_CD: b, RULE_KEY: `MP-${String(i + 1).padStart(3, "0")}` }));
  const r2 = {
    ruleId: "QD_SPEC_BASE_GRADE", name: "규격약호 원판강종 매핑", title: "원판강종 매핑(규격코드 + 강종코드 → 원판강종)", hitPolicy: "FIRST", applyFrom: "2026-11-01 00:00:00",
    description: "AS-IS 규격약호 시트(캡쳐) — 규격코드 + 강종코드 → 원판강종코드. mes-to-be spec-code.html 시드", note: "첫 적중 적용.",
    columns: c2, rows: rows2, cases: [],
  };
  for (const [name, input, std] of [["KS → BMT", { SPEC_ORG_CD: "KS" }, "BMT"], ["ASTM → TCT", { SPEC_ORG_CD: "ASTM" }, "TCT"], ["BIS 는 미정(F)이라 결과 없음", { SPEC_ORG_CD: "BIS" }, null]]) {
    const { expect } = expectFrom(r1, input, ["THK_STD_CD", "RULE_KEY"]);
    if (expect.THK_STD_CD !== std) throw new Error(`규격약호 ${name}`);
    r1.cases.push({ name, input, expect: std == null ? { hit: null } : expect, description: "spec-code.html 간편조회 예시" });
  }
  for (const [name, input, b] of [["KS · CGCC → SGCC", { SPEC_ORG_CD: "KS", STL_GRD_CD: "CGCC" }, "SGCC"], ["KS · CGC340(SGC245Y) → SGC340(SGC245Y)", { SPEC_ORG_CD: "KS", STL_GRD_CD: "CGC340(SGC245Y)" }, "SGC340(SGC245Y)"], ["JIS · CGCC → 매핑 없음", { SPEC_ORG_CD: "JIS", STL_GRD_CD: "CGCC" }, null]]) {
    const { expect } = expectFrom(r2, input, ["BASE_STL_GRD_CD", "RULE_KEY"]);
    if (expect.BASE_STL_GRD_CD !== b) throw new Error(`원판강종 ${name}`);
    r2.cases.push({ name, input, expect: b == null ? { hit: null } : expect, description: "spec-code.html 간편조회 예시" });
  }
  return { screen: "specCode", rules: [r1, r2] };
}

// ── 7. 주문단중에러 ────────────────────────────────────────────────

function weightBundle() {
  const src = readModule("order-weight-error.html");
  const num = (name) => Number(new RegExp(`${name}\\s*=\\s*([0-9.]+)`).exec(src)[1]);
  const [rMin, rMax, rStep, cMin, cMax] = ["ROW_MIN", "ROW_MAX", "ROW_STEP", "COL_MIN", "COL_MAX"].map(num);
  const lo = Number(/min:([0-9.]+)/.exec(src)[1]);
  const hi = Number(/max:([0-9.]+)/.exec(src)[1]);
  const overrides = {};
  for (const m of src.matchAll(/st\.overrides\[cellKey\(([0-9.]+),(\d+)\)\]=([0-9.]+)/g)) overrides[`${Number(m[1]).toFixed(1)}-${m[2]}`] = Number(m[3]);
  const columns = [
    col("ORD_UNT_WGT", "COND", "NUMBER", "주문단중", { unit: "MT" }), col("SPLIT_CNT", "COND", "NUMBER", "분할 수", { unit: "개" }),
    col("SPLIT_UNT_WGT", "RESULT", "NUMBER", "분할 단중", { unit: "MT/개", desc: "주문단중 ÷ 분할 수(소수 둘째 자리 반올림), 수정값이 있으면 수정값" }),
    col("IN_RANGE_YN", "RESULT", "STRING", "허용범위", { desc: `Y = 허용 단중 ${lo}~${hi} MT/개 안(생산 가능) · N = 범위 밖. 범위는 코드 QC_ORD_WGT_LIMIT` }),
  ];
  const rows = [];
  const changed = [];
  for (let r = rMin; r <= rMax + 1e-9; r += rStep) {
    const row = Math.round(r * 10) / 10;
    for (let c = cMin; c <= cMax; c++) {
      const base = Math.round((row / c) * 100) / 100;
      const ov = overrides[`${row.toFixed(1)}-${c}`];
      const yn = (v) => (v >= lo - 1e-9 && v <= hi + 1e-9 ? "Y" : "N");
      rows.push(makeRow(columns, { ORD_UNT_WGT: { op: "EQ", left: numText(row) }, SPLIT_CNT: { op: "EQ", left: String(c) } }, { SPLIT_UNT_WGT: base.toFixed(2), IN_RANGE_YN: yn(base) }));
      if (ov !== undefined) changed.push({ seq: rows.length, cells: { SPLIT_UNT_WGT: { val: ov.toFixed(2) }, IN_RANGE_YN: { val: yn(ov) } }, label: `단중 ${row.toFixed(1)} × ${c}분할 ${base.toFixed(2)} → ${ov.toFixed(2)}` });
    }
  }
  const rule = {
    ruleId: "QD_ORDER_WEIGHT_ERROR", name: "주문단중에러 기준", title: "주문단중에러 기준(단중 × 분할)", hitPolicy: "FIRST", applyFrom: "2026-11-01 00:00:00",
    description: `주문단중(${rMin}~${rMax} MT, ${rStep} 간격) × 분할 수(${cMin}~${cMax}) 매트릭스 — mes-to-be order-weight-error.html. 허용 단중 ${lo}~${hi} MT/개.`,
    note: `행 ${rows.length}개 = 단중 41단 × 분할 9열. 허용 단중 범위(Min ${lo}·Max ${hi})는 코드 QC_ORD_WGT_LIMIT. v1.000 = 계산값, v1.001 = 수정값 2셀(${changed.map((c) => c.label).join(", ")}).`,
    columns, rows, cases: [],
    revisions: [{ ver: "1.001", applyFrom: "2026-11-20 09:00:00", note: `셀 수정 ${changed.map((c) => c.label).join(", ")}`, patch: changed.map(({ seq, cells }) => ({ seq, cells })) }],
  };
  for (const [w, s, v, yn] of [[20, 5, "4.00", "Y"], [35, 2, "17.50", "N"], [15, 3, "5.00", "Y"], [22.5, 5, "4.50", "Y"]]) {
    const input = { ORD_UNT_WGT: String(w), SPLIT_CNT: String(s) };
    const { expect } = expectFrom(rule, input, ["SPLIT_UNT_WGT", "IN_RANGE_YN"]);
    if (Number(expect.SPLIT_UNT_WGT) !== Number(v) || expect.IN_RANGE_YN !== yn) throw new Error(`단중 ${w}×${s}: ${JSON.stringify(expect)}`);
    rule.cases.push({ name: `단중 ${w} × ${s}분할 → ${v} (${yn === "Y" ? "범위 내" : "범위 밖"})`, input, expect, description: "단중 ÷ 분할 계산값" });
  }
  rule.cases.push({ name: "단중 15.2 → 매트릭스 행 없음", input: { ORD_UNT_WGT: "15.2", SPLIT_CNT: "3" }, expect: { hit: null }, description: "행 단중은 0.5 간격 값만 있다" });
  return { screen: "orderWeightError", rules: [rule] };
}

// ── 8. 생산가부 ────────────────────────────────────────────────────

export function feasSheets() {
  const src = readModule("production-feasibility.html");
  return literal(src, "SHEETS");
}
export const FEAS_RULE_ID = (key) => `QD_FEAS_${key.toUpperCase().replace(/-/g, "_")}`;
export const FEAS_GRP_CODE = (key, gi) => `${key.toUpperCase()}-G${gi + 1}`;

function feasibilityBundle() {
  const sheets = feasSheets();
  const rules = sheets.map((s) => {
    const columns = [
      col("MAT_GRP_CD", "COND", "STRING", "재질 그룹", { desc: "코드 QC_FEAS_MATL_GRP(시트-G순번)" }),
      col("WID", "COND", "NUMBER", "폭", { unit: "mm", desc: "행 머리 값 이상 ~ 윗행 값 미만. 맨 위 행은 그 값만" }),
      col("THK", "COND", "NUMBER", "두께(Full Hard)", { unit: "mm", desc: "열 머리 값 이상 ~ 다음 열 값 미만. 마지막 열은 그 값만" }),
      col("FEAS_STAT", "RESULT", "STRING", "생산가부", { desc: "- 생산불가 · P 생산가능 · C 조건부 생산 · X 생산불가(검증 완료) — QC_FEAS_STATE" }),
    ];
    const rows = [];
    const cases = [];
    s.groups.forEach((g, gi) => {
      const grp = FEAS_GRP_CODE(s.key, gi);
      const w = g.widths.map((x) => Number(String(x).replace(/[^0-9.]/g, "")));
      const t = g.thicks.map(Number);
      g.seed.forEach((line, wi) => {
        const wCell = wi === 0 ? { op: "EQ", left: numText(w[0]) } : { op: "<= 변수 <", left: numText(w[wi]), right: numText(w[wi - 1]) };
        let j = 0;
        while (j < t.length) {
          const overlay = g.overlay && wi < g.overlay.rows && j < g.overlay.cols;
          if (overlay) { j++; continue; }
          const st = line[j];
          let k = j;
          while (k + 1 < t.length && line[k + 1] === st && !(g.overlay && wi < g.overlay.rows && k + 1 < g.overlay.cols)) k++;
          const tCell = k + 1 < t.length ? { op: "<= 변수 <", left: numText(t[j]), right: numText(t[k + 1]) }
            : j === t.length - 1 ? { op: "EQ", left: numText(t[j]) } : { op: "<= 변수 <=", left: numText(t[j]), right: numText(t[t.length - 1]) };
          rows.push(makeRow(columns, { MAT_GRP_CD: { op: "EQ", left: escapePattern(grp) }, WID: wCell, THK: tCell }, { FEAS_STAT: st }));
          j = k + 1;
        }
      });
    });
    const rule = {
      ruleId: FEAS_RULE_ID(s.key), name: `생산가부 ${s.tab.replace("B.D 생산범위", "").replace(/[()]/g, "").trim()}`, title: s.tab, group: s.key, groupLabel: s.tab,
      hitPolicy: "FIRST", applyFrom: "2025-03-31 00:00:00",
      description: `${s.title} ${s.rev} — 엑셀 시트 "${s.tab}" 를 재질 그룹 × 폭 × 두께 구간 행으로 옮겼다(같은 상태가 이어지는 두께 칸은 한 행). mes-to-be production-feasibility.html`,
      note: `시트 머리(제목·안내·후처리 표)는 코드 QC_FEAS_SHEET, 재질 그룹은 QC_FEAS_MATL_GRP. 주석 영역(overlay) 칸은 행을 두지 않아 '해당 없음'이다. 범위 밖 폭·두께도 '해당 없음'.`,
      columns, rows, cases,
    };
    // 케이스 — 각 그룹 첫·가운데 칸에서 서로 다른 상태 몇 개(시트 값이 기대값).
    const seen = new Set();
    s.groups.forEach((g, gi) => {
      for (const [wi, ti] of [[0, g.thicks.length - 1], [g.widths.length - 1, Math.floor(g.thicks.length / 2)], [2, 3]]) {
        if (g.overlay && wi < g.overlay.rows && ti < g.overlay.cols) continue;
        const st = g.seed[wi][ti];
        if (seen.has(st) && cases.length >= 3) continue;
        if (cases.length >= 6) break;
        seen.add(st);
        const input = { MAT_GRP_CD: FEAS_GRP_CODE(s.key, gi), WID: String(Number(String(g.widths[wi]).replace(/[^0-9.]/g, ""))), THK: String(Number(g.thicks[ti])) };
        const { expect } = expectFrom(rule, input, ["FEAS_STAT"]);
        if (expect.FEAS_STAT !== st) throw new Error(`${s.key} ${g.name} ${wi}/${ti}: ${expect.FEAS_STAT} ≠ ${st}`);
        cases.push({ name: `${g.name} · 폭 ${g.widths[wi]} × 두께 ${g.thicks[ti]} → ${st}`, input, expect, description: "시트 칸 값" });
      }
    });
    return rule;
  });
  return { screen: "productionFeasibility", rules };
}

// ── 9. 주문정합성 (C10B2220 + C10B2221) ────────────────────────────

export function ocSeed() {
  return readBuildJson("order_consistency_seed.json");
}

function ocCell(c, dataType) {
  const vals = (c.values ?? []).map(String);
  switch (c.op) {
    case "IS_NULL": case "NOT_NULL": return { op: c.op };
    case "EQ": return toCell({ op: "=", v1: vals[0] }, dataType);
    case "NE": return toCell({ op: "!=", v1: vals[0] }, dataType);
    case "IN": return vals.length === 1 ? toCell({ op: "=", v1: vals[0] }, dataType) : { op: "IN", list: dataType === "NUMBER" ? vals.map(numText) : vals };
    case "NOT_IN": return vals.length === 1 ? toCell({ op: "!=", v1: vals[0] }, dataType) : { op: "NOT_IN", list: dataType === "NUMBER" ? vals.map(numText) : vals };
    case "GT": case "GE": case "LT": case "LE": return { op: c.op, left: numText(vals[0]) };
    case "BETWEEN": {
      const op = `${c.lowInclusive ? "<=" : "<"} 변수 ${c.highInclusive ? "<=" : "<"}`;
      return { op, left: numText(c.low), right: numText(c.high) };
    }
    default: throw new Error(`주문정합성 모르는 op ${c.op}`);
  }
}

function orderConsistencyBundle() {
  const s = ocSeed();
  const used = new Set();
  for (const r of s.rules) for (const c of [...r.context, ...r.when]) used.add(c.field);
  const fields = s.fields.filter((f) => used.has(f.key));
  const columns = fields.map((f) => col(f.key, "COND", f.type === "number" ? "NUMBER" : "STRING", f.label, { ...(f.unit ? { unit: f.unit } : {}), desc: `${f.type} · ${f.origin}` }));
  const R = [
    ["RULE_KEY", "룰 ID", "R-nnn(공통·order) · R-Cnnn(cross)"], ["ERR_CD", "에러코드", ""], ["ERR_MSG", "에러 메시지", ""],
    ["ERR_CATEGORY", "분류", "누락 · 사용불가 · 불필요 · 한도위반 · 선택오류(QC_OC_ERR_CATEGORY)"], ["SEVERITY", "심각도", "error · warn"],
    ["WARN_CAND_YN", "경고 후보", "Y = 메시지에 협의·문의·확인이 있어 경고 후보"], ["OWNER_DEPT", "담당 부서", "없으면 미지정"],
    ["ACTOR", "조치 주체", "등록자 · 시스템 · 현업담당 · 미지정(QC_OC_ACTOR)"], ["TARGET_ITEM", "대상 항목", "에러가 가리키는 주문 항목 코드"],
    ["RULE_SOURCE", "출처", "공통 · order(C10B2220) · cross(C10B2221)"],
  ];
  for (const [n, l, d] of R) columns.push(col(n, "RESULT", "STRING", l, d ? { desc: d } : {}));
  const typeOf = Object.fromEntries(columns.map((c) => [c.varName, c.dataType]));
  const ord = (id) => (id.startsWith("R-C") ? 1000 : 0) + Number(id.replace(/\D/g, ""));
  const enabled = s.rules.filter((r) => r.enabled).sort((a, b) => ord(a.id) - ord(b.id));
  const disabled = s.rules.filter((r) => !r.enabled).map((r) => `${r.id}(${r.error.code} ${r.error.message})`);
  const merged = [];
  const rows = enabled.map((r) => {
    const conds = {};
    for (const c of [...r.context, ...r.when]) {
      const cell = ocCell(c, typeOf[c.field]);
      const prev = conds[c.field];
      if (prev) {
        // 같은 항목 조건 두 개 — NOT_NULL 은 다른 비교 조건에 들어 있으므로 비교 조건만 남긴다(R-115).
        if (prev.op === "NOT_NULL") conds[c.field] = cell;
        else if (cell.op !== "NOT_NULL") throw new Error(`${r.id}: ${c.field} 조건 두 개를 합칠 수 없다`);
        merged.push(`${r.id} ${c.field}`);
      } else conds[c.field] = cell;
    }
    const e = r.error;
    const note = [`merge ${r.merge.status}/${r.merge.rule}`, (r.flags ?? []).join(","), r.merge.reason].filter(Boolean).join(" · ");
    return makeRow(columns, conds, {
      RULE_KEY: r.id, ERR_CD: e.code, ERR_MSG: mask(e.message), ERR_CATEGORY: e.category, SEVERITY: e.severity,
      WARN_CAND_YN: e.severity_candidate === "warn" ? "Y" : "N", OWNER_DEPT: e.owner_dept || "미지정", ACTOR: e.actor || "미지정",
      TARGET_ITEM: r.target.item, RULE_SOURCE: r.source,
    }, note);
  });
  const [o, x] = s.ruleset.sources;
  const rule = {
    ruleId: "QD_ORDER_CHECK", name: "주문정합성체크 통합 룰셋", title: "주문정합성체크(통합)", legacyIds: [o["기준코드"], x["기준코드"]],
    hitPolicy: "COLLECT", applyFrom: "2026-11-01 00:00:00",
    description: `${o["기준코드"]} ${o["기준설명"]} v${o["버전"]} + ${x["기준코드"]} ${x["기준설명"]} v${x["버전"]} 정제·병합 ${s.rules.length}룰 — mes-to-be order_consistency_seed.json(content_hash ${s.content_hash})`,
    note: `조건이 모두 맞으면 에러 발생(전 룰 평가·전수 수집, COLLECT LIST). 결과 열은 적중 행 순서의 목록이다. 비활성 룰은 싣지 않았다 — ${disabled.join(", ")}. 같은 항목 조건 두 개를 하나로 합침: ${merged.join(", ")}(NOT_NULL ⊂ EQ). 입력의 빈칸은 NULL(키는 두고 값 null)이어야 IS_NULL 이 맞는다.`,
    columns, rows, cases: [],
  };
  // 시뮬레이션 프리셋(order-consistency.html OC_PRESETS)
  const src = readModule("order-consistency.html");
  const SIM_BASE = literal(src, "SIM_BASE");
  const full = (over) => {
    const o2 = { ...SIM_BASE, ...over };
    const input = {};
    for (const f of fields) {
      const v = o2[f.key];
      input[f.key] = v === undefined || v === null || String(v).trim() === "" ? null : String(v);
    }
    return input;
  };
  const p5 = { ORD_SLIT_GRP_CNT: "10", ORD_EDG_ASG_TP: "C" };
  for (let i = 1; i <= 9; i++) p5[`ORD_MIX_WTH${i}`] = "100";
  const presets = [
    ["① GI Spangle 오류 → R-075 A72", { PRD_NM_CD: "G", ORD_SPNL_TP: "6", GW_ASG_CD: "Z10", ORD_SUR_HND_CD: "CT", CCL_BOM_NO: "" }, ["R-075"]],
    ["② 도금량 누락 → R-068 A61", { PRD_NM_CD: "E", ORD_SUR_HND_CD: "CT", CCL_BOM_NO: "" }, ["R-068"]],
    ["③ 경계 1101mm → R-133 A454", { PRD_NM_CD: "5", ORD_EXC_THK: "0.65", ORD_EXC_WTH: "1101", ORD_PAK_UNT_WGT_ULV: "2500" }, ["R-133"]],
    ["③-2 폭 1100.9 → R-132", { PRD_NM_CD: "5", ORD_EXC_THK: "0.65", ORD_EXC_WTH: "1100.9", ORD_PAK_UNT_WGT_ULV: "2500" }, ["R-132"]],
    ["④ 정상 통과 → 0건", {}, []],
    ["⑤ NULL vs 0 — 조합폭10 빈칸 → R-C98 A92", p5, ["R-C98"]],
    ["⑤-2 조합폭10 = 0 → R-112", { ...p5, ORD_MIX_WTH10: "0" }, ["R-112"]],
  ];
  for (const [name, over, keys] of presets) {
    const input = full(over);
    const { expect } = expectFrom(rule, input, ["RULE_KEY", "ERR_CD"]);
    if (JSON.stringify(expect.RULE_KEY) !== JSON.stringify(keys)) throw new Error(`주문정합성 ${name}: ${JSON.stringify(expect.RULE_KEY)} ≠ ${JSON.stringify(keys)}`);
    // 적중이 없으면 COLLECT 결과는 빈 목록이 아니라 null 이다 — 기대값은 hit: null 만 둔다.
    rule.cases.push({ name, input, expect: keys.length ? expect : { hit: null }, description: "order-consistency.html 시뮬레이션 프리셋(빈칸 = null)" });
  }
  return { screen: "orderConsistency", rules: [rule] };
}

// ── 실행 ───────────────────────────────────────────────────────────

function main() {
  mkdirSync(OUT, { recursive: true });
  const bundles = [...widthBundles(), rollingBundle(), routingBundle(), rawGradeBundle(), specCodeBundle(), weightBundle(), feasibilityBundle(), orderConsistencyBundle()];
  for (const b of bundles) {
    for (const r of b.rules) {
      r.rows.forEach((row) => { if (row.note === undefined) delete row.note; });
    }
    writeFileSync(join(OUT, `${b.screen}.json`), `${JSON.stringify(b, null, 1)}\n`);
    console.log(`${b.screen}: ${b.rules.map((r) => `${r.ruleId} 행 ${r.rows.length} 케이스 ${r.cases.length}${r.revisions ? ` 개정 ${r.revisions.map((v) => v.ver).join(",")}` : ""}`).join(" | ")}`);
  }
  const codes = buildCodes();
  writeFileSync(join(OUT, "codes.json"), `${JSON.stringify(codes, null, 1)}\n`);
  console.log(`codes: ${codes.codes.length}개 — ${codes.codes.map((c) => `${c.codeId}(${c.items.length})`).join(" ")}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
