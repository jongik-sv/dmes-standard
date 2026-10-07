/**
 * 위젯 관리 「위젯 목록」 탭의 순수 함수 — 목록 합치기·필터·상세 폼 변환·검사·미리보기 크기.
 * 스펙 2026-10-02-widget-admin-generic §1.1(합치기 규칙)·§5.3(서버 검사의 화면 판)·§10.1, 계획 Task 4.
 * @dk-oasis/shared 는 타입만 import 한다 — 시험이 shared 런타임 없이 돈다(그래서 applyWidgetOverride 를 쓰지 않고 같은 규칙을 여기서 계산한다).
 */
import type {
  WidgetDefRow,
  WidgetRegistry,
  WidgetSize,
  WidgetTypeMeta,
  WidgetTypeRegistry,
} from "@dk-oasis/shared/widget";

import type { AdminFilters, AdminRow, DefForm, WidgetSaveParams } from "./types";

/** shared WIDGET_COLS·WIDGET_ROW_HEIGHT·WIDGET_MARGIN 과 같은 값(런타임 import 를 피하려고 따로 둔다). */
const GRID_COLS = 24;
const ROW_HEIGHT = 20;
const ROW_MARGIN = 8;

export const UNKNOWN_TYPE_TITLE = "알 수 없는 유형";

/** 새로 고침 주기 범위(초) — 서버 CommWidgetMngService REFRESH_MIN·REFRESH_MAX, shared MIN_REFRESH_SEC 와 같다. */
export const REFRESH_MIN_SEC = 600;
export const REFRESH_MAX_SEC = 86400;
export const REFRESH_RANGE_MESSAGE = `새로 고침 주기는 ${REFRESH_MIN_SEC}~${REFRESH_MAX_SEC}초여야 합니다.`;

/** 새로 고침 칸 값이 범위 안인가(빈 칸은 「새로 고침 없음」이라 맞다). */
export function isRefreshSecValid(text: string): boolean {
  const t = text.trim();
  return t === "" || (/^\d+$/.test(t) && Number(t) >= REFRESH_MIN_SEC && Number(t) <= REFRESH_MAX_SEC);
}

/**
 * 새로 고침 칸 옆에 보일 오류(없으면 null). 최소 600초 규칙 이전에 저장된 옛 값(120 등)은 열자마자 걸려 [저장] 이 켜지지 않으므로,
 * 표 맨 아래 줄까지 내려가지 않아도 이유와 지금 값을 칸에서 바로 알린다.
 */
export function refreshSecFieldError(text: string): string | null {
  if (isRefreshSecValid(text)) return null;
  const t = text.trim();
  return /^\d+$/.test(t) ? `${REFRESH_RANGE_MESSAGE} (지금 ${t}초)` : REFRESH_RANGE_MESSAGE;
}

/** CONFIG_JSON 상한(스펙 §5.3 — 200KB). */
const CONFIG_MAX_BYTES = 200 * 1024;

const sizeText = (w: number | null | undefined, h: number | null | undefined): string =>
  w != null && h != null ? `${w}×${h}` : "-";

/**
 * 목록 = 코드 등록부 + 유형 등록부 + commWidgetMng/search 행(사용 중지 포함). 스펙 §10.1.
 * - 코드 위젯은 DB 행이 없어도 전부(ID 순), 덮어쓰기(C) 행이 있으면 그 값과 「덮어씀」.
 * - 정의(D) 위젯은 코드 위젯 뒤(ID 순). 유형이 등록부에 없어도 「알 수 없는 유형」으로 보인다(관리자가 지울 수 있게).
 * - 코드에서 사라진 위젯의 C 행, 코드 ID 와 겹친 D 행은 넣지 않는다(mergeWidgetRegistry 와 같은 규칙).
 */
