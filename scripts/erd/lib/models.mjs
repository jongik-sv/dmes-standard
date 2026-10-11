// 모델 관리 흐름(README 7.2): 모델 목록·다이어그램 목록·모델 등록(reg)·DB 가져오기(import)·모델 완전 삭제(delete kind=MODEL).
// MCP 도구(listModels·listDiagrams·registerModel·importModel)와 CLI(models·diagrams·register·import·delete-model·diagram-*)가 함께 쓴다.
// MCP SDK·zod 를 import 하지 않는다(CLI 가 pnpm install 없이 돈다). 오류(OasisError 등)는 던진다 — 받는 쪽이 글로 바꾼다.
// 서버 쪽 모양은 b2 가 만든다: 이 파일이 가정한 요청 모양은 scripts/erd 보고서(task-t1-report)와 아래 주석에 적었다.
import { InputError } from "./flows.mjs";
import { modelOf } from "./commands.mjs";
import { findDiagram } from "./model-text.mjs";
import { OasisError } from "./oasis.mjs";

const dash = (v) => (v === null || v === undefined || v === "" ? "-" : v);

/**
 * 확정본 칸 글: 값이면 버전, null 이면 「없음」(확정본이 없다), 칸이 아예 없으면(b2 전 서버) 「확인 불가」.
 * 칸이 없을 때 「없음」으로 적으면 확정본이 있는 모델을 지울 수 있는 모델로 오해한다(비관리자 삭제는 확정·요청·승인 버전이 없어야 한다).
 */
const releasedText = (v) => (v === null ? "없음" : typeof v === "string" && v ? v : "확인 불가");

/** search(kind 없음) 행 → 글. 새 칸(status·releasedVer·createdBy)이 없는 옛 서버도 깨지지 않는다. */
export function formatModels(rows) {
  const lines = rows.map(
    (r) =>
      `${r.modelId} ${dash(r.moduleId)} ${dash(r.schemaName)} ${dash(r.modelName)} · rev ${dash(r.rev)} · DRAFT ${dash(r.draftVer)} · 소유자 ${dash(r.ownerId)}` +
      ` · 상태 ${dash(r.status)} · 확정 ${releasedText(r.releasedVer)} · 만든 사람 ${dash(r.createdBy)}`,
  );
  return [`# 모델 ${rows.length}개`, ...lines].join("\n");
}

/** 모델 목록(MCP listModels·CLI models). search 한 번. */
export async function listModelsFlow(client) {
  const rows = await client.rows("search");
  return { text: formatModels(rows), result: rows, isError: false };
}

/** view → 다이어그램 목록(sortSeq 순). nodes 가 없으면 표 수를, routes 가 없으면 경유점 수를 뺀다. */
export function diagramsOf(view) {
  const nodes = Array.isArray(view?.nodes) ? view.nodes : null;
  const routes = Array.isArray(view?.routes) ? view.routes : null;
  return [...(view?.diagrams ?? [])]
    // 서버는 ORDER BY SORT_SEQ, DIAGRAM_ID(이진 순서)다. localeCompare 는 대소문자가 섞인 id 에서 순서가 달라진다.
    .sort((a, b) => (a.sortSeq ?? 0) - (b.sortSeq ?? 0) || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0))
    .map((d) => ({
      id: d.id,
      areaName: d.areaName,
      diagramName: d.diagramName,
      sortSeq: d.sortSeq ?? null,
      ...(nodes ? { nodeCount: nodes.filter((n) => n.diagram === d.id).length } : {}),
      ...(routes ? { routeCount: routes.filter((r) => r.diagram === d.id).length } : {}),
    }));
}

export function formatDiagrams(view, modelId) {
  const result = diagramsOf(view);
  const lines = result.map(
    (d) => `${d.id} ${d.areaName}/${d.diagramName}${d.nodeCount === undefined ? "" : ` · 표 ${d.nodeCount}개`}${d.routeCount === undefined ? "" : ` · 경유점 ${d.routeCount}개`}`,
  );
  return { text: [`# 다이어그램 ${result.length}개 (모델 ${modelId} · rev ${dash(view?.rev)})`, ...lines].join("\n"), result };
}

/** 다이어그램 목록(MCP listDiagrams·CLI diagrams). view 한 번(모델 전체를 읽는다). */
export async function listDiagramsFlow(client, { modelId }) {
  const view = await client.call("view", { modelId });
  return { ...formatDiagrams(view, modelId), isError: false };
}

/** 서버 이름 칸 크기(ErdDiagramStore.NAME_MAX). 넘으면 INVALID 거절. */
const NAME_MAX = 200;

