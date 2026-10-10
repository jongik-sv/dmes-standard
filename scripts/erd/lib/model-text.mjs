// ERD 모델·상태 응답을 LLM 이 읽을 텍스트로 바꾸는 순수 함수(단계 1 S17). 네트워크·파일을 쓰지 않는다.
// 입력: OASIS erdEdit view 응답(ErdModelView, model 은 MODEL_JSON 문자열), view kind=STATUS 응답(ErdStatusView),
//       view sinceRev 응답(ErdChangesView), compare kind=DB_DIFF 응답(ErdDbDiffView).

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
 * - 근거: NAME_RULE 은 종류만, 나머지는 "종류 파일이름:줄"(ref 의 마지막 / 뒤).
 */
export function getModelText(view, status, opts = {}) {
  const m = modelOf(view);
  const diagram = opts.diagram ? findDiagram(view, opts.diagram) : null;
  const ids = tableIds(view, m, diagram);
  const inSet = new Set(ids);
  const statuses = status?.statuses ?? {};
  const domains = status?.domains ?? {};
  const rels = Object.entries(m.relations).filter(([, r]) => isShown(r));

  const out = [];
  const head = `# ${String(m.info.module ?? view.modelId).toUpperCase()} 모델 (${m.info.schema ?? "-"}) ver ${view.ver} ${view.status} rev ${view.rev}`;
  out.push(diagram ? `${head} 다이어그램 ${diagram.areaName}/${diagram.diagramName}` : head);
  if (ids.length === 0) out.push("(표 없음)");

  for (const tid of ids) {
    const t = m.tables[tid];
    out.push(t.logical ? `${t.phys} ${t.logical} {` : `${t.phys} {`);
    const pk = new Set(
      Object.values(m.keys)
        .filter((k) => k.table === tid && k.kind === "PK")
        .flatMap((k) => k.columns),
    );
    for (const cid of t.columnOrder ?? []) {
      const c = m.columns[cid];
      if (!c) continue;
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
      out.push(`  ${parts.join(" ")}`);
    }
    out.push("}");
  }

  const refLines = [];
  for (const [, r] of rels) {
    if (!inSet.has(r.child)) continue;
    if (diagram && !r.parentRef && !inSet.has(r.parent)) continue;
    const child = `${m.tables[r.child].phys}.${colsText(m, (r.pairs ?? []).map((p) => p[0]))}`;
    const parent = r.parentRef
      ? `@${r.parentRef.model}`
      : `${m.tables[r.parent]?.phys ?? "?"}.${colsText(m, (r.pairs ?? []).map((p) => p[1]))}`;
    const ev = evidenceText(r.evidence);
    refLines.push(`Ref ${child} > ${parent} ${r.state}${ev ? ` (${ev})` : ""}`);
  }
  out.push(...refLines.sort(cmp));
  return out.join("\n");
}

/** getCurrentView: 화면 세션(source=UI)마다 다이어그램과 선택한 표. session 을 주면 그 세션만. */
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
    lines.push(`- ${p.session} (${p.userId}) ${where} · 선택 ${sel.length}개${sel.length ? `: ${sel.join(", ")}` : ""} · ${p.at}`);
  }
  return lines.join("\n");
}

/** getChangesSince 요약. reload 면 다시 읽으라고 쓴다. */
export function formatChanges(changes, sinceRev) {
  if (changes.reload) {
    return `# reload: rev ${sinceRev} 이후 변경을 이어 줄 수 없습니다(DRAFT 를 새로 만들었거나 지웠거나, 500건을 넘었습니다). 현재 rev ${changes.rev}. getModelText 로 모델 전체를 다시 읽으세요.`;
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
  const lines = [`# DB 차이 ${items.length}건 (스키마 ${diff.schema}, 모델 rev ${diff.rev}). 반영은 단계 2 에서 합니다.`];
  for (const it of items) {
    lines.push(it.kind === "COLUMN_CHANGED" ? `${it.id} ${colState(it.before)} → ${colState(it.after)}` : it.id);
  }
  return lines.join("\n");
}