export function buildAdminRows(
  code: WidgetRegistry,
  types: WidgetTypeRegistry,
  defs: readonly WidgetDefRow[],
  usage: Readonly<Record<string, number>>
): AdminRow[] {
  const cRows = new Map<string, WidgetDefRow>();
  for (const d of defs) if (d.srcTp === "C") cRows.set(d.widgetId, d);
  const byId = (a: { widgetId: string }, b: { widgetId: string }) => (a.widgetId < b.widgetId ? -1 : a.widgetId > b.widgetId ? 1 : 0);

  const rows: AdminRow[] = Object.keys(code)
    .sort()
    .map((widgetId) => {
      const meta = code[widgetId].meta;
      const c = cRows.get(widgetId);
      const row: AdminRow = {
        widgetId,
        title: c?.title ?? meta.title,
        kind: "코드",
        typeId: null,
        typeTitle: "",
        unknownType: false,
        useYn: c ? c.useYn : "Y",
        defaultSize: sizeText(c?.defW ?? meta.defaultSize.w, c?.defH ?? meta.defaultSize.h),
        categoryCd: c?.categoryCd ?? meta.category ?? "",
        category: "",
        privateYn: c?.privateYn ?? (meta.private ? "Y" : "N"),
        userCount: usage[widgetId] ?? 0,
        overridden: Boolean(c),
      };
      if (c) row.def = c;
      return row;
    });

  const dRows = defs.filter((d) => d.srcTp === "D" && !code[d.widgetId]).sort(byId);
  for (const d of dRows) {
    const type = d.typeId ? types[d.typeId]?.meta : undefined;
    rows.push({
      widgetId: d.widgetId,
      title: d.title ?? type?.title ?? d.widgetId,
      kind: "정의",
      typeId: d.typeId,
      typeTitle: type ? type.title : UNKNOWN_TYPE_TITLE,
      unknownType: !type,
      useYn: d.useYn,
      defaultSize: sizeText(d.defW ?? type?.defaultSize.w, d.defH ?? type?.defaultSize.h),
      categoryCd: d.categoryCd ?? "",
      category: "",
      privateYn: d.privateYn ?? "N",
      userCount: usage[d.widgetId] ?? 0,
      overridden: false,
      def: d,
    });
  }
  return rows;
}

/** 검색(이름·ID, 대소문자 무시)·구분·사용 필터 — 목록은 한 번 받아 화면에서 거른다. */
export function filterAdminRows(rows: readonly AdminRow[], f: AdminFilters): AdminRow[] {
  const kw = f.keyword.trim().toLowerCase();
  return rows.filter((r) => {
    if (kw && !r.widgetId.toLowerCase().includes(kw) && !r.title.toLowerCase().includes(kw)) return false;
    if (f.kind === "code" && r.kind !== "코드") return false;
    if (f.kind === "def" && r.kind !== "정의") return false;
    if (f.useYn && r.useYn !== f.useYn) return false;
    return true;
  });
}

const numText = (v: number | null): string => (v == null ? "" : String(v));
const blank = (v: string): string | null => {
  const t = v.trim();
  return t === "" ? null : t;
};
/** 정수가 아니면 NULL — 저장 전에는 validateDefForm 이 막고, 미리보기는 코드·유형 값으로 그린다. */
const intOrNull = (v: string): number | null => {
  const t = v.trim();
  if (t === "" || !/^-?\d+$/.test(t)) return null;
  return Number(t);
};

const isQueryType = (typeId: string | null): boolean => typeId != null && typeId.startsWith("query-");

/** 깊은 복사 — initialConfig 를 그대로 넘기면 편집기가 등록부 값을 고칠 수 있다. */
const deepCopy = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

/** DB 행 → 상세 폼. 정의 위젯의 multipleYn NULL 은 「허용」(defWidgetMeta 와 같다). */
export function rowToForm(row: WidgetDefRow): DefForm {
  const isDef = row.srcTp === "D";
  return {
    widgetId: row.widgetId,
    srcTp: row.srcTp,
    typeId: isDef ? row.typeId : null,
    title: row.title ?? "",
    subtitle: row.subtitle ?? "",
    description: row.description ?? "",
    defW: numText(row.defW),
    defH: numText(row.defH),
    minW: numText(row.minW),
    minH: numText(row.minH),
    maxW: numText(row.maxW),
    maxH: numText(row.maxH),
    refreshSec: numText(row.refreshSec),
    linkPageId: row.linkPageId ?? "",
    multipleYn: row.multipleYn ?? (isDef ? "Y" : ""),
    categoryCd: row.categoryCd ?? "",
    privateYn: row.privateYn ?? "N",
    placeTp: row.placeTp ?? "",
    useYn: row.useYn,
    dataSrc: isDef ? row.dataSrc : null,
    config: isDef ? row.config : null,
  };
}

