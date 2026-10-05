/**
 * commWidgetMng(위젯 관리) 타입·상수 — 「위젯 목록」 탭. 스펙 2026-10-02-widget-admin-generic §10.1.
 * @dk-oasis/shared 는 타입만 import 한다(m-mcm vitest 가 shared 런타임 없이 시험한다).
 */
import type { WidgetDefRow } from "@dk-oasis/shared/widget";

export const SCREEN_ID = "commWidgetMng";

/** 목록 한 줄 — 코드 등록부 + 유형 등록부 + commWidgetMng/search 를 합친 것(사용 중지 포함). */
export interface AdminRow extends Record<string, unknown> {
  widgetId: string;
  /** 표시 이름 — 덮어쓴 이름 > 코드·유형 이름. */
  title: string;
  kind: "코드" | "정의";
  /** 정의 위젯의 유형 ID. 코드 위젯은 null. */
  typeId: string | null;
  /** 유형 이름. 코드 위젯은 "", 유형 등록부에 없으면 「알 수 없는 유형」. */
  typeTitle: string;
  /** 정의 위젯인데 유형이 등록부에 없다 — 상세는 지우기만 할 수 있다. */
  unknownType: boolean;
  useYn: "Y" | "N";
  /** 기본 크기 "w×h" (모르면 "-"). */
  defaultSize: string;
  /** 분류 코드(WIDGET_CTG). 코드 위젯은 덮어쓰기 값 ?? 코드 메타 값. 없으면 "". */
  categoryCd: string;
  /** 분류 이름 — 코드 → 이름 목록(LoV)에 없으면 코드 그대로. */
  category: string;
  userCount: number;
  /** 코드 위젯에 덮어쓰기 행이 있다(「덮어씀」 표시·[코드 값으로 되돌리기] 대상). */
  overridden: boolean;
  /** DB 행(덮어쓰기·정의). 코드 위젯에 덮어쓰기가 없으면 없다. */
  def?: WidgetDefRow;
}

export interface AdminFilters {
  keyword: string;
  kind: "" | "code" | "def";
  useYn: "" | "Y" | "N";
}

export const emptyAdminFilters = (): AdminFilters => ({ keyword: "", kind: "", useYn: "" });

export const KIND_OPTIONS = [
  { value: "", label: "전체" },
  { value: "code", label: "코드" },
  { value: "def", label: "정의" },
];

export const USE_FILTER_OPTIONS = [
  { value: "", label: "전체" },
  { value: "Y", label: "사용" },
  { value: "N", label: "중지" },
];

export const USE_YN_OPTIONS = [
  { value: "Y", label: "사용" },
  { value: "N", label: "중지" },
];

export const MULTIPLE_OPTIONS = [
  { value: "Y", label: "허용" },
  { value: "N", label: "허용 안 함" },
];

/**
 * 상세 폼 — 입력 칸은 문자열로 들고 저장 직전에 바꾼다(빈 칸 = NULL = 코드·유형 값).
 * 정의 위젯의 유형 설정(config)은 유형 편집기가 고친다.
 */
export interface DefForm {
  /** 신규 정의 위젯은 "" — 서버가 def.{key} 를 만든다. */
  widgetId: string;
  srcTp: "C" | "D";
  typeId: string | null;
  title: string;
  subtitle: string;
  description: string;
  defW: string;
  defH: string;
  minW: string;
  minH: string;
  maxW: string;
  maxH: string;
  refreshSec: string;
  linkPageId: string;
  /** "" = 코드 값(코드 위젯만). */
  multipleYn: "" | "Y" | "N";
  /** 분류(WIDGET_CTG 코드값). "" = 코드 값(코드 위젯)·분류 없음(정의 위젯). */
  categoryCd: string;
  useYn: "Y" | "N";
  /** 쿼리 유형의 실행 모듈(지금은 mcm 만). 그 밖 유형·코드 위젯은 null. */
  dataSrc: string | null;
  /** 정의 설정(CONFIG_JSON 파싱값). `__` 로 시작하는 최상위 키는 화면 전용이라 저장 때 지운다. */
  config: unknown;
}

/** commWidgetMng/save params — def Map 키 전부(스펙 §5.2, 계획 Task 2 표). */
export interface WidgetSaveParams {
  widgetId: string;
  srcTp: "C" | "D";
  typeId: string | null;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  defW: number | null;
  defH: number | null;
  minW: number | null;
  minH: number | null;
  maxW: number | null;
  maxH: number | null;
  refreshSec: number | null;
  linkPageId: string | null;
  multipleYn: "Y" | "N" | null;
  categoryCd: string | null;
  useYn: "Y" | "N";
  dataSrc: string | null;
  configJson: string | null;
}

/** commWidgetMng/search 결과 — defs 는 서버 Map 그대로(configJson 문자열), 화면이 toWidgetDefRow 로 바꾼다. */
export interface WidgetAdminSearchResult {
  defs: Record<string, unknown>[];
  /** WIDGET_ID 별 사용자 수(행 없는 코드 위젯 포함). */
  usage: Record<string, number>;
}