/** 기본 복사 이름 「<원본> 복사」. 서버(ErdDiagramStore.copyName)처럼 원본이 길면 잘라 {@link NAME_MAX}자 안에 맞춘다. */
export function copyName(source) {
  const suffix = " 복사";
  const base = String(source ?? "");
  return (base.length > NAME_MAX - suffix.length ? base.slice(0, NAME_MAX - suffix.length) : base) + suffix;
}

/**
 * CLI diagram-rename·diagram-delete·diagram-copy 가 apply 에 보낼 명령 하나(README 7.2).
 * - rename: {"op":"updateDiagram","id":d,"set":{"diagramName"?,"areaName"?}}
 * - delete: {"op":"deleteDiagram","id":d}
 * - copy:   {"op":"copyDiagram","from":d,"id"?,"areaName","diagramName"} — 업무영역은 원본과 같게, 이름은 「<이름> 복사」가 기본.
 * 다이어그램은 d- id·"업무영역/이름"·이름(유일할 때)로 가리킨다. view 를 주지 않았거나 못 찾으면 글 그대로 싣고 apply 흐름의 이름 풀기가 풀거나 거절한다.
 * copy 의 기본 이름·업무영역은 원본을 알아야 하므로 name·area 를 다 주지 않았을 때만 view 가 필요하다.
 */
export function diagramCommand(view, kind, ref, { name, area, id } = {}) {
  // view 가 없거나 못 찾으면 글 그대로 명령에 싣는다 — applyFlow 의 이름 풀기가 apply 와 같은 "이름 풀기 실패" 결과(종료 1, save 없음)를 낸다.
  // (이름이 여러 업무영역에 겹치면 findDiagram 이 던지고, 그때도 같은 길로 후보 목록이 있는 거절이 된다.)
  let d = { id: ref, areaName: "", diagramName: "" };
  if (view) {
    try {
      d = findDiagram(view, ref);
    } catch {
      /* 글 그대로 */
    }
  }
  if (kind === "rename") {
    const set = {};
    if (name !== undefined) set.diagramName = name;
    if (area !== undefined) set.areaName = area;
    if (!Object.keys(set).length) throw new InputError("이름을 바꾸려면 --name(새 이름)이나 --area(새 업무영역)가 필요합니다");
    return { op: "updateDiagram", id: d.id, set };
  }
  if (kind === "delete") return { op: "deleteDiagram", id: d.id };
  if (kind === "copy") {
    return { op: "copyDiagram", from: d.id, ...(id ? { id } : {}), areaName: area ?? d.areaName, diagramName: name ?? copyName(d.diagramName) };
  }
  throw new InputError(`모르는 다이어그램 작업: ${kind}`);
}

const text = (v) => (typeof v === "string" ? v.trim() : "");

/** 시험 실행 글의 첫 줄. register·import 는 서버에 시험 실행이 없어, 읽기 확인만 하고 쓰기 요청은 보내지 않는다. */
const DRY_HEAD = "시험 실행: 서버에 보내지 않음, --apply 로 실행";

/** 서버 칸 크기(V6): modelId 50·moduleId 20·schemaName 128·modelName 200. 넘으면 ORA-12899 대신 서버 호출 전에 막는다. */
const REG_LIMITS = [["modelId", 50], ["moduleId", 20], ["schemaName", 128], ["modelName", 200]];

/** CLI 클라이언트는 CLI 명령 이름으로, MCP 는 MCP 도구 이름으로 다음 할 일을 안내한다. */
const isCli = (client) => client?.config?.source === "CLI";

/**
 * 모델 등록(MCP registerModel·CLI register): erdEdit reg.
 * 요청: { modelId, moduleId, schemaName, modelName } — 서버가 schemaName 을 대문자로 바꾸고 DRAFT 1.000 인 모델을 만든다(소유자 = 호출 사용자).
 * 새 모델의 rev 는 0 이지만, 같은 서버가 같은 modelId 의 모델을 지운 적이 있으면 지운 rev 뒤에서 이어진다(b2) — 그래서 rev 를 글에 적지 않고 읽으라고 안내한다.
 * 모듈 하나에 모델 하나만 둔다: 이미 모델이 있는 moduleId 나 이미 있는 modelId 는 서버가 MDM021 로 거절한다.
 * 응답: { modelId }. modelId 를 주지 않으면 moduleId 와 같다("모듈 하나 = 모델 하나").
 * dryRun 은 reg 를 보내지 않고 읽기 전용 search 한 번으로 같은 modelId·moduleId 가 있는지만 본다(있으면 isError).
 */
