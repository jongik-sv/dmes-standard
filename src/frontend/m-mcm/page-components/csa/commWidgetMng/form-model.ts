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
  return { ...row, configJson: configJsonOf(config) };
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
 * 새로 고침 30~86400초, 문자열은 컬럼 길이 이하. 정의 위젯: 유형 필수, 정의 설정 200KB 이하.
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

  const refresh = form.refreshSec.trim();
  if (refresh !== "" && (!/^\d+$/.test(refresh) || Number(refresh) < 30 || Number(refresh) > 86400)) {
    errors.push("새로 고침 주기는 30~86400초여야 합니다.");
  }

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

/** 미리보기 틀 크기 — 폭 = 미리보기 영역 × w/24, 높이 = h×20 + (h−1)×8 px(보드의 한 칸·간격과 같다). */
export function previewBox(areaWidth: number, size: WidgetSize): { width: number; height: number } {
  const w = Math.min(Math.max(size.w, 1), GRID_COLS);
  const h = Math.max(size.h, 1);
  return {
    width: Math.floor((Math.max(areaWidth, 0) * w) / GRID_COLS),
    height: h * ROW_HEIGHT + (h - 1) * ROW_MARGIN,
  };
}
