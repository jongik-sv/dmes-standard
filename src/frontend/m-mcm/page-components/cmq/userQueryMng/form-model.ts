/**
 * userQueryMng 순수 함수 — 조회조건·정의 폼 검사·할당 후보 합치기(스펙 2026-10-10-user-query-program-design §4.1·§8.2).
 * @dk-oasis/shared 는 타입만 import 한다(m-mcm vitest 가 shared 런타임 없이 시험한다).
 */
import type { TransferListItem } from "@dk-oasis/shared/transfer-list";

import { validateColumns, validateParams } from "../../../widget-types/_query/format";
import { DEFAULT_MODULE, USRQ_MODULES, USRQ_MODULE_LABELS } from "../../_userq/types";
import type {
  UserQueryAssignRow,
  UserQueryCandidate,
  UserQueryDef,
  UserQueryListRow,
  UserQuerySearchCond,
} from "../../_userq/types";

export const SCREEN_ID = "userQueryMng";

/** 쿼리 ID 형식(서버 save 검사와 같다). */
export const QUERY_ID_RE = /^[A-Z][A-Z0-9_]{2,39}$/;
export const MAX_ROW_LIMIT = 5000;
export const DEFAULT_MAX_ROW = 1000;
/** saveAssign 상한(서버와 같다). */
export const ASSIGN_MAX = 2000;

/* ── 조회조건 ── */

export interface SearchFilters {
  categoryCd: string;
  moduleCd: string;
  keyword: string;
  useYn: "" | "Y" | "N";
  ownerDept: string;
  assignUser: string;
}

export const emptyFilters = (): SearchFilters => ({ categoryCd: "", moduleCd: "", keyword: "", useYn: "", ownerDept: "", assignUser: "" });

export const USE_FILTER_OPTIONS = [
  { value: "", label: "전체" },
  { value: "Y", label: "사용" },
  { value: "N", label: "미사용" },
];

export const USE_YN_OPTIONS = [
  { value: "Y", label: "사용" },
  { value: "N", label: "미사용" },
];

/** 빈 칸은 뺀다(서버가 null 로 읽는다). 글자 칸은 앞뒤 공백을 자른다. */
export function toSearchCond(f: SearchFilters): UserQuerySearchCond {
  const cond: UserQuerySearchCond = {};
  if (f.categoryCd) cond.categoryCd = f.categoryCd;
  if (f.moduleCd) cond.moduleCd = f.moduleCd;
  if (f.keyword.trim()) cond.keyword = f.keyword.trim();
  if (f.useYn) cond.useYn = f.useYn;
  if (f.ownerDept.trim()) cond.ownerDept = f.ownerDept.trim();
  if (f.assignUser.trim()) cond.assignUser = f.assignUser.trim();
  return cond;
}

/** 목록 그리드 한 줄 — 분류는 이름으로 바꿔 보인다. */
export interface QueryGridRow extends Record<string, unknown> {
  queryId: string;
  queryNm: string;
  categoryNm: string;
  moduleNm: string;
  ownerDeptNm: string;
  useYn: "Y" | "N";
  maxRowCnt: number;
  assignCnt: number;
  uAt: string;
}

export function toGridRows(rows: readonly UserQueryListRow[], categoryTitles: Readonly<Record<string, string>>): QueryGridRow[] {
  return rows.map((r) => ({
    queryId: r.queryId,
    queryNm: r.queryNm,
    categoryNm: r.categoryCd ? (categoryTitles[r.categoryCd] ?? r.categoryCd) : "",
    moduleNm: r.moduleCd ? `${r.moduleCd} ${USRQ_MODULE_LABELS[r.moduleCd]}` : "",
    ownerDeptNm: r.ownerDeptNm ?? r.ownerDeptCd ?? "",
    useYn: r.useYn,
    maxRowCnt: r.maxRowCnt,
    assignCnt: r.assignCnt,
    uAt: formatDateTime(r.uAt),
  }));
}