export async function registerFlow(client, { modelId, moduleId, schemaName, modelName, dryRun = false }) {
  const m = text(moduleId);
  const s = text(schemaName);
  const n = text(modelName);
  const id = text(modelId) || m;
  if (!m || !s || !n) throw new InputError("모델 등록에는 모듈(moduleId)·스키마(schemaName)·모델 이름(modelName)이 모두 필요합니다");
  const values = { modelId: id, moduleId: m, schemaName: s, modelName: n };
  for (const [key, max] of REG_LIMITS) {
    if (values[key].length > max) throw new InputError(`${key} 는 ${max}자까지입니다(${values[key].length}자)`);
  }
  const line = `modelId ${id} · 모듈 ${m} · 스키마 ${s} · 이름 ${n}`;
  if (dryRun) {
    const rows = await client.rows("search");
    const clash = [
      rows.some((r) => r.modelId === id) ? `이미 있는 modelId: ${id}` : null,
      rows.some((r) => r.moduleId === m) ? `모듈 ${m} 에는 이미 모델이 있습니다(모듈 하나에 모델 하나)` : null,
    ].filter(Boolean);
    if (clash.length) return { text: [`등록할 수 없습니다: ${clash.join(" · ")}`, `(${line})`].join("\n"), isError: true, result: null };
    return { text: `${DRY_HEAD}\n모델 등록 ${line}\n같은 modelId·모듈의 모델이 없습니다(search 로 확인). 서버 reg 에는 시험 실행이 없어 권한·칸 검사는 --apply 때 서버가 한다.`, isError: false, result: null };
  }
  const result = await client.call("reg", values);
  const done = result?.modelId ?? id;
  const next = isCli(client)
    ? `다음: import --model ${done} --apply 로 스키마의 표를 가져오거나, text --model ${done} 로 rev 를 읽고 apply 로 표를 만드세요.`
    : `다음: 스키마의 표를 가져오려면 importModel(modelId=${done}) 을, 빈 모델에서 만들려면 getModelText 로 rev 를 읽고 apply 를 쓰세요.`;
  return {
    text: [`모델 등록됨: ${done} · 모듈 ${m} · 스키마 ${s.toUpperCase()} · 이름 ${n} · DRAFT 1.000`, next].join("\n"),
    isError: false,
    result: result ?? { modelId: id },
  };
}

const WARN_MAX = 5;

/**
 * DB 에서 첫 가져오기(MCP importModel·CLI import): erdEdit import kind=FROM_DB.
 * 요청: { modelId, kind:"FROM_DB", baseRev } — baseRev 를 주지 않으면 view 의 rev 를 읽어 쓴다(새 모델은 0).
 * 서버 import 는 dryRun 을 받지 않는다(받으면 INVALID). 그래서 CLI 시험 실행은 import 를 보내지 않고, 읽기 전용 view 한 번으로
 * 모델이 있는지와 표 수를 본다(표가 있으면 첫 가져오기가 INVALID 로 거절되므로 isError).
 * 응답: { applied, rev, rowVersion, changes, warnings, rejection, summary:{tables, columns, keys, relations:{DB, INFERRED}, diagramId} }.
 * 거절(INVALID 등)은 성공 응답에 rejection 으로 온다 — 표가 있는 모델은 INVALID "이미 표가 있습니다(n개)…", baseRev > rev 도 INVALID.
 */
export async function importFlow(client, { modelId, baseRev, dryRun = false }) {
  const id = text(modelId);
  if (!id) throw new InputError("가져올 모델의 modelId 가 필요합니다");
  if (dryRun) {
    const view = await client.call("view", { modelId: id });
    const tables = Object.keys(modelOf(view).tables).length;
    if (tables > 0) {
      return {
        text: `첫 가져오기를 할 수 없습니다: 표가 ${tables}개 있습니다. 차이는 db-diff 로 보고, 반영은 화면의 DB 차이 탭에서 합니다(첫 가져오기는 표가 없는 모델에만 됩니다).`,
        isError: true,
        result: null,
      };
    }
    return {
      text: `${DRY_HEAD}\n${id} 의 스키마에서 표·컬럼·키·관계를 가져온다(rev ${view.rev ?? "-"}${baseRev === undefined ? "" : ` · baseRev ${baseRev}`}). 표가 없는 모델이라 첫 가져오기를 할 수 있습니다(view 로 확인).\n서버 import 에는 시험 실행이 없다. 차이만 보려면 db-diff 를 쓴다.`,
      isError: false,
      result: null,
    };
  }
  let base = baseRev;
  if (base === undefined || base === null) base = (await client.call("view", { modelId: id })).rev ?? 0;
  const result = await client.call("import", { modelId: id, kind: "FROM_DB", baseRev: base });
  if (!result.applied) {
    const rj = result.rejection ?? {};
    const out = [`거절 ${rj.code ?? "?"} · 저장한 것 없음`, rj.message ? `내용: ${rj.message}` : null, rj.hint ? `다음: ${rj.hint}` : null].filter(Boolean);
    return { text: out.join("\n"), isError: true, result };
  }
  const sm = result.summary ?? {};
  const rel = sm.relations ?? {};
  const warnings = result.warnings ?? [];
  const out = [
    `가져오기 반영 rev ${result.rev} (baseRev ${base}) · 표 ${dash(sm.tables)} · 컬럼 ${dash(sm.columns)} · 키 ${dash(sm.keys)} · 관계 DB ${rel.DB ?? 0} / 추정 ${rel.INFERRED ?? 0} · 다이어그램 ${dash(sm.diagramId)} · 경고 ${warnings.length}`,
    ...warnings.slice(0, WARN_MAX).map((w) => `경고: ${w.code ?? "?"} ${w.message ?? ""}`.trimEnd()),
    ...(warnings.length > WARN_MAX ? [`경고 ${warnings.length - WARN_MAX}건 더 있음(--json 으로 전부)`] : []),
    `다음 baseRev: ${result.rev}`,
  ];
  return { text: out.join("\n"), isError: false, result };
}