/** 코드 위젯 상세 폼 — 덮어쓰기 행이 없으면 모든 칸이 비어 있다(= 코드 값). */
export function codeForm(widgetId: string, row?: WidgetDefRow): DefForm {
  if (row) return rowToForm(row);
  return {
    widgetId,
    srcTp: "C",
    typeId: null,
    title: "",
    subtitle: "",
    description: "",
    defW: "",
    defH: "",
    minW: "",
    minH: "",
    maxW: "",
    maxH: "",
    refreshSec: "",
    linkPageId: "",
    multipleYn: "",
    categoryCd: "",
    privateYn: "N",
    placeTp: "",
    useYn: "Y",
    dataSrc: null,
    config: null,
  };
}

/** [새 위젯] — 제목·기본 크기는 유형 값, config 는 initialConfig 복사, 사용 Y. 쿼리 유형은 실행 모듈 mcm. */
export function newDefForm(type: WidgetTypeMeta): DefForm {
  return {
    ...codeForm(""),
    srcTp: "D",
    typeId: type.id,
    title: type.title,
    defW: String(type.defaultSize.w),
    defH: String(type.defaultSize.h),
    multipleYn: "Y",
    dataSrc: isQueryType(type.id) ? "mcm" : null,
    config: deepCopy(type.initialConfig ?? null),
  };
}

/** 이름 칸 상한(validateDefForm 의 이름 규칙과 같다). */
const TITLE_MAX = 50;
export const COPY_TITLE_SUFFIX = " (사본)";

/** 사본 이름 — 「<원래 이름> (사본)」. 50자를 넘으면 원래 이름을 잘라 접미사가 남게 한다. */
export function copyTitle(title: string): string {
  const base = title.trim();
  return base.slice(0, TITLE_MAX - COPY_TITLE_SUFFIX.length) + COPY_TITLE_SUFFIX;
}

/**
 * [복사] 를 쓸 수 없는 이유(쓸 수 있으면 null). 버튼 툴팁에 그대로 보인다.
 * 코드 위젯은 관리자가 새로 만들 수 없고, 유형이 등록부에 없는 정의는 편집기를 못 열어 사본을 고칠 수 없다.
 */
export function copyBlockReason(
  form: DefForm | null,
  typeKnown: boolean
): string | null {
  if (!form) return "복사할 위젯을 먼저 고르세요.";
  if (form.srcTp !== "D") return "코드 위젯은 복사할 수 없습니다. 새 위젯은 유형을 골라 만드세요.";
  if (!form.widgetId) return "저장하지 않은 새 위젯입니다. 저장한 뒤 복사하세요.";
  if (!typeKnown) return "알 수 없는 유형이라 복사할 수 없습니다.";
  return null;
}

/** 사용자 데이터가 위젯 정의와 따로 쌓이는 유형의 복사 안내(해당 없으면 null). 사본은 정의 설정만 가져간다. */
export function copyDataNotice(form: DefForm): string | null {
  const config = form.config;
  const scope = config !== null && typeof config === "object" ? (config as Record<string, unknown>).scope : undefined;
  if (form.typeId === "memo" && scope === "personal") {
    return "개인 메모는 정의 설정만 복사됩니다. 사용자가 쓴 메모 내용은 가져가지 않습니다.";
  }
  if (form.typeId === "collect") {
    return "자동 수집은 정의 설정만 복사됩니다. 이미 모은 값은 가져가지 않고, 저장한 뒤부터 새로 쌓입니다.";
  }
  return null;
}

