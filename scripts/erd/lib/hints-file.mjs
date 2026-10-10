// 추정 근거 파일(erd/hints/<module>.json)의 모듈 배정·중복 제거·정렬·직렬화·비교. 외부 의존성 없음.
// 형식 정본: docs/superpowers/plans/2026-10-10-erd-tool-stage1/README.md "근거 파일".

export const GENERATED_BY = "scripts/erd/erd-hints.mjs";

/**
 * 모듈 배정 규칙. 표 이름 접두로 모듈을 정하고, 스키마 접두가 붙어 있으면 그 모듈의 스키마와 같을 때만 받는다.
 * migrations 는 PK·UK(방향 판정)를 읽을 Flyway 폴더다(저장소 루트 기준).
 */
export const MODULES = {
  mcm: {
    schema: "MCMAPUSER",
    prefixes: ["TB_MCM_", "TB_SEC_", "SAMPLE_"],
    migrations: ["src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser"],
  },
  mdm: {
    schema: "MDMAPUSER",
    prefixes: ["TB_MDM_"],
    migrations: ["src/backend/mdm/api/src/main/resources/db/migration/mdm/oracle"],
  },
};

/** 표 하나의 모듈. 접두가 맞지 않거나 스키마 접두가 다른 스키마면 null. */
export function moduleOf(table, schema) {
  const t = String(table).toUpperCase();
  const s = schema ? String(schema).toUpperCase() : null;
  for (const [id, m] of Object.entries(MODULES)) {
    if (!m.prefixes.some((p) => t.startsWith(p))) continue;
    if (s && s !== m.schema) return null;
    return id;
  }
  return null;
}

/** 근거 하나의 모듈. 자식·부모가 같은 모듈일 때만 그 모듈, 아니면 null(모듈 사이·다른 스키마·모르는 표). */
export function moduleOfRef(r) {
  const c = moduleOf(r.child.table, r.child.schema);
  const p = moduleOf(r.parent.table, r.parent.schema);
  return c && c === p ? c : null;
}

/** "경로:줄" 을 경로(문자열)·줄(숫자) 순으로 비교한다. localeCompare 는 쓰지 않는다(환경마다 결과가 달라진다). */
function splitRef(ref) {
  const i = ref.lastIndexOf(":");
  const line = Number(ref.slice(i + 1));
  return i > 0 && Number.isInteger(line) ? [ref.slice(0, i), line] : [ref, 0];
}
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const side = (s) => `${s.table}(${s.columns.join(",")})`;
export const refKey = (r) => `${r.kind}|${side(r.child)}|${side(r.parent)}`;

export function compareRefs(a, b) {
  const [pa, la] = splitRef(a.ref);
  const [pb, lb] = splitRef(b.ref);
  return cmp(pa, pb) || la - lb || cmp(refKey(a), refKey(b));
}

/** 출력용 정규형: 대문자, 스키마 접두 제거, 필드 순서 고정. */
function normalize(r) {
  const s = (x) => ({ table: x.table.toUpperCase(), columns: x.columns.map((c) => c.toUpperCase()) });
  return { kind: r.kind, child: s(r.child), parent: s(r.parent), ref: r.ref };
}

/** 한 모듈의 근거 목록: 모듈 거르기 → (kind, child, parent) 중복 제거(가장 앞선 ref 를 남긴다) → ref 순 정렬. */
export function buildRefs(raw, module) {
  const best = new Map();
  for (const r of raw) {
    if (moduleOfRef(r) !== module) continue;
    const n = normalize(r);
    const k = refKey(n);
    const prev = best.get(k);
    if (!prev || compareRefs(n, prev) < 0) best.set(k, n);
  }
  return [...best.values()].sort(compareRefs);
}

/** 파일 본문. 근거 하나를 한 줄로 써서 diff 가 읽기 쉽다. LF·끝 줄바꿈. */
export function renderHints({ module, generatedAt, refs }) {
  const head = [
    "{",
    `  "module": ${JSON.stringify(module)},`,
    `  "generatedBy": ${JSON.stringify(GENERATED_BY)},`,
    `  "generatedAt": ${JSON.stringify(generatedAt)},`,
  ];
  if (refs.length === 0) return [...head, '  "refs": []', "}", ""].join("\n");
  const body = refs.map((r, i) => `    ${JSON.stringify(r)}${i < refs.length - 1 ? "," : ""}`);
  return [...head, '  "refs": [', ...body, "  ]", "}", ""].join("\n");
}

/**
 * 기존 파일이 지금 만들 파일과 같은가. generatedAt 만 기존 값을 그대로 두고 나머지는 글자 단위로 비교한다(CRLF 는 LF 로 본다).
 * 같으면 기존 generatedAt 을, 다르면 null 을 돌려준다.
 */
export function unchangedGeneratedAt(existingText, module, refs) {
  if (existingText == null) return null;
  const text = existingText.replace(/\r\n/g, "\n");
  let old;
  try {
    old = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof old?.generatedAt !== "string") return null;
  return renderHints({ module, generatedAt: old.generatedAt, refs }) === text ? old.generatedAt : null;
}
