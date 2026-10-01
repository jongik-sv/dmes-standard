/**
 * 노드 설명 — 저장 형식·정규화. React 의존이 없다.
 * 흐름 JSON `view.descs[노드 ID]` 에 문자열로 둔다. 백엔드는 view 를 그대로 통과시킨다(계약 변경 없음, 외관 `view.styles` 와 같다).
 * 메모(`view.notes`)와는 별개다 — 메모는 캔버스에 놓는 글 상자이고, 설명은 노드 하나에 붙는 글이다.
 *
 * 정리는 `descsFor` 한 곳에서 한다(외관의 `stylesFor` 와 같은 자리). 입력하는 동안 단어 사이·끝 공백이 지워지지 않도록
 * 편집 경로에서는 공백을 다듬지 않고, 앞뒤 공백은 읽을 때(sanitizeView)와 쓸 때(flowJsonOf)에만 지운다.
 * 설명이 하나도 없으면 `descs` 키를 두지 않는다 — 설명 없는 세트의 저장 글자가 예전과 같다.
 */

/** 설명 길이 한계(글자 수). 넘으면 자른다. */
export const MAX_DESC = 1000;
/** 설명을 가질 수 있는 노드 종류. MERGE 는 제외한다(합류는 분기를 따라 생기고 없어진다). */
export const DESC_KINDS: ReadonlySet<string> = new Set(["RULE", "TASK", "IF", "PARALLEL", "START", "END"]);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** 문자열이면 1000자로 자른 값, 공백뿐이거나 문자열이 아니면 null. 공백은 다듬지 않는다(입력 중 상태 보존). */
export function normalizeDesc(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  return raw.length > MAX_DESC ? raw.slice(0, MAX_DESC) : raw;
}

/** 앞뒤 공백을 지운 설명(읽기·쓰기용). 지운 뒤 비면 null. */
export function trimDesc(raw: unknown): string | null {
  const v = normalizeDesc(raw);
  if (v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/**
 * 흐름에 있는 설명 대상 노드의 설명만, 흐름 노드 배열 순서로 모은다. 대상이 아닌 종류(MERGE)·없는 노드·문자열이 아닌 값·빈 값은 버린다.
 * `trim` 이 참이면 앞뒤 공백도 지운다(읽을 때·쓸 때).
 */
export function descsFor(
  nodes: readonly { id: string; kind: string }[],
  descs: Readonly<Record<string, unknown>> | undefined,
  trim = false,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isObj(descs)) return out;
  for (const n of nodes) {
    if (!DESC_KINDS.has(n.kind) || !Object.prototype.hasOwnProperty.call(descs, n.id)) continue;
    const d = trim ? trimDesc(descs[n.id]) : normalizeDesc(descs[n.id]);
    if (d !== null) out[n.id] = d;
  }
  return out;
}