/**
 * 정의 위젯 폼 → 「새 위젯」 작성 상태 폼(복사해서 만들기). 서버에는 아무것도 만들지 않는다 — 저장 때 새 ID 가 발급된다.
 * - ID 는 비우고 이름은 「<원래 이름> (사본)」. 그 밖의 공통 칸과 설정(config 전체)은 그대로 깊은 복사한다(원본과 설정 객체를 공유하지 않는다).
 * - 사용 여부는 늘 Y: 사용 중지한 원본의 사본이 말없이 중지로 만들어져 서랍에 안 보이는 혼선을 막는다.
 * - config 의 화면 전용 `__*` 키(쿼리 시험 결과 등)는 복사하지 않는다.
 * 이름 칸이 비어 있으면(DB 이름 NULL = 유형 이름을 쓰는 정의) fallbackTitle(목록에 보이는 이름)로 사본 이름을 만든다.
 * 코드 위젯은 복사할 수 없다(copyBlockReason) — 호출 쪽이 먼저 확인한다.
 */
export function copyDefForm(form: DefForm, fallbackTitle = ""): DefForm {
  return {
    ...form,
    widgetId: "",
    title: copyTitle(form.title.trim() || fallbackTitle),
    useYn: "Y",
    config: deepCopy(stripScreenOnlyKeys(form.config)),
  };
}

/** 상세 폼 → 행(빈 칸 → NULL). 코드 위젯은 typeId·dataSrc·config 를 늘 NULL 로 둔다(서버도 NULL 로 저장). */
export function formToRow(form: DefForm): WidgetDefRow {
  const isDef = form.srcTp === "D";
  return {
    widgetId: form.widgetId,
    srcTp: form.srcTp,
    typeId: isDef ? form.typeId : null,
    title: blank(form.title),
    subtitle: blank(form.subtitle),
    description: blank(form.description),
    defW: intOrNull(form.defW),
    defH: intOrNull(form.defH),
    minW: intOrNull(form.minW),
    minH: intOrNull(form.minH),
    maxW: intOrNull(form.maxW),
    maxH: intOrNull(form.maxH),
    refreshSec: intOrNull(form.refreshSec),
    linkPageId: blank(form.linkPageId),
    multipleYn: form.multipleYn === "" ? null : form.multipleYn,
    categoryCd: blank(form.categoryCd),
    privateYn: form.privateYn,
    placeTp: form.placeTp === "" ? null : form.placeTp,
    useYn: form.useYn,
    // 쿼리 유형의 실행 모듈은 지금 mcm 만 — 값이 비어도 mcm 으로 보낸다(스펙 §5.3).
    dataSrc: isDef && isQueryType(form.typeId) ? form.dataSrc || "mcm" : null,
    config: isDef ? (form.config ?? null) : null,
  };
}

/** 정의 설정의 최상위 `__*` 키(화면 전용 — 예: 쿼리 미리보기 __preview)를 지운 복사본. 중첩 키는 그대로. */
export function stripScreenOnlyKeys(config: unknown): unknown {
  if (config === null || typeof config !== "object" || Array.isArray(config)) return config;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config as Record<string, unknown>)) {
    if (!k.startsWith("__")) out[k] = v;
  }
  return out;
}

const configJsonOf = (config: unknown): string | null =>
  config == null ? null : JSON.stringify(stripScreenOnlyKeys(config));

/** commWidgetMng/save params — 신규 정의 위젯은 widgetId 빈 값, configJson 은 화면 전용 키를 뺀 JSON 문자열. */
export function toSaveParams(form: DefForm): WidgetSaveParams {
  const { config, ...row } = formToRow(form);
  return { ...row, placeTp: row.placeTp ?? null, configJson: configJsonOf(config) };
}

const SIZE_FIELDS = [
  ["defW", "기본 너비"],
  ["defH", "기본 높이"],
  ["minW", "최소 너비"],
  ["minH", "최소 높이"],
  ["maxW", "최대 너비"],
  ["maxH", "최대 높이"],
] as const;

