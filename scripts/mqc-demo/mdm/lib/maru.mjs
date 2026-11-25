// Maru(MDM) 룰 셀 변환과 판정 흉내 — 순수 함수만 둔다(네트워크 없음).
// 연산자 대응은 이전 폭 수축량 이관(width-rules/convert.mjs)과 같다. 엔진 셀 의미: maru-mdm-engine CellTextGenerator.

const RANGE_OP = { BETWEEN1: "<= 변수 <=", BETWEEN2: "<= 변수 <", BETWEEN3: "< 변수 <=", BETWEEN4: "< 변수 <" };

/** 숫자 → 셀 문자열. */
export function numText(v) {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`숫자가 아니다: ${v}`);
  return String(n);
}

export function splitList(v) {
  return String(v ?? "").split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

/** STRING EQ 는 패턴(%·_ 와일드카드)으로 읽히므로 값 글자를 이스케이프한다. */
export function escapePattern(s) {
  return String(s).replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * As-Is 조건 {op, v1, v2} → Maru 셀. dataType 은 "STRING" | "NUMBER".
 * NOT_CHECK→NA, =→EQ, !=→NE, IN/NOT_IN, BETWEEN1..4→범위, LIKE1(포함)/2(끝)/3(시작)→EQ 패턴, >,>=,<,<= → GT/GE/LT/LE, IS_NULL/NOT_NULL.
 */
export function toCell(cond, dataType, where = "") {
  const op = String(cond?.op ?? "NOT_CHECK").trim().toUpperCase();
  const num = dataType === "NUMBER";
  const one = (v) => (num ? numText(v) : String(v ?? "").trim());
  if (op === "NOT_CHECK" || op === "" || op === "NA") return { op: "NA" };
  if (op === "IS_NULL" || op === "NOT_NULL") return { op };
  if (op === "=" || op === "EQ") {
    const vals = splitList(cond.v1);
    if (vals.length > 1) return { op: "IN", list: vals.map(one) };
    return { op: "EQ", left: num ? one(cond.v1) : escapePattern(one(cond.v1)) };
  }
  if (op === "!=" || op === "NE") {
    const vals = splitList(cond.v1);
    if (vals.length > 1) return { op: "NOT_IN", list: vals.map(one) };
    return { op: "NE", left: one(cond.v1) };
  }
  if (op === "IN" || op === "NOT_IN") {
    const vals = splitList(cond.v1).map(one);
    if (vals.length === 0) throw new Error(`${where}: ${op} 값이 비었다`);
    if (vals.length === 1) return op === "IN" ? { op: "EQ", left: num ? vals[0] : escapePattern(vals[0]) } : { op: "NE", left: vals[0] };
    return { op, list: vals };
  }
  if (RANGE_OP[op]) {
    if (!num) throw new Error(`${where}: 문자 항목에 범위 연산자 ${op}`);
    // MDM 은 하한 = 상한 범위를 거부한다(BOUND_EQUAL) — 양끝 포함이면 = 로 바꾼다.
    if (one(cond.v1) === one(cond.v2) && op === "BETWEEN1") return { op: "EQ", left: one(cond.v1) };
    return { op: RANGE_OP[op], left: one(cond.v1), right: one(cond.v2) };
  }
  const cmp = { ">": "GT", ">=": "GE", "<": "LT", "<=": "LE", GT: "GT", GE: "GE", LT: "LT", LE: "LE" }[op];
  if (cmp) return { op: cmp, left: one(cond.v1) };
  if (op === "LIKE1") return { op: "EQ", left: `%${escapePattern(String(cond.v1).trim())}%` };
  if (op === "LIKE2") return { op: "EQ", left: `%${escapePattern(String(cond.v1).trim())}` };
  if (op === "LIKE3") return { op: "EQ", left: `${escapePattern(String(cond.v1).trim())}%` };
  throw new Error(`${where}: 모르는 연산자 ${cond?.op}`);
}

/** 결과 셀. 빈 값이면 null(셀을 두지 않는다). */
export function resultCell(v, dataType) {
  if (v === null || v === undefined || v === "") return null;
  return { val: dataType === "NUMBER" ? numText(v) : String(v) };
}

// ── 판정 흉내(dry-run 검증용) ─────────────────────────────────────────

function unescapePattern(s) {
  return s.replace(/\\([\\%_])/g, "$1");
}

/** STRING EQ 패턴 판정 — 엔진 pattern() 과 같은 네 모양(전체·시작·끝·포함). 가운데 와일드카드는 쓰지 않는다. */
function patternTrue(pattern, v) {
  const anyFirst = pattern.startsWith("%");
  const anyLast = pattern.endsWith("%") && !pattern.endsWith("\\%");
  let body = pattern;
  if (anyFirst) body = body.slice(1);
  if (anyLast) body = body.slice(0, -1);
  if (/(^|[^\\])[%_]/.test(body)) throw new Error(`판정 흉내가 모르는 패턴: ${pattern}`);
  body = unescapePattern(body);
  if (anyFirst && anyLast) return v.includes(body);
  if (anyLast) return v.startsWith(body);
  if (anyFirst) return v.endsWith(body);
  return v === body;
}

/** 셀 하나 판정. v 는 입력값(null = 없음). NULL 이면 IS_NULL·NA 만 참이다(엔진 NULL_GUARD). */
export function cellTrue(cell, v, dataType) {
  if (!cell || cell.op === "NA") return true;
  const isNull = v === null || v === undefined;
  if (cell.op === "IS_NULL") return isNull;
  if (cell.op === "NOT_NULL") return !isNull;
  if (isNull) return false;
  const num = dataType === "NUMBER";
  const x = num ? Number(v) : String(v);
  const lit = (s) => (num ? Number(s) : String(s));
  switch (cell.op) {
    case "EQ": return num ? x === lit(cell.left) : patternTrue(cell.left, x);
    case "NE": return x !== lit(cell.left);
    case "GT": return x > lit(cell.left);
    case "GE": return x >= lit(cell.left);
    case "LT": return x < lit(cell.left);
    case "LE": return x <= lit(cell.left);
    case "IN": return cell.list.map(lit).includes(x);
    case "NOT_IN": return !cell.list.map(lit).includes(x);
    case "<= 변수 <=": return lit(cell.left) <= x && x <= lit(cell.right);
    case "<= 변수 <": return lit(cell.left) <= x && x < lit(cell.right);
    case "< 변수 <=": return lit(cell.left) < x && x <= lit(cell.right);
    case "< 변수 <": return lit(cell.left) < x && x < lit(cell.right);
    default: throw new Error(`판정 흉내: 모르는 op ${cell.op}`);
  }
}

/**
 * 묶음 룰 하나를 입력으로 판정한다. rows 는 seq 순(NORMAL 만). 입력 값 "" 은 문자 항목이면 "" 그대로, 숫자 항목이면 없음.
 * @returns {{hits:number[], results:Object}} hits = 적중 seq(1부터). FIRST 는 첫 적중 하나, COLLECT 는 전부.
 */
export function judge(rule, input) {
  const conds = rule.columns.filter((c) => c.varKind === "COND");
  const results = rule.columns.filter((c) => c.varKind === "RESULT");
  const hits = [];
  rule.rows.forEach((row, i) => {
    if (rule.hitPolicy === "FIRST" && hits.length) return;
    const ok = conds.every((c) => {
      let v = input[c.varName];
      if (v === undefined) v = null;
      if (c.dataType === "NUMBER" && (v === "" || v === null)) v = null;
      return cellTrue(row.cells[c.varName], v, c.dataType);
    });
    if (ok) hits.push(i + 1);
  });
  const out = {};
  for (const r of results) {
    const vals = hits.map((s) => rule.rows[s - 1].cells[r.varName]?.val ?? null);
    if (rule.hitPolicy === "COLLECT") out[r.varName] = vals.filter((v) => v !== null);
    else out[r.varName] = vals.length ? vals[0] : null;
  }
  return { hits, results: out };
}
