// ERD 모델·상태 응답을 LLM 이 읽을 텍스트로 바꾸는 순수 함수(단계 1 S17). 네트워크·파일을 쓰지 않는다.
// 입력: OASIS erdEdit view 응답(ErdModelView, model 은 MODEL_JSON 문자열), view kind=STATUS 응답(ErdStatusView),
//       view sinceRev 응답(ErdChangesView), compare kind=DB_DIFF 응답(ErdDbDiffView).

import { AUDIT_COLUMNS, isAuditColumn } from "./audit.mjs";

export { AUDIT_COLUMNS, isAuditColumn };

const QUIET = new Set(["OK", "ALIAS"]);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function modelOf(view) {
  const m = typeof view.model === "string" ? JSON.parse(view.model) : view.model;
  return {
    info: m?.model ?? {},
    tables: m?.tables ?? {},
    columns: m?.columns ?? {},
    keys: m?.keys ?? {},
    relations: m?.relations ?? {},
  };
}

/** 화면·텍스트에 그리는 관계: 기각하지 않았고, 허브 후보면 1순위만. */
export const isShown = (r) => r.state !== "REJECTED" && (r.candidateRank == null || r.candidateRank === 1);

function typeText(c) {
  if (!c.dataType) return "-";
  if (c.length == null) return c.dataType;
  return `${c.dataType}(${c.length}${c.scale != null ? `,${c.scale}` : ""})`;
}

function colsText(m, ids) {
  const names = ids.map((id) => m.columns[id]?.phys ?? "?");
  return names.length === 1 ? names[0] : `(${names.join(", ")})`;
}

function evidenceText(ev) {
  return (ev ?? [])
    .map((e) => (e.kind === "NAME_RULE" || !e.ref ? e.kind : `${e.kind} ${String(e.ref).split("/").pop()}`))
    .join(", ");
}

/** 다이어그램 id·이름·"업무영역/이름" 으로 찾는다. 없으면 있는 이름을 담아 오류. */
export function findDiagram(view, key) {
  const ds = view.diagrams ?? [];
  const sameName = ds.filter((x) => x.diagramName === key);
  if (!ds.some((x) => x.id === key) && sameName.length > 1) {
    const names = sameName.map((x) => `${x.areaName}/${x.diagramName}`).join(", ");
    throw new Error(`다이어그램 이름이 여러 개입니다: ${key}. '업무영역/이름' 이나 id 로 지정하세요: ${names}`);
  }
  const d =
    ds.find((x) => x.id === key) ??
    sameName[0] ??
    ds.find((x) => `${x.areaName}/${x.diagramName}` === key);
  if (!d) {
    const names = ds.map((x) => `${x.id}(${x.areaName}/${x.diagramName})`).join(", ") || "없음";
    throw new Error(`다이어그램을 찾을 수 없습니다: ${key}. 있는 다이어그램: ${names}`);
  }
  return d;
}

/** 표 id 목록(물리명 순). diagram 을 주면 그 다이어그램에 놓인 표만. */
function tableIds(view, m, diagram) {
  let ids = Object.keys(m.tables);
  if (diagram) {
    const onIt = new Set((view.nodes ?? []).filter((n) => n.diagram === diagram.id).map((n) => n.table));
    ids = ids.filter((id) => onIt.has(id));
  }
  return ids.sort((a, b) => cmp(m.tables[a].phys, m.tables[b].phys) || cmp(a, b));
}

/**
 * 한 번에 돌려주는 글자 수 상한. Claude Code 는 약 50,000자를 넘는 MCP 결과를 파일로 빼므로 그보다 작게 둔다.
 * getModelText 는 어떤 모델 크기에서도 이 값을 넘지 않는다.
 */
export const TEXT_LIMIT = 40000;

const columnIds = (m, t) => (t.columnOrder ?? []).filter((cid) => m.columns[cid]);
const pkColumns = (m, tid) =>
  Object.values(m.keys)
    .filter((k) => k.table === tid && k.kind === "PK")
    .flatMap((k) => k.columns);