/** 컬럼 길이(스펙 §4.1). 이름은 50자 규칙을 따로 본다. */
const LENGTH_LIMITS = [
  ["subtitle", 100, "부제는 100자 이하여야 합니다."],
  ["description", 400, "설명은 400자 이하여야 합니다."],
  ["linkPageId", 200, "화면 열기 pageId 는 200자 이하여야 합니다."],
  ["categoryCd", 20, "분류는 20자 이하여야 합니다."],
] as const;

const utf8Bytes = (s: string): number => new TextEncoder().encode(s).length;

/**
 * 상세 폼 검사 — 서버 §5.3 과 같은 규칙의 화면 판. 오류 문구 목록(빈 배열이면 저장 가능).
 * 공통: 이름 1~50자(정의 위젯 필수), 크기는 비우거나 1 이상 정수·같은 축 MIN ≤ DEF ≤ MAX·기본·최소 너비 ≤ 24,
 * 새로 고침 600~86400초, 문자열은 컬럼 길이 이하. 정의 위젯: 유형 필수, 정의 설정 200KB 이하.
 */
export function validateDefForm(form: DefForm): string[] {
  const errors: string[] = [];
  const isDef = form.srcTp === "D";
  if (isDef && !form.typeId) errors.push("유형을 고르세요.");

  const title = form.title.trim();
  if (isDef && title === "") errors.push("이름을 입력하세요.");
  else if (title.length > 50) errors.push("이름은 50자 이하여야 합니다.");

  for (const [key, max, message] of LENGTH_LIMITS) {
    if (form[key].trim().length > max) errors.push(message);
  }

  const sizes: Partial<Record<(typeof SIZE_FIELDS)[number][0], number>> = {};
  for (const [key, label] of SIZE_FIELDS) {
    const t = form[key].trim();
    if (t === "") continue;
    if (!/^\d+$/.test(t) || Number(t) < 1) {
      errors.push(`${label}는 1 이상 정수여야 합니다.`);
      continue;
    }
    sizes[key] = Number(t);
  }
  if (sizes.defW != null && sizes.defW > GRID_COLS) errors.push(`기본 너비는 ${GRID_COLS} 이하여야 합니다.`);
  // 서버 checkSizes 와 같다 — 기본 너비를 비워도 최소 너비 25 이상은 거절.
  if (sizes.minW != null && sizes.minW > GRID_COLS) errors.push(`최소 너비는 ${GRID_COLS} 이하여야 합니다.`);
  for (const [axis, name] of [
    ["W", "너비"],
    ["H", "높이"],
  ] as const) {
    const min = sizes[`min${axis}`];
    const def = sizes[`def${axis}`];
    const max = sizes[`max${axis}`];
    if (min != null && def != null && min > def) errors.push(`최소 ${name}는 기본 ${name} 이하여야 합니다.`);
    if (def != null && max != null && def > max) errors.push(`기본 ${name}는 최대 ${name} 이하여야 합니다.`);
    if (min != null && max != null && min > max) errors.push(`최소 ${name}는 최대 ${name} 이하여야 합니다.`);
  }

  if (!isRefreshSecValid(form.refreshSec)) errors.push(REFRESH_RANGE_MESSAGE);

  if (isDef) {
    const json = configJsonOf(form.config);
    if (json != null && utf8Bytes(json) > CONFIG_MAX_BYTES) errors.push("유형 설정은 200KB 이하여야 합니다.");
  }
  return errors;
}

/** 비교용 — 저장 때 지우는 화면 전용 키(__preview 등)는 변경으로 치지 않는다. */
const comparable = (form: DefForm): string => JSON.stringify({ ...form, config: stripScreenOnlyKeys(form.config) });

/** 저장하지 않은 변경이 있는가(둘 중 하나가 없으면 false). 화면 전용 `__*` 키만 다르면 false — [쿼리 시험]만 누른 정의는 저장할 것이 없다. */
export function isFormDirty(base: DefForm | null, form: DefForm | null): boolean {
  if (!base || !form) return false;
  return comparable(base) !== comparable(form);
}