/** 모델 완전 삭제 경고(CLI 가 지우기 전에 낸다). */
export function deleteModelWarning(row) {
  return [
    `경고: 모델 ${row.modelId}(모듈 ${dash(row.moduleId)} · 스키마 ${dash(row.schemaName)} · 이름 ${dash(row.modelName)}) 을 완전히 지웁니다. 되돌릴 수 없습니다.`,
    "지워지는 것: 모든 버전(DRAFT·확정본)·다이어그램·관계 경유점·명령 기록·편집자·작업 중 표시. 화면에서 보던 사람은 시작 화면으로 돌아갑니다.",
  ].join("\n");
}

/**
 * 모델 완전 삭제(CLI delete-model --yes 만. MCP 에는 없다): erdEdit delete kind=MODEL.
 * 요청: { modelId, kind:"MODEL" } — ver·rowVersion 은 보내지 않는다(kind 없는 delete 는 DRAFT 삭제로 ver·rowVersion 을 받는다).
 * 권한은 서버가 가린다: 관리자(MDM_STD_ADMIN·SYSADMIN) = 항상, 아니면 RELEASED·REQUESTED·APPROVED 버전이 하나도 없고 DRAFT 소유자일 때만.
 * 응답: { ok: true }. 거절은 실제 서버에서 모두 실패 응답(meta.success=false)이라 OASIS 오류로 던져진다(describeError 가 서버의 이유를 앞에 두고 코드별로 안내한다):
 * MDM029 없는 모델 · MDM016 DRAFT 없음(관리자만) · MDM003 소유자 없는 DRAFT·소유자 아님·막는 버전 · MDM001 작업 중 표시가 계속 들어옴(잠시 뒤 다시) · MDM021 모르는 kind.
 * 성공 응답의 rejection{code,message,hint} 은 실제 서버가 보내지 않지만 save·import 와 같은 모양이라 오면 거절 글로 바꾼다(방어).
 * 먼저 search 로 모델이 있는지 본다(이름 오타로 서버 오류만 받는 일을 줄이고, 지우는 모델의 모듈·이름을 경고에 싣는다). warn(text) 는 delete 직전에 한 번 부른다.
 */
export async function deleteModelFlow(client, { modelId, warn }) {
  const id = text(modelId);
  if (!id) throw new InputError("지울 모델의 modelId 가 필요합니다");
  const rows = await client.rows("search");
  const row = rows.find((r) => r.modelId === id);
  if (!row) {
    const known = rows.map((r) => r.modelId).join(", ") || "없음";
    return { text: `지울 모델이 없습니다: ${id}. 있는 모델: ${known}`, isError: true, result: null };
  }
  warn?.(deleteModelWarning(row));
  let result;
  try {
    result = await client.call("delete", { modelId: id, kind: "MODEL" });
  } catch (e) {
    // kind 를 모르는 옛 서버(b2 전)는 DRAFT 삭제 경로로 가서 버전을 요구한다. 아무것도 지우지 않았다.
    if (e instanceof OasisError && /버전은 필수/.test(e.message)) {
      return { text: `서버가 delete kind=MODEL 을 아직 지원하지 않습니다(서버 응답: ${e.message}). 아무것도 지우지 않았습니다. 서버를 최신으로 올린 뒤 다시 하세요.`, isError: true, result: null };
    }
    throw e;
  }
  if (result?.rejection) {
    const rj = result.rejection;
    return { text: [`거절 ${rj.code ?? "?"} · 지운 것 없음`, rj.message ? `내용: ${rj.message}` : null, rj.hint ? `다음: ${rj.hint}` : null].filter(Boolean).join("\n"), isError: true, result };
  }
  if (result?.ok === false) return { text: `모델 삭제 실패: ${id}`, isError: true, result };
  return {
    text: `모델 삭제됨(되돌릴 수 없음): ${id} · 모듈 ${dash(row.moduleId)} · 스키마 ${dash(row.schemaName)} · 이름 ${dash(row.modelName)}`,
    isError: false,
    result: result ?? { ok: true },
  };
}
