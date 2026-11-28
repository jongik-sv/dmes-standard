/**
 * commObjMng 목록 행 모델 — 행 키·FE 전용 칸·초안 반영 같은 순수 함수.
 * 화면(page.tsx)과 상세 폼(ObjDetailForm.tsx)이 함께 쓴다.
 */
import type { CommObjMngRow, ObjOrig, RowStatus } from "./types";

export interface GridRow extends Record<string, unknown> {
  __gridTempId?: string;
  __rowId?: string;
  nativeeditor_status?: RowStatus;
}

/** 목록 행 = 서버 칸 + FE 전용 칸. */
export type ObjRow = CommObjMngRow & GridRow;

export function getRowKey(row: GridRow): string {
  return (
    (row.__gridTempId as string) ||
    (row.__rowId as string) ||
    String((row as { OBJECT_ID?: unknown }).OBJECT_ID ?? "")
  );
}

/** 신규/조회 행 모두 `__rowId` 합성 — AgDataGrid rowKey 가 단일 컬럼만 지원 + 신규 row OBJECT_ID="" 충돌 회피. */
function withSyntheticId<T extends Partial<CommObjMngRow>>(r: T, idx: number): T & { __rowId: string } {
  return { ...r, __rowId: `r-${idx}-${String(r.OBJECT_ID ?? "")}` };
}

/** 서버 응답 한 줄 → 목록 행. 조회 시점 허용 값·사용 여부를 `__orig` 에 남긴다. */
export function toListRow(r: CommObjMngRow, idx: number): ObjRow {
  const orig: ObjOrig = {
    BTN_PERM: String(r.BTN_PERM ?? ""),
    POPUP_PERM: String(r.POPUP_PERM ?? ""),
    USE_TP: String(r.USE_TP ?? ""),
  };
  const base = { ...withSyntheticId(r, idx), nativeeditor_status: "" as RowStatus, __orig: orig };
  return { ...base, __snap: base };
}

/** 행취소 — 조회 시점 행으로 되돌린다. 스냅샷이 없으면(이어받은 창 등) 상태만 푼다. */
export function restoreRow(row: ObjRow): ObjRow {
  return row.__snap ? ({ ...row.__snap, __snap: row.__snap } as ObjRow) : { ...row, nativeeditor_status: "" as RowStatus };
}

/** 새 행 = 기본값(emptyRow) 위에 base 를 얹되, base 의 빈 값("" · null)은 기본값을 지키게 한다(GridPanel 이 칸마다 ""를 채워 보낸다). */
export function fillBlank<T extends Record<string, unknown>>(base: Record<string, unknown>, defaults: T): T {
  const out: Record<string, unknown> = { ...defaults, ...base };
  for (const k of Object.keys(defaults)) if (out[k] === "" || out[k] == null) out[k] = defaults[k];
  return out as T;
}

const NOT_SENT = new Set(["__gridTempId", "__rowId", "__orig", "__snap", "nativeeditor_status", "MENU_CNT", "PERM_CNT"]);

/** 저장 body 에 싣지 않을 FE 전용 칸과 읽기 전용 집계를 뗀다. */
export function stripInternal(row: GridRow): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([k]) => !NOT_SENT.has(k)));
}

/**
 * 한 칸을 바꾼 새 행.
 * 2026-11-26 — FORM URL 을 메뉴 폴더 + OBJECT ID 로 계산하던 것(calcFormUrl)과 MENU_ID 별칭 맞추기를 없앴다.
 * FORM URL 은 오브젝트의 화면 코드 경로이고 사용자가 고른다(메뉴가 오브젝트를 가리킬 뿐, 오브젝트는 메뉴 정보를 갖지 않는다).
 * OBJECT ID 를 바꿨는데 FORM URL 이 비었으면 `resolveFormUrl`(같은 이름의 화면 코드 경로 찾기)이 준 값을 채운다.
 */
export function withField<T extends CommObjMngRow>(
  row: T,
  field: string,
  value: unknown,
  resolveFormUrl?: (objectId: string) => string | null,
): T {
  const next: T = { ...row, [field]: value };
  if (field === "OBJECT_ID" && resolveFormUrl && !String(next.FORM_URL ?? "").trim()) {
    const found = resolveFormUrl(String(next.OBJECT_ID ?? "").trim());
    if (found) next.FORM_URL = found;
  }
  return next;
}

/** 상세 폼 초안을 목록 행에 반영한다. 같은 행이 없으면 prev 그대로(참조 유지). 상태는 inserted 유지, 그 밖은 updated. */
export function applyDraft(prev: ObjRow[], draft: ObjRow): ObjRow[] {
  const key = getRowKey(draft);
  let hit = false;
  const next = prev.map((r) => {
    if (getRowKey(r) !== key) return r;
    hit = true;
    // 삭제 표시한 행은 고쳐도 삭제로 둔다(행취소로만 되살린다).
    if (r.nativeeditor_status === "deleted") return r;
    return {
      ...draft,
      nativeeditor_status: (r.nativeeditor_status === "inserted" ? "inserted" : "updated") as RowStatus,
    };
  });
  return hit ? next : prev;
}

/**
 * 행추가 default (V-301 / xfdl:414~429 + To-Be END_ACTIVE_DATE 정정 9999-12-31).
 * 2026-06-05 — SYSTEM_CODE default 는 systemOptions[0]?.value ?? "mcm" (시드 fallback).
 */
export function emptyRow(defaultSystemCode: string = "mcm"): CommObjMngRow {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return {
    OBJECT_ID: "",
    OBJECT_NM: "",
    PROGRAM_DESC: "",
    SYSTEM_CODE: defaultSystemCode, // 2026-06-05 콤보 첫 값 (시드 'mcm')
    OBJECT_TYPE: "web", // ST-004
    SERVICE: "",
    USE_TP: "Y", // ST-001
    ACCESS_TP: "",
    FORM_URL: "",
    OUT_ACCESS_IP: "",
    PARAM: "",
    START_ACTIVE_DATE: today,
    END_ACTIVE_DATE: "99991231", // ST-005 — BE 가 9999-12-31 23:59:59 정정
    ID: "",
    BTN_PERM: "",
    POPUP_PERM: "",
    DATA_PERM: "",
    MENU_CNT: 0,
    PERM_CNT: 0,
  };
}

/** 값이 양의 정수 건수인지(문자열로 와도 센다). */
export function toCount(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