/** ISO 글자 → `yyyy-MM-dd HH:mm`. 읽지 못하면 앞 16자(T 는 공백). */
export function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(iso);
  return m ? `${m[1]} ${m[2]}` : iso.slice(0, 16).replace("T", " ");
}

/* ── 정의 폼 ── */

export function emptyDef(): UserQueryDef {
  return {
    queryId: "",
    queryNm: "",
    categoryCd: null,
    moduleCd: DEFAULT_MODULE,
    queryDesc: null,
    ownerDeptCd: null,
    ownerDeptNm: null,
    sqlText: "",
    params: [],
    columns: [],
    maxRowCnt: DEFAULT_MAX_ROW,
    useYn: "Y",
    ver: null,
  };
}

/** 저장 전 검사 — 첫 오류 문구, 없으면 null. SQL·입력/출력 정의의 깊은 검사는 서버가 한다. */
export function validateDef(def: UserQueryDef, isNew: boolean): string | null {
  if (isNew && !QUERY_ID_RE.test(def.queryId)) return "쿼리 ID는 영문 대문자로 시작하는 대문자·숫자·밑줄 3~40자여야 합니다.";
  if (def.queryNm.trim() === "") return "쿼리 이름을 입력하세요.";
  if (def.queryNm.length > 100) return "쿼리 이름은 100자 이하여야 합니다.";
  if (!(USRQ_MODULES as readonly string[]).includes(def.moduleCd)) return "모듈을 고르세요.";
  if ((def.queryDesc ?? "").length > 500) return "설명은 500자 이하여야 합니다.";
  if (!Number.isInteger(def.maxRowCnt) || def.maxRowCnt < 1 || def.maxRowCnt > MAX_ROW_LIMIT) {
    return `최대 행은 1~${MAX_ROW_LIMIT} 사이 정수여야 합니다.`;
  }
  if (def.sqlText.trim() === "") return "SQL을 입력하세요.";
  const paramErrors = validateParams({ params: def.params });
  if (paramErrors.length > 0) return paramErrors[0];
  if (def.columns.some((c) => c.field.trim() === "")) return "출력 정의에 필드가 빈 컬럼이 있습니다.";
  const columnErrors = validateColumns({ columns: def.columns });
  if (columnErrors.length > 0) return columnErrors[0];
  return null;
}

/** 저장하지 않은 고침이 있는가. 둘 다 없으면 false. */
export function isDefDirty(baseline: UserQueryDef | null, current: UserQueryDef | null): boolean {
  if (!baseline || !current) return false;
  return JSON.stringify(baseline) !== JSON.stringify(current);
}

/* ── 할당 ── */

export interface AssignItem extends TransferListItem {
  userNm: string;
  deptNm: string | null;
  /** 사용자 표에 없는 사용자. */
  missing: boolean;
}

/**
 * 전송 목록 후보 — 후보(사용 중 사용자) + 이미 할당됐으나 후보에 없는 사용자(없는 사용자·사용 중지 사용자).
 * 후보 순서를 지키고 후보 밖 할당 사용자는 뒤에 붙인다.
 */
export function buildAssignItems(candidates: readonly UserQueryCandidate[], assigned: readonly UserQueryAssignRow[]): AssignItem[] {
  const items: AssignItem[] = candidates.map((c) => ({
    code: c.userId,
    name: c.userNm,
    userNm: c.userNm,
    deptNm: c.deptNm,
    missing: false,
  }));
  const known = new Set(items.map((i) => i.code));
  for (const a of assigned) {
    if (known.has(a.userId)) continue;
    known.add(a.userId);
    items.push({ code: a.userId, name: a.userNm ?? "", userNm: a.userNm ?? "", deptNm: a.deptNm, missing: a.missing });
  }
  return items;
}

export function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

export function diffIds(base: ReadonlySet<string>, next: ReadonlySet<string>): { added: string[]; removed: string[] } {
  return {
    added: [...next].filter((id) => !base.has(id)),
    removed: [...base].filter((id) => !next.has(id)),
  };
}
