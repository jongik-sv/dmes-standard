/**
 * 룰·빈 단계 노드 외관(S1, 스펙 2026-10-01-rule-set-flow-node-style-design.md) — 저장 형식·목록·정규화. React 의존이 없다.
 * 흐름 JSON `view.styles[노드 ID]` 에 둔다. 백엔드는 view 를 그대로 통과시킨다(계약 변경 없음, S-D1).
 * 기본값과 같은 칸(default 색·232·68·빈 hide)은 두지 않고, 남는 칸이 없으면 노드 키도 두지 않는다 — 외관 없는 세트의 저장 글자가 예전과 같다.
 */
export type NodeColor = "default" | "blue" | "orange" | "green" | "red" | "purple";
export type NodePart = "sub" | "id" | "open" | "desc";
export type NodeIcon = "calc" | "check" | "filter" | "calendar" | "money" | "alert" | "database" | "ruler" | "scale" | "truck" | "settings" | "flag";
export type NodeShape = "square" | "pill";
/** 패널 모양 고르기 — round 는 칸 지우기(지금 모양). */
export type NodeShapeChoice = "round" | NodeShape;

/** 룰·빈 단계 노드 외관(S1). 모든 칸은 선택이다. 기본값과 같은 칸은 두지 않는다. */
export interface NodeStyle {
  color?: NodeColor;
  /** 너비(흐름 좌표, 정수, 232~640). 없으면 232. */
  w?: number;
  /** 높이(정수, 68~320). 없으면 68. */
  h?: number;
  /** 숨길 표시 항목(NODE_PARTS 순서, 중복 없음). */
  hide?: NodePart[];
  icon?: NodeIcon;
  shape?: NodeShape;
}
/** 외관 편집 조각 — 값은 그 칸을 바꾸고, null 은 그 칸을 지우고, undefined 는 그대로 둔다. */
export type NodeStylePatch = { [K in keyof NodeStyle]?: NodeStyle[K] | null };
export interface NodeSize {
  w: number;
  h: number;
}

/** 색 견본 격자 순서(왼→오, 위→아래) — Camunda Modeler 와 같은 6색. */
export const NODE_COLORS: readonly NodeColor[] = ["default", "blue", "orange", "green", "red", "purple"];
export const NODE_COLOR_LABEL: Readonly<Record<NodeColor, string>> = {
  default: "기본", blue: "파랑", orange: "주황", green: "초록", red: "빨강", purple: "보라",
};
/** 순서가 곧 `hide` 저장 순서다 — 새 항목은 맨 뒤에 더해 예전 저장 글자를 지킨다. */
export const NODE_PARTS: readonly NodePart[] = ["sub", "id", "open", "desc"];
export const NODE_PART_LABEL: Readonly<Record<NodePart, string>> = { sub: "종류·정책 줄", id: "룰 ID 줄", open: "룰 편집 열기 단추", desc: "설명 아이콘" };
/** 빈 단계의 `sub` 이름(빈 단계에는 `id`·`open` 이 없다). */
export const TASK_SUB_LABEL = "안내 줄";
export const NODE_ICONS: readonly NodeIcon[] = ["calc", "check", "filter", "calendar", "money", "alert", "database", "ruler", "scale", "truck", "settings", "flag"];
export const NODE_ICON_LABEL: Readonly<Record<NodeIcon, string>> = {
  calc: "계산", check: "검사", filter: "거르기", calendar: "날짜", money: "금액", alert: "주의",
  database: "데이터", ruler: "치수", scale: "무게", truck: "물류", settings: "설정", flag: "표시",
};
export const NODE_SHAPE_CHOICES: readonly NodeShapeChoice[] = ["round", "square", "pill"];
export const NODE_SHAPE_LABEL: Readonly<Record<NodeShapeChoice, string>> = { round: "둥근 모서리", square: "각진 모서리", pill: "알약" };

/** 크기 범위(흐름 좌표). 최소는 지금 룰 크기(`NODE_SIZE.RULE`)와 같다(S-D4). */
export const NODE_W_MIN = 232;
export const NODE_W_MAX = 640;
export const NODE_H_MIN = 68;
export const NODE_H_MAX = 320;
/** 외관을 가질 수 있는 노드 종류(스펙 §0). */
export const STYLED_KINDS: ReadonlySet<string> = new Set(["RULE", "TASK"]);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
const among = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/** 모양이 맞는 칸만 정해진 순서로 남긴다. 범위 밖 숫자는 자르고, 기본값과 같은 칸은 버린다. 남는 칸이 없으면 null. */
export function normalizeNodeStyle(raw: unknown): NodeStyle | null {
  if (!isObj(raw)) return null;
  const out: NodeStyle = {};
  if (among(NODE_COLORS, raw.color) && raw.color !== "default") out.color = raw.color;
  if (finite(raw.w)) {
    const w = clampInt(raw.w, NODE_W_MIN, NODE_W_MAX);
    if (w !== NODE_W_MIN) out.w = w;
  }
  if (finite(raw.h)) {
    const h = clampInt(raw.h, NODE_H_MIN, NODE_H_MAX);
    if (h !== NODE_H_MIN) out.h = h;
  }
  if (Array.isArray(raw.hide)) {
    const given = raw.hide as unknown[];
    const hide = NODE_PARTS.filter((p) => given.includes(p));
    if (hide.length > 0) out.hide = hide;
  }
  if (among(NODE_ICONS, raw.icon)) out.icon = raw.icon;
  if (raw.shape === "square" || raw.shape === "pill") out.shape = raw.shape;
  return Object.keys(out).length > 0 ? out : null;
}

/** 지금 외관에 조각을 합친 정규화 결과(빈 값이면 null). 조각이 null 이면 전부 지운다([외관 초기화]). */
export function mergeNodeStyle(cur: NodeStyle | undefined, patch: NodeStylePatch | null): NodeStyle | null {
  if (patch === null) return null;
  const next: Record<string, unknown> = { ...cur };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v === null) delete next[k];
    else next[k] = v;
  }
  return normalizeNodeStyle(next);
}

/**
 * 흐름에 있는 RULE·TASK 노드의 외관만, 흐름 노드 배열 순서로 정규화해 모은다(S-D12 — 정리는 이 한 곳).
 * `routesFor`·`labelsFor` 와 같은 자리(toEditFlow·clone·done)에서 불러 노드를 한꺼번에 지우는 연산에서도 빠짐없이 정리한다.
 */
export function stylesFor(nodes: readonly { id: string; kind: string }[], styles: Readonly<Record<string, unknown>> | undefined): Record<string, NodeStyle> {
  const out: Record<string, NodeStyle> = {};
  if (!isObj(styles)) return out;
  for (const n of nodes) {
    if (!STYLED_KINDS.has(n.kind) || !Object.prototype.hasOwnProperty.call(styles, n.id)) continue;
    const s = normalizeNodeStyle(styles[n.id]);
    if (s) out[n.id] = s;
  }
  return out;
}