export interface SaveGateInput {
  /**
   * commWidgetMng/search 가 한 번이라도 성공했는가. 아니면 덮어쓰기(C) 행을 몰라 빈 코드 폼이 열리고,
   * 그 저장이 기존 덮어쓰기(사용 중지·크기)를 NULL 로 덮어쓴다(서버 save 는 요청 값으로 모든 칸을 바꾼다) — 편집을 막는다.
   */
  loaded: boolean;
  busy: boolean;
  /** 저장 버튼 권한(메뉴 RBAC). */
  canSave: boolean;
  form: DefForm | null;
  baseline: DefForm | null;
  /** 정의 위젯의 유형이 등록부에 없다 — 지우기만 할 수 있다. */
  unknownType: boolean;
  /** 폼 검사 + 유형 편집기 오류 수. */
  errorCount: number;
  /**
   * 유형 편집기가 첫 검사 결과(onValidate)를 알렸는가. React.lazy 편집기는 불러오는 동안 오류가 0건으로 보이므로,
   * 정의 위젯(유형을 아는 경우)은 이것이 true 가 되기 전에는 저장할 수 없다. 코드 위젯·알 수 없는 유형은 보지 않는다.
   */
  editorReady: boolean;
}

/** 덮어쓰기 칸이 모두 비어 있는 코드 위젯 폼(사용 Y) — 저장하면 모든 칸이 NULL 인 C 행만 남는다. */
export function isBlankCodeOverride(form: DefForm | null): boolean {
  if (!form || form.srcTp !== "C") return false;
  const blank = codeForm(form.widgetId) as unknown as Record<string, unknown>;
  const cur = form as unknown as Record<string, unknown>;
  return Object.keys(blank).every((k) => JSON.stringify(cur[k] ?? null) === JSON.stringify(blank[k] ?? null));
}

/** 이미 덮어쓴 코드 위젯의 칸을 모두 비웠을 때의 안내(아니면 null). 저장 대신 되돌리기를 쓰게 한다. */
export function blankOverrideNotice(base: DefForm | null, form: DefForm | null): string | null {
  if (!isBlankCodeOverride(form) || isBlankCodeOverride(base)) return null;
  return "덮어쓴 값을 모두 비웠습니다. [코드 값으로 되돌리기]를 쓰세요.";
}

/**
 * [저장] 활성 조건. 목록을 받았고·처리 중이 아니고·권한·폼·알려진 유형·오류 없음에 더해,
 * 기존 행은 바뀐 값이 있어야 한다(덮어쓰기 행이 없는 코드 위젯을 그대로 저장하면 모든 칸 NULL 인 C 행이 생긴다).
 * 새 정의 위젯(widgetId "")은 손대지 않아도 저장할 수 있다. 덮어쓰기 칸을 모두 비운 코드 위젯은 막는다(되돌리기를 쓴다).
 */
export function canSaveForm(g: SaveGateInput): boolean {
  if (!g.loaded || g.busy || !g.canSave || !g.form || g.unknownType || g.errorCount > 0) return false;
  if (g.form.srcTp === "D" && !g.editorReady) return false;
  if (isBlankCodeOverride(g.form)) return false;
  return g.form.widgetId === "" || isFormDirty(g.baseline, g.form);
}

/** 미리보기에서 끌어 바꾸는 크기 종류 — 기본·최소·최대. */
export type SizeTarget = "def" | "min" | "max";

export const SIZE_TARGET_OPTIONS: readonly { value: SizeTarget; label: string }[] = [
  { value: "def", label: "기본" },
  { value: "min", label: "최소" },
  { value: "max", label: "최대" },
];

const SIZE_TARGET_LABEL: Record<SizeTarget, string> = { def: "기본", min: "최소", max: "최대" };

/** 행 제목 — 고른 대상에 맞춘다. */
export function previewTitle(target: SizeTarget): string {
  return `미리보기(${SIZE_TARGET_LABEL[target]} 크기)`;
}

/** shared WIDGET_DEFAULT_MIN_SIZE 와 같은 값 — 최소 크기를 비우면 쓰이는 값(런타임 import 를 피하려고 따로 둔다). */
const DEFAULT_MIN_SIZE: WidgetSize = { w: 4, h: 6 };