/** tables 인자를 이름 목록으로. 배열·쉼표 구분 글·JSON 배열 글을 받는다. */
export function tableArgs(tables) {
  if (tables == null) return [];
  let list = tables;
  if (typeof list === "string") {
    const s = list.trim();
    if (s.startsWith("[")) {
      try {
        list = JSON.parse(s);
      } catch {
        list = [s];
      }
    } else list = s.split(/[\s,]+/);
  }
  return (Array.isArray(list) ? list : [list]).map((x) => String(x).trim()).filter(Boolean);
}

/**
 * 이름으로 표를 고른다. 물리명은 대소문자를 가리지 않고, 앞의 '스키마.' 는 뗀다.
 * 끝이 * 이면 접두사, 아니면 정확히 같은 이름만. 못 찾은 이름은 missing 에 담는다.
 */
function pickTables(m, ids, names) {
  const picked = new Set();
  const missing = [];
  for (const raw of names) {
    const key = raw.toUpperCase().replace(/^[A-Z0-9_$#]+\./, "");
    const prefix = key.endsWith("*") ? key.replace(/\*+$/, "") : null;
    const hit = ids.filter((id) => {
      const p = String(m.tables[id].phys).toUpperCase();
      return prefix != null ? p.startsWith(prefix) : p === key;
    });
    if (hit.length === 0) missing.push(raw);
    hit.forEach((id) => picked.add(id));
  }
  return { ids: ids.filter((id) => picked.has(id)), missing };
}

/** 못 찾은 이름마다 비슷한 물리명(이름을 품은 것) 몇 개. */
function missingLine(m, ids, missing) {
  const all = ids.map((id) => m.tables[id].phys);
  const hints = missing.map((raw) => {
    const k = raw.toUpperCase().replace(/^[A-Z0-9_$#]+\./, "").replace(/\*+$/, "");
    const near = all.filter((p) => String(p).toUpperCase().includes(k)).slice(0, 5);
    return near.length ? `${raw}(비슷한 표: ${near.join(", ")})` : raw;
  });
  return `없는 표: ${namesWithin(hints, 2000)}. 물리명을 확인하거나, 접두사로 찾으려면 끝에 * 를 붙인다(예: TB_MCM_SEC_*).`;
}

/** 접은 감사 컬럼 줄의 머리. 이름 뒤에 표시를 괄호로(PK·NN·FK>…), 표준 상태를 !상태로 붙인다: C_AT!DOMAIN U_USR_ID(PK,NN). */
const FOLD_HEAD = "감사 컬럼 ";
const isFoldRow = (row) => row.startsWith(`  ${FOLD_HEAD}`) && /^ {2}감사 컬럼 \d+개: /.test(row);

function tableBlock(m, tid, rels, statuses, domains, audit = false) {
  const t = m.tables[tid];
  const out = [t.logical ? `${t.phys} ${t.logical} {` : `${t.phys} {`];
  const pk = new Set(pkColumns(m, tid));
  const folded = [];
  for (const cid of columnIds(m, t)) {
    const c = m.columns[cid];
    const parts = [c.phys, c.logical || "-", typeText(c)];
    if (pk.has(cid)) parts.push("PK");
    if (c.notNull) parts.push("NN");
    const fks = [];
    for (const [, r] of rels) {
      if (r.child !== tid) continue;
      for (const [childCol, parentCol] of r.pairs ?? []) {
        if (childCol !== cid) continue;
        const mark = r.state === "INFERRED" ? "?" : "";
        if (r.parentRef) fks.push(`FK>@${r.parentRef.model}${mark}`);
        else fks.push(`FK>${m.tables[r.parent]?.phys ?? "?"}.${m.columns[parentCol]?.phys ?? "?"}${mark}`);
      }
    }
    parts.push(...fks.sort(cmp));
    if (c.domainId != null) parts.push(`[${domains[String(c.domainId)]?.name ?? `도메인 ${c.domainId}`}]`);
    const st = statuses[cid];
    if (st && !QUIET.has(st)) parts.push(`!${st}`);
    // 감사 컬럼은 기본으로 한 줄에 접는다(audit=true 면 보통 컬럼 줄). 접어도 표시(PK·NN·FK)와 표준 상태는 이름 뒤에 남긴다.
    if (!audit && isAuditColumn(c.phys)) {
      const marks = parts.slice(3).filter((p) => !p.startsWith("[") && !p.startsWith("!"));
      folded.push(`${c.phys}${marks.length ? `(${marks.join(",")})` : ""}${st && !QUIET.has(st) ? `!${st}` : ""}`);
      continue;
    }
    out.push(`  ${parts.join(" ")}`);
  }
  if (folded.length) out.push(`  ${FOLD_HEAD}${folded.length}개: ${folded.join(" ")}`);
  out.push("}");
  return out.join("\n");
}

/** 관계 글 "자식표.컬럼 > 부모표.컬럼"(Ref 줄의 앞부분). */
function relPlain(m, r) {
  const child = `${m.tables[r.child]?.phys ?? "?"}.${colsText(m, (r.pairs ?? []).map((p) => p[0]))}`;
  const parent = r.parentRef
    ? `@${r.parentRef.model}`
    : `${m.tables[r.parent]?.phys ?? "?"}.${colsText(m, (r.pairs ?? []).map((p) => p[1]))}`;
  return `${child} > ${parent}`;
}

function refLine(m, r) {
  const ev = evidenceText(r.evidence);
  return `Ref ${relPlain(m, r)} ${r.state}${ev ? ` (${ev})` : ""}`;
}

/** 경유점 목록 글: (x,y) → (x,y). max 를 주면 앞의 max 개만 보이고 나머지는 「… n점 더」. 정수가 아닌 점은 (?,?), 점이 없거나 배열이 아니면 (점 없음) — 값이 없는 것처럼 숨기지 않는다. */
export function pointsText(points, max = Infinity) {
  if (!Array.isArray(points) || points.length === 0) return "(점 없음)";
  const text = points.slice(0, max).map((p) => (Number.isInteger(p?.x) && Number.isInteger(p?.y) ? `(${p.x},${p.y})` : "(?,?)")).join(" → ");
  return points.length > max ? `${text} … ${points.length - max}점 더` : text;
}

/** 다이어그램 하나의 경유점: 관계 id → 점 목록 글. view.routes = [{diagram, relation, points}]. */
function routesOf(view, diagramId, maxPoints = Infinity) {
  const out = new Map();
  for (const rt of view.routes ?? []) {
    if (rt?.diagram === diagramId && typeof rt.relation === "string" && Array.isArray(rt.points) && rt.points.length) out.set(rt.relation, pointsText(rt.points, maxPoints));
  }
  return out;
}

/** 이름 목록을 budget 글자 안에서 잇는다. 넘치면 "외 n개". */
function namesWithin(names, budget) {
  const out = [];
  let used = 0;
  for (const n of names) {
    if (used + n.length + 2 > budget) break;
    out.push(n);
    used += n.length + 2;
  }
  const rest = names.length - out.length;
  return out.join(", ") + (rest > 0 ? ` 외 ${rest}개` : "");
}

/**
 * getModelText 형식(README "MCP 도구"):
 *   # MCM 모델 (MCMAPUSER) ver 1.000 DRAFT rev 12[ 다이어그램 업무영역/이름]
 *   표물리명 표논리명 {
 *     물리명 논리명 타입(길이[,스케일]) [PK] [NN] [FK>부모표.부모컬럼[?]]... [도메인이름] [!상태]
 *   }
 *   Ref 자식표.컬럼 > 부모표.컬럼 상태 (근거, ...)
 * - 표는 물리명 순, 컬럼은 columnOrder 순. 논리명이 비면 "-".
 * - FK 토큰은 컬럼마다 관계 하나에 하나(부모표·부모컬럼 순). 추정(INFERRED)은 끝에 "?". 다른 모델 부모(parentRef)는 "FK>@모델".
 * - 기각(REJECTED)과 candidateRank>1 관계는 쓰지 않는다.
 * - Ref 줄: 복합은 (A, B). diagram 을 주면 양 끝 표가 모두 그 다이어그램에 있을 때만 쓴다.
 *   tables 를 주면 한쪽 끝(자식 또는 부모)이 고른 표면 쓴다. 그래서 부모 표만 골라도 자식 쪽 관계가 보인다.
 * - 근거: NAME_RULE 은 종류만, 나머지는 "종류 파일이름:줄"(ref 의 마지막 / 뒤).
 * - 감사 컬럼(C_USR_ID C_AT C_SVC_ID C_PGM_ID U_USR_ID U_AT U_SVC_ID U_PGM_ID, 물리명 대소문자 무시)은 표마다 끝에
 *   "감사 컬럼 n개: 이름 …" 한 줄로 접는다(표준 상태·FK 는 이 줄에 없다). opts.audit=true 면 보통 컬럼 줄로 낸다.
 * 크기(TEXT_LIMIT, opts.limit 로 바꿀 수 있다):
 * - tables 없이 전체 글이 상한을 넘으면 개요(표 수·컬럼 수·관계 상태별 수·PK 없는 표·표마다 컬럼 수와 PK)를 준다.
 * - tables 로 고른 글이 상한을 넘으면 들어가는 표까지만 싣고, 나머지 표 이름과 다시 부르라는 줄을 붙인다.
 */
export function getModelText(view, status, opts = {}) {
  const limit = opts.limit ?? TEXT_LIMIT;
  const m = modelOf(view);
  const diagram = opts.diagram ? findDiagram(view, opts.diagram) : null;
  const scope = tableIds(view, m, diagram);
  const names = tableArgs(opts.tables);
  const { ids, missing } = names.length ? pickTables(m, scope, names) : { ids: scope, missing: [] };
  const inSet = new Set(ids);
  const statuses = status?.statuses ?? {};
  const domains = status?.domains ?? {};
  const rels = Object.entries(m.relations).filter(([, r]) => isShown(r));

  const headBase = `# ${String(m.info.module ?? view.modelId).toUpperCase()} 모델 (${m.info.schema ?? "-"}) ver ${view.ver} ${view.status} rev ${view.rev}`;
  const head = diagram ? `${headBase} 다이어그램 ${diagram.areaName}/${diagram.diagramName}` : headBase;

  // Ref 줄과 그 양 끝 표. diagram 을 주면 경유점이 있는 관계는 Ref 줄 아래에 "  via (x,y) → (x,y)" 줄을 붙인다.
  const routes = diagram ? routesOf(view, diagram.id) : new Map();
  const refs = [];
  for (const [rid, r] of rels) {
    if (!m.tables[r.child]) continue;
    if (names.length) {
      if (!inSet.has(r.child) && !(r.parent && inSet.has(r.parent))) continue;
    } else {
      if (!inSet.has(r.child)) continue;
      if (diagram && !r.parentRef && !inSet.has(r.parent)) continue;
    }
    const via = routes.get(rid);
    refs.push({ line: refLine(m, r), via: via ? `  via ${via}` : null, child: r.child, parent: r.parent });
  }
  refs.sort((a, b) => cmp(a.line, b.line));
  const blocks = new Map(ids.map((tid) => [tid, tableBlock(m, tid, rels, statuses, domains, opts.audit === true)]));
  const pre = [head];
  if (missing.length) pre.push(missingLine(m, scope, missing));
  if (ids.length === 0) pre.push("(표 없음)");
  // 상한 판단은 경유점(via 줄) 없이 한다 — via 가 개요/전체 판정을 뒤집지 않는다. 경유점은 들어갈 때만 싣는다.
  const refText = (r) => (r.via ? `${r.line}\n${r.via}` : r.line);
  const nVia = refs.filter((r) => r.via).length;
  const full = [...pre, ...blocks.values(), ...refs.map((r) => r.line)].join("\n");
  if (full.length <= limit) {
    if (!nVia) return full;
    const withVia = [...pre, ...blocks.values(), ...refs.map(refText)].join("\n");
    if (withVia.length <= limit) return withVia;
    const note = `경유점 ${nVia}개는 글이 길어 싣지 못했다. tables 를 좁혀 부르면 Ref 줄 아래에 보인다.`;
    return full.length + 1 + note.length <= limit ? `${full}\n${note}` : full;
  }
  if (!names.length) return overview(m, ids, rels, statuses, { head, limit, size: full.length, diagram, routes: nVia });

  // tables 로 골랐는데도 넘친다: 들어가는 표까지만 싣는다.
  const reserve = Math.min(3000, Math.floor(limit / 4));
  let used = pre.join("\n").length + 400;
  const kept = [];
  const keptRefs = new Set();
  for (const tid of ids) {
    const extra = refs.filter((r) => !keptRefs.has(r) && (r.child === tid || r.parent === tid));
    const add = blocks.get(tid).length + 1 + extra.reduce((s, r) => s + refText(r).length + 1, 0);
    if (used + add > limit - reserve) break;
    used += add;
    kept.push(tid);
    extra.forEach((r) => keptRefs.add(r));
  }
  // 표 하나가 혼자 상한을 넘으면(컬럼 수백 개) 그 표의 컬럼 줄을 들어가는 데까지만 싣는다.
  if (kept.length === 0 && ids.length > 0) {
    // 접은 감사 컬럼 줄은 항상 싣는다(한 줄이고 짧다). 못 실은 수에는 보통 컬럼만 센다.
    const rows = blocks.get(ids[0]).split("\n");
    const foldRow = rows.slice(1, -1).find(isFoldRow);
    const body = rows.slice(0, -1).filter((r) => r !== foldRow);
    const room = limit - reserve - used - (foldRow ? foldRow.length + 1 : 0);
    const shown = [];
    let size = 0;
    for (const row of body) {
      if (size + row.length + 1 > room) break;
      shown.push(row);
      size += row.length + 1;
    }
    const left = body.length - shown.length;
    if (left > 0) shown.push(`  … 컬럼 ${left}개를 더 싣지 못했다(상한 ${limit}자).`);
    if (foldRow) shown.push(foldRow);
    shown.push("}");
    blocks.set(ids[0], shown.join("\n"));
    kept.push(ids[0]);
  }
  const left = ids.slice(kept.length).map((tid) => m.tables[tid].phys);
  const note =
    `고른 표 ${ids.length}개의 글이 ${full.length}자로 상한 ${limit}자를 넘어 앞의 ${kept.length}개만 싣는다. ` +
    `나머지 ${left.length}개는 tables 에 더 좁게 나눠 다시 부른다: `;
  return [
    ...pre,
    note + namesWithin(left, reserve - note.length - 50),
    ...kept.map((tid) => blocks.get(tid)),
    ...refs.filter((r) => keptRefs.has(r)).map(refText),
  ].join("\n");
}

/** 전체 글이 상한을 넘을 때의 개요. 표 수·컬럼 수·관계 수와 표마다 컬럼 수·PK 를 준다. 그 자체도 limit 안에 맞춘다. */
function overview(m, ids, rels, statuses, { head, limit, size, diagram, routes = 0 }) {
  const inSet = new Set(ids);
  const touching = rels.filter(([, r]) => inSet.has(r.child) || (r.parent && inSet.has(r.parent)));
  const byState = {};
  for (const [, r] of touching) byState[r.state] = (byState[r.state] ?? 0) + 1;
  const all = Object.values(m.relations).filter((r) => inSet.has(r.child) || (r.parent && inSet.has(r.parent)));
  const rejected = all.filter((r) => r.state === "REJECTED").length;
  const folded = all.filter((r) => r.state !== "REJECTED" && r.candidateRank != null && r.candidateRank > 1).length;
  const stateText = Object.keys(byState)
    .sort(cmp)
    .map((k) => `${k} ${byState[k]}`)
    .join(", ");
  const colCount = ids.reduce((s, tid) => s + columnIds(m, m.tables[tid]).length, 0);
  const noPk = ids.filter((tid) => pkColumns(m, tid).length === 0).map((tid) => m.tables[tid].phys);
  const fk = new Map();
  const refd = new Map();
  for (const [, r] of touching) {
    fk.set(r.child, (fk.get(r.child) ?? 0) + 1);
    if (r.parent) refd.set(r.parent, (refd.get(r.parent) ?? 0) + 1);
  }

  const lines = [
    head,
    `개요만 보인다: 이 모델${diagram ? "(다이어그램)" : ""}의 전체 글이 ${size}자로 한 번에 돌려주는 상한 ${limit}자를 넘는다. ` +
      "컬럼(타입·PK·NN·FK·도메인·표준 상태)과 Ref 줄은 이 개요에 없다. tables 인자로 표를 골라 다시 부른다. " +
      '예: tables=["TB_MCM_SEC_MENU"]. 접두사는 끝에 * 를 붙인다(예: ["TB_MCM_SEC_*"]). Ref 줄은 고른 표가 자식이든 부모든 나온다.',
    `표 ${ids.length}개 · 컬럼 ${colCount}개 · 관계 ${touching.length}개(${stateText || "없음"}) · 기각 ${rejected}개 · 접힌 후보 ${folded}개(관계 수에 없음)`,
    `PK 없는 표 ${noPk.length}개${noPk.length ? `: ${namesWithin(noPk, Math.floor(limit / 8))}` : ""}`,
    ...(routes ? [`경유점 ${routes}개는 이 개요에 없다. tables 를 좁혀 부르면 Ref 줄 아래에 보인다.`] : []),
    "표 목록(물리명 논리명 · 컬럼 수 · PK 컬럼 · FK 관계 수(이 표가 자식) · 참조됨(이 표가 부모) · 표준 위반 컬럼 수):",
  ];
  let used = lines.join("\n").length;
  const tail = (n) => `… 표 ${n}개를 더 싣지 못했다(상한 ${limit}자). tables 에 접두사(끝에 *)를 주어 나눠 본다.`;
  for (let i = 0; i < ids.length; i++) {
    const tid = ids[i];
    const t = m.tables[tid];
    const cols = columnIds(m, t);
    const pk = pkColumns(m, tid).map((cid) => m.columns[cid]?.phys ?? "?");
    const bad = cols.filter((cid) => statuses[cid] && !QUIET.has(statuses[cid])).length;
    const line =
      `${t.phys}${t.logical ? ` ${t.logical}` : ""} · 컬럼 ${cols.length} · ${pk.length ? `PK ${pk.join(", ")}` : "PK 없음"}` +
      ` · FK ${fk.get(tid) ?? 0} · 참조됨 ${refd.get(tid) ?? 0} · 위반 ${bad}`;
    if (used + line.length + 1 + tail(ids.length).length + 1 > limit) {
      lines.push(tail(ids.length - i));
      break;
    }
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join("\n");
}

const pad = (n, w = 2) => String(n).padStart(w, "0");

/**
 * 시각을 지역 시각(오프셋 붙은 ISO)과 지난 시간으로. 예: 2026-10-11T02:21:05+09:00 (12초 전).
 * opts.now(ms)·opts.offsetMin(UTC 에서 동쪽으로 몇 분)은 시험용. 못 읽는 값은 그대로 둔다.
 */
export function formatAt(at, opts = {}) {
  const t = Date.parse(at);
  if (Number.isNaN(t)) return String(at);
  const off = opts.offsetMin ?? -new Date(t).getTimezoneOffset();
  const d = new Date(t + off * 60000);
  const sign = off >= 0 ? "+" : "-";
  const iso =
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` +
    `${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
  const sec = Math.floor(((opts.now ?? Date.now()) - t) / 1000);
  const ago =
    sec < 1 ? "방금" : sec < 60 ? `${sec}초 전` : sec < 3600 ? `${Math.floor(sec / 60)}분 전` : sec < 86400 ? `${Math.floor(sec / 3600)}시간 전` : `${Math.floor(sec / 86400)}일 전`;
  return `${iso} (${ago})`;
}

/** getCurrentView 가 다이어그램마다 적는 경유점 줄 수 상한. */
const ROUTE_ROWS_MAX = 50;
/** getCurrentView 경유점 한 줄에 보이는 점 수 상한. 넘으면 「… n점 더」. */
const ROUTE_POINTS_MAX = 5;
/** getCurrentView 경유점 블록(줄 글자 합, 줄바꿈 포함)의 대략 상한. 넘는 줄부터는 남은 개수만 알린다. */
const ROUTE_CHARS_MAX = 4000;

/** getCurrentView: 화면 세션(source=UI)마다 다이어그램과 선택한 표. session 을 주면 그 세션만. 시각은 지역 시각과 지난 시간. */
export function formatCurrentView(view, opts = {}) {
  const m = modelOf(view);
  const ui = (view.presence ?? []).filter((p) => p.source === "UI" && (!opts.session || p.session === opts.session));
  if (ui.length === 0) {
    return opts.session
      ? `화면 세션 ${opts.session} 이 없습니다. 세션 이름을 확인하거나 session 없이 다시 부르세요.`
      : "열려 있는 화면 세션이 없습니다. 사용자가 m-mdm ERD 화면에서 모델을 열면 보입니다. 그동안은 getModelText 로 모델을 읽으세요.";
  }
  const lines = [`# 화면 세션 ${ui.length}개 (모델 ${view.modelId} rev ${view.rev})`];
  for (const p of ui) {
    const d = (view.diagrams ?? []).find((x) => x.id === p.diagramId);
    const where = d ? `다이어그램 ${d.areaName}/${d.diagramName}` : "다이어그램 없음";
    const sel = (p.selectedTables ?? []).map((id) => {
      const t = m.tables[id];
      return t ? (t.logical ? `${t.phys} ${t.logical}` : t.phys) : `${id}(모델에 없음)`;
    });
    lines.push(`- ${p.session} (${p.userId}) ${where} · 선택 ${sel.length}개${sel.length ? `: ${sel.join(", ")}` : ""} · 마지막 알림 ${formatAt(p.at, opts)}`);
  }
  // 경유점: 다이어그램마다 한 번(세션이 여럿이어도), 줄 수 상한 안에서.
  const seen = new Set();
  for (const p of ui) {
    const d = (view.diagrams ?? []).find((x) => x.id === p.diagramId);
    if (!d || seen.has(d.id)) continue;
    seen.add(d.id);
    const routes = routesOf(view, d.id, ROUTE_POINTS_MAX);
    const rows = Object.entries(m.relations)
      .filter(([rid, r]) => routes.has(rid) && isShown(r))
      .map(([rid, r]) => `  ${relPlain(m, r)}: ${routes.get(rid)}`)
      .sort(cmp);
    if (!rows.length) continue;
    // 줄 수(50)와 글자 수(약 4,000)가 먼저 닿는 쪽까지만 싣는다. 첫 줄은 항상 싣는다.
    let chars = 0;
    let shown = 0;
    while (shown < rows.length && shown < ROUTE_ROWS_MAX && (shown === 0 || chars + rows[shown].length + 1 <= ROUTE_CHARS_MAX)) chars += rows[shown++].length + 1;
    lines.push(`경유점 ${d.areaName}/${d.diagramName} ${rows.length}개:`, ...rows.slice(0, shown));
    if (rows.length > shown) lines.push(`  … ${rows.length - shown}개 더. getModelText(diagram) 로 읽으세요.`);
  }
  return lines.join("\n");
}

/** reload 응답의 fromRev(기록을 줄 수 있는 가장 이른 sinceRev) 안내. 없으면 빈 글. */
export function fromRevHint(fromRev) {
  return fromRev == null ? "" : ` 변경 기록은 getChangesSince(${fromRev}) 부터 읽을 수 있습니다.`;
}

/** getChangesSince 요약. reload 면 다시 읽으라고 쓰고, 서버가 fromRev 를 주면 거기부터 읽으라고 덧붙인다. */
export function formatChanges(changes, sinceRev) {
  if (changes.reload) {
    return `# reload: rev ${sinceRev} 이후 변경을 이어 줄 수 없습니다(DRAFT 를 새로 만들었거나 지웠거나, 500건을 넘었습니다). 현재 rev ${changes.rev}. getModelText 로 모델 전체를 다시 읽으세요.${fromRevHint(changes.fromRev)}`;
  }
  const deltas = changes.deltas ?? [];
  const lines = [`# rev ${sinceRev} 이후 변경 ${deltas.length}건 (현재 rev ${changes.rev})`];
  for (const d of deltas) {
    const what = (d.changes ?? []).map((c) => `${c.kind} ${c.op} ${c.id}`).join(", ");
    lines.push(`rev ${d.rev} ${d.userId}/${d.session} ${d.source}: ${what || "(변경 없음)"}`);
  }
  return lines.join("\n");
}

/** listViolations: 상태가 OK·ALIAS 가 아닌 컬럼. only 를 주면 그 상태만. */
export function formatViolations(view, status, opts = {}) {
  const m = modelOf(view);
  const statuses = status?.statuses ?? {};
  const domains = status?.domains ?? {};
  const counts = status?.counts ?? {};
  const rows = [];
  for (const tid of tableIds(view, m, null)) {
    const t = m.tables[tid];
    for (const cid of t.columnOrder ?? []) {
      const st = statuses[cid];
      if (!st || QUIET.has(st) || (opts.only && st !== opts.only)) continue;
      const c = m.columns[cid];
      const dom = c.domainId != null ? ` [${domains[String(c.domainId)]?.name ?? `도메인 ${c.domainId}`}]` : "";
      rows.push(`${t.phys}.${c.phys} ${c.logical || "-"} ${st}${dom}`);
    }
  }
  const summary = ["NEW", "TYPE", "DOMAIN", "MISS"].map((k) => `${k} ${counts[k] ?? 0}`).join(", ");
  const head = `# 표준 위반 ${rows.length}건${opts.only ? ` (${opts.only} 만)` : ""} · 전체 ${summary} · 판정 ${status?.elapsedMs ?? "-"}ms`;
  return [head, ...rows].join("\n");
}

/** listInferredRelations: INFERRED 관계. includeFolded 가 아니면 candidateRank>1 을 뺀다. 관계 id 를 앞에 둔다. */
export function formatInferred(view, opts = {}) {
  const m = modelOf(view);
  const all = Object.entries(m.relations).filter(([, r]) => r.state === "INFERRED");
  const folded = all.filter(([, r]) => r.candidateRank != null && r.candidateRank > 1).length;
  const rows = all
    .filter(([, r]) => opts.includeFolded || r.candidateRank == null || r.candidateRank === 1)
    .map(([id, r]) => ({
      id,
      r,
      child: `${m.tables[r.child]?.phys ?? "?"}.${colsText(m, (r.pairs ?? []).map((p) => p[0]))}`,
      parent: r.parentRef
        ? `@${r.parentRef.model}`
        : `${m.tables[r.parent]?.phys ?? "?"}.${colsText(m, (r.pairs ?? []).map((p) => p[1]))}`,
    }))
    .sort((a, b) => cmp(a.child, b.child) || cmp(a.parent, b.parent) || cmp(a.id, b.id))
    .map(({ id, r, child, parent }) => {
      const rank = r.candidateRank == null ? "" : ` 후보 ${r.candidateRank}`;
      const ev = evidenceText(r.evidence);
      return `${id} ${child} > ${parent}${rank}${ev ? ` (${ev})` : ""}`;
    });
  const head = `# 추정 관계 ${rows.length}개 · 접힌 후보 ${folded}개 ${opts.includeFolded ? "포함" : "뺌(includeFolded=true 로 봅니다)"}`;
  return [head, ...rows].join("\n");
}

function colState(s) {
  if (!s) return "-";
  return `${s.dataType}${s.length != null ? `(${s.length}${s.scale != null ? `,${s.scale}` : ""})` : ""}${s.notNull ? " NN" : ""}`;
}

/** getDbDiff: 차이 항목. COLUMN_CHANGED 는 전→후 를 붙인다. */
export function formatDbDiff(diff) {
  const items = diff.items ?? [];
  if (items.length === 0) return `DB(${diff.schema}) 와 모델(rev ${diff.rev})이 같습니다.`;
  const lines = [`# DB 차이 ${items.length}건 (스키마 ${diff.schema}, 모델 rev ${diff.rev}). 반영은 m-mdm ERD 화면의 DB 차이 탭에서 합니다.`];
  for (const it of items) {
    lines.push(it.kind === "COLUMN_CHANGED" ? `${it.id} ${colState(it.before)} → ${colState(it.after)}` : it.id);
  }
  return lines.join("\n");
}