/** 폼 칸이 비었거나 1 이상 정수가 아니면 null(검사는 validateDefForm 몫). */
const axisOrNull = (text: string): number | null => {
  const v = intOrNull(text);
  return v != null && v >= 1 ? v : null;
};

/** shared applyWidgetOverride 의 size() 와 같다 — 둘 다 비면 base, base 가 없는데 한 축만 있으면 무시(undefined), 아니면 축마다 대체. */
function mergeSize(wText: string, hText: string, base: WidgetSize | undefined): WidgetSize | undefined {
  const w = axisOrNull(wText);
  const h = axisOrNull(hText);
  if (w === null && h === null) return base;
  if (!base && (w === null || h === null)) return undefined;
  return { w: w ?? base!.w, h: h ?? base!.h };
}

export interface PreviewSizeBase {
  defaultSize: WidgetSize;
  minSize?: WidgetSize;
  maxSize?: WidgetSize;
}

export interface PreviewSizes {
  def: WidgetSize;
  min: WidgetSize;
  /** 제한 없음이면 null. */
  max: WidgetSize | null;
}

/**
 * 폼 값(없으면 코드·유형 값, 최소는 4×6, 최대는 제한 없음) 으로 미리보기에서 그릴 기본·최소·최대 크기를 구한다.
 * 보드가 실제로 쓰는 값(applyWidgetOverride → minSizeOf·maxSizeOf)과 같은 규칙이다. 가로는 24 를 넘지 않게 맞춘다 — 잘못된 값은 validateDefForm 이 막는다.
 */
export function previewSizes(form: DefForm, base?: PreviewSizeBase): PreviewSizes {
  const col = (s: WidgetSize): WidgetSize => ({ w: Math.min(s.w, GRID_COLS), h: s.h });
  const def = col(mergeSize(form.defW, form.defH, base?.defaultSize) ?? { w: 1, h: 1 });
  const min = col(mergeSize(form.minW, form.minH, base?.minSize) ?? DEFAULT_MIN_SIZE);
  const max = mergeSize(form.maxW, form.maxH, base?.maxSize);
  return { def, min, max: max ? col(max) : null };
}

/** 고른 대상의 시작 크기 — 최대가 「제한 없음」이면 기본 크기에서 시작한다. */
export function targetSize(sizes: PreviewSizes, target: SizeTarget): WidgetSize {
  if (target === "max") return sizes.max ?? sizes.def;
  return sizes[target];
}

/** 미리보기에 점선으로 겹쳐 보일 나머지 크기(최대가 제한 없음이면 뺀다). */
export function otherSizes(sizes: PreviewSizes, target: SizeTarget): { target: SizeTarget; size: WidgetSize }[] {
  const out: { target: SizeTarget; size: WidgetSize }[] = [];
  for (const t of ["def", "min", "max"] as const) {
    if (t === target) continue;
    const size = t === "max" ? sizes.max : sizes[t];
    if (size) out.push({ target: t, size });
  }
  return out;
}

/** 드래그로 확정한 크기를 고른 대상의 가로·세로 입력 칸 값으로 바꾼다. */
export function sizePatch(target: SizeTarget, size: WidgetSize): Partial<DefForm> {
  const w = String(size.w);
  const h = String(size.h);
  if (target === "def") return { defW: w, defH: h };
  if (target === "min") return { minW: w, minH: h };
  return { maxW: w, maxH: h };
}

/** 미리보기 틀 크기 — 폭 = 미리보기 영역 × w/24, 높이 = h×20 + (h−1)×8 px(보드의 한 칸·간격과 같다). */
export function previewBox(areaWidth: number, size: WidgetSize): { width: number; height: number } {
  const w = Math.min(Math.max(size.w, 1), GRID_COLS);
  const h = Math.max(size.h, 1);
  return {
    width: Math.floor((Math.max(areaWidth, 0) * w) / GRID_COLS),
    height: h * ROW_HEIGHT + (h - 1) * ROW_MARGIN,
  };
}
