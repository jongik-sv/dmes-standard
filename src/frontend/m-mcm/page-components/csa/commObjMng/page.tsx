"use client";

/**
 * commObjMng 화면 — OBJECT 관리 (As-Is CommObjMng.xfdl).
 *
 * 인용 정본:
 *   - 분석리포트 §3 (UI 컴포넌트) / §4 (이벤트) / §6 (SQL) / §8 (BPMN)
 *   - 기능설계서 §3 (조회+그리드) / §4 (Detail 필드) / §5 (버튼) / §6 (validation V-001~V-901) / §10 (메시지)
 *   - 디자인설계서 §2 (좌우분할 레이아웃) / §4 (15 Detail 필드)
 *   - BPMN설계서 §1.1 (3 API) / §2 (action 흐름)
 *
 * 페이지 유형: C 단일 그리드 + 단일 상세 폼 (G+D 좌우 분할).
 * 호출: POST /api/mcm/oasis/commObjMng/{action} (OASIS only — mcm 모듈 SqlSession 미등록).
 * To-Be 정책 #1: BIZ_SYSTEM_CODE/APP_HOST 폐기 → S-001 / D-003 / G-006 / LV-001 모두 제거.
 *
 * 패턴: cma masterCategoryMng (단일 그리드 + GridPanel 표준 메뉴) + Detail 우측 폼.
 *
 * 2026-06-01 fix — As-Is 정합 + 스크린샷 정합:
 *   - 검색 영역 사용여부를 Combo (Y/N + 전체) 로 — S-003 (xfdl:160~161).
 *   - 상단 버튼바에 "닫기" 버튼 추가 — B-004 (xfdl:277~281).
 *   - Detail 의 raw input/select/radio 를 shared 컴포넌트 (Input/Select/Radio/DatePicker/ComboBox) 로 교체.
 *   - Detail 의 START/END_ACTIVE_DATE 는 DatePicker — D-015/D-016 (xfdl:111/106 Calendar).
 *   - Grid 의 USE_TP (G-009) / ACCESS_TP (G-015) 는 codecol/datacol 표시 — As-Is combotext displaytype.
 *   - Grid 의 START/END_ACTIVE_DATE (G-013/G-014) 는 yyyy-MM-dd 표시 포맷 — As-Is displaytype=date.
 *   - SYSTEM_CODE maxlength 50 / OBJECT_TYPE 90 — As-Is xfdl:108/105.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PageLayout,
  SearchArea,
  SearchField,
  ContentBody,
  ContentPanel,
  ErrorModal,
  DETAIL_TABLE_STYLE,
  DETAIL_LABEL_CELL,
  DETAIL_VALUE_CELL,
} from "@dk-oasis/shared/layout";
import { GridPanel, AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import {
  Input,
  Select,
  Radio,
  DatePicker,
  ComboBox,
} from "@dk-oasis/shared/form";
import { MdmFieldLabel } from "@dk-oasis/shared/mdm-meta";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { useCarryRestored, useCarryState } from "@dk-oasis/shared/portal-shell";
import { searchCommObjMng, saveCommObjMng, loadLov, searchSystemLov } from "./api";
import type {
  CommObjMngFilters,
  CommObjMngRow,
  MenuIdLov,
  RowStatus,
} from "./types";

interface GridRow extends Record<string, unknown> {
  __gridTempId?: string;
  __rowId?: string;
  nativeeditor_status?: RowStatus;
}

function getRowKey(row: GridRow): string {
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

function stripInternal<T extends GridRow>(row: T): Record<string, unknown> {
  const {
    __gridTempId: _t,
    __rowId: _r,
    nativeeditor_status: _s,
    ...rest
  } = row as Record<string, unknown>;
  return rest;
}

const DEFAULT_FILTERS: CommObjMngFilters = { edt_OBJECT_ID: "", cbo_USE_TP: "" };

/** S-003 / D-013 / G-009 — Y/N (LV-002 정적 — 분석 §3.8 DS-005). */
const USE_TP_OPTIONS: { value: string; label: string }[] = [
  { value: "Y", label: "Yes" },
  { value: "N", label: "No" },
];

/** S-003 (검색) — Combo 정적 옵션 "전체" + Y/N (xfdl:161 displaynulltext="전체"). */
const USE_TP_SEARCH_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "전체" },
  { value: "Y", label: "Yes" },
  { value: "N", label: "No" },
];

/**
 * D-010 / G-015 — 접속 경로.
 * 2026-06-03 사용자 명시 변경 — As-Is 3 enum ("1 내부 neXacro" / "2 외부 neXacro" / "3 외부 url")
 * → To-Be 2 enum 단순화 ("내부" / "외부"). value = label 동일 (별도 LABEL_MAP ✗).
 * DB ACCESS_TP 잔존 값 ("1" / "2" / "3") 은 DataInitializer 멱등 UPDATE 가 "내부" / "외부" 로 일괄 정정.
 */
const ACCESS_TP_OPTIONS: { value: string; label: string }[] = [
  { value: "내부", label: "내부" },
  { value: "외부", label: "외부" },
];

const USE_TP_LABEL: Record<string, string> = Object.fromEntries(
  USE_TP_OPTIONS.map((o) => [o.value, o.label]),
);

/**
 * BE LocalDateTime ISO / "yyyyMMdd" 8자 / "yyyy-MM-dd" / null → DatePicker (`<input type="date">`)
 * 가 받을 수 있는 "yyyy-MM-dd" 문자열로 정규화. invalid → 빈 문자열.
 * As-Is xfdl Calendar dateformat="yyyy-MM-dd" (xfdl:106 / 111) 정합 (W5 commUserMng 정본).
 */
function toDateInputValue(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s || s === "null") return "";
  // ISO yyyy-MM-dd[Thh:mm:ss...] → 앞 10자
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  // yyyyMMdd 8자
  if (/^\d{8}$/.test(s)) return `${s.substring(0, 4)}-${s.substring(4, 6)}-${s.substring(6, 8)}`;
  return "";
}

/** Master 그리드 컬럼 — 분석 §3.3 G-001~G-015 / 디자인 §3.3 / To-Be 정책 #1 (G-006 폐기 → 14 컬럼).
 *  2026-06-02 iter W5 — pattern D: 그리드 인라인 편집 비활성화 (editable: false).
 *  사유: 본 화면은 "행 클릭 → Detail 폼에서 수정" 패턴 (AsIs xfdl ds_main bind Detail BindItem 양방향). */
const MASTER_COLUMNS: GridColumn[] = [
  { key: "OBJECT_ID", header: "OBJECT ID *", width: 200, editable: false, align: "left" },
  { key: "OBJECT_NM", header: "OBJECT NAME", width: 180, editable: false, align: "left" },
  { key: "PROGRAM_DESC", header: "프로그램 설명", width: 180, editable: false, align: "left" },
  { key: "SYSTEM_CODE", header: "SYSTEM", width: 90, editable: false, align: "center" },
  { key: "OBJECT_TYPE", header: "OBJECT TYPE", width: 100, editable: false, align: "center" },
  { key: "SERVICE", header: "SERVICE", meta: false, width: 160, editable: false, align: "left" },
  {
    key: "USE_TP",
    header: "사용여부 *",
    width: 90,
    editable: false,
    align: "center",
    // As-Is G-009 displaytype="combotext" 정합 — code(Y/N) 저장, label(Yes/No) 표시.
    render: (v) => USE_TP_LABEL[String(v ?? "")] ?? String(v ?? ""),
  },
  {
    key: "ACCESS_TP",
    header: "접속 경로 *",
    width: 120,
    editable: false,
    align: "center",
    // 2026-06-03 — value=label 동일 ("내부"/"외부") — LABEL_MAP 폐기, 원본 값 그대로 표시.
    render: (v) => String(v ?? ""),
  },
  { key: "FORM_URL", header: "FORM URL", width: 200, editable: false, align: "left" },
  { key: "OUT_ACCESS_IP", header: "외부 접속 주소", width: 180, editable: false, align: "left" },
  { key: "PARAM", header: "PARAM", meta: false, width: 140, editable: false, align: "left" },
  {
    key: "START_ACTIVE_DATE",
    header: "유효개시일",
    width: 110,
    editable: false,
    align: "center",
    // 2026-06-02 W5 iter — 수정이 yyyy-MM-dd 만 하므로 표시도 yyyy-MM-dd 만 (시분초 제거).
    render: (v) => toDateInputValue(v),
  },
  {
    key: "END_ACTIVE_DATE",
    header: "유효기한일",
    width: 110,
    editable: false,
    align: "center",
    render: (v) => toDateInputValue(v),
  },
  { key: "MENU_ID", header: "MENU ID", width: 120, editable: false, align: "center" },
];

/**
 * 행추가 default (V-301 / xfdl:414~429 + To-Be END_ACTIVE_DATE 정정 9999-12-31).
 * 2026-06-05 — SYSTEM_CODE default 는 systemOptions[0]?.value ?? "mcm" (시드 fallback).
 */
function emptyRow(defaultSystemCode: string = "mcm"): CommObjMngRow {
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
    MENU_ID: "",
    ID: "",
  };
}

export default function CommObjMngPage() {
  const { showMessage } = useMessage();

  // 새 창으로 분리할 때 이어받는 상태(useCarryState) — 조회 조건·선택 키는 가볍게, 조회 결과 행은 bulky.
  // 메뉴·SYSTEM LoV 는 마운트 때 다시 받는 목록이라 이어받지 않는다(useState).
  const [filters, setFilters] = useCarryState<CommObjMngFilters>("filters", DEFAULT_FILTERS);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useCarryState<(CommObjMngRow & GridRow)[]>("rows", [], { bulky: true });
  const [selectedKey, setSelectedKey] = useCarryState<string | null>("selectedKey", null);
  const restored = useCarryRestored();

  const [menuLov, setMenuLov] = useState<MenuIdLov[]>([]);
  /**
   * 2026-06-05 — SYSTEM 콤보박스 옵션 (TB_MCM_SEC_MENU_FLD root 폴더).
   * mount 시 1회 로드. 현 시점 시드는 'mcm' 1행. 추후 다른 모듈 root 추가 시 자동 노출.
   */
  const [systemOptions, setSystemOptions] = useState<{ value: string; label: string }[]>([]);

  const selected = useMemo<(CommObjMngRow & GridRow) | null>(() => {
    if (!selectedKey) return null;
    return rows.find((r) => getRowKey(r) === selectedKey) ?? null;
  }, [rows, selectedKey]);

  const hasAnyChanges = useMemo(
    () => rows.some((r) => r.nativeeditor_status),
    [rows],
  );

  const visibleCount = rows.filter((r) => r.nativeeditor_status !== "deleted").length;

  // ── load ──
  /** Form onload 시 lov 사전 로딩 (As-Is fn_lov / BPMN action=lov). */
  useEffect(() => {
    void (async () => {
      try {
        const lov = await loadLov();
        setMenuLov(lov.ds_lovMenuId ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "LoV 조회 실패");
      }
    })();
  }, []);

  /**
   * 2026-06-05 — SYSTEM LoV 사전 로딩 (TB_MCM_SEC_MENU_FLD root 폴더).
   * mount 시 1회 호출. 응답 row → { value: MENU_ID, label: MENU_NM ?? MENU_ID }.
   */
  useEffect(() => {
    void (async () => {
      try {
        const payload = await searchSystemLov();
        const opts = (payload.ds_systemLov ?? []).map((r) => ({
          value: String(r.MENU_ID ?? ""),
          label: String(r.MENU_NM ?? r.MENU_ID ?? ""),
        }));
        setSystemOptions(opts);
      } catch (e) {
        setError(e instanceof Error ? e.message : "SYSTEM LoV 조회 실패");
      }
    })();
  }, []);

  /** action=searchCmObj (fn_search → fn_run("searchCmObj"), xfdl:404). */
  const loadList = useCallback(
    async (f: CommObjMngFilters) => {
      setIsSearching(true);
      setError(null);
      try {
        const payload = await searchCommObjMng(f);
        const list = (payload.ds_main ?? []).map((r, i) => ({
          ...withSyntheticId(r, i),
          nativeeditor_status: "" as RowStatus,
        }));
        setRows(list);
        if (list.length > 0) {
          setSelectedKey(getRowKey(list[0]));
        } else {
          setSelectedKey(null);
        }
        // V-701 — As-Is "{N}건 조회 되었습니다." (xfdl:376)
        showMessage({ message: `${list.length}건 조회 되었습니다.`, toast: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : "조회 실패");
        setRows([]);
      } finally {
        setIsSearching(false);
      }
    },
    [showMessage, setRows, setSelectedKey],
  );

  useEffect(() => {
    // 새 창이 이어받은 행이 있으면 자동 조회를 건너뛴다(행 없이 복원됐으면 이어받은 조건으로 조회). 복원값이 없으면 DEFAULT_FILTERS 다.
    // 조회 결과를 상태에 담는 비동기 호출이라 effect 안 setState 규칙에 걸린다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!restored || rows.length === 0) void loadList(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilterChange = (k: keyof CommObjMngFilters, v: string) =>
    setFilters((p) => ({ ...p, [k]: v }));

  const handleSearch = () => void loadList(filters);

  /** B-002 초기화 (fn_reset / xfdl:409). */
  const handleReset = () => {
    setFilters(DEFAULT_FILTERS);
  };

  /**
   * B-006 행취소 — 선택된 단일 row 만 취소 (cma masterCategoryMng 패턴).
   * inserted → row 제거 / updated/deleted → status reset.
   */
  const handleRowCancel = useCallback(() => {
    if (!selectedKey) {
      setError("취소할 행을 선택하세요.");
      return;
    }
    setRows((prev) => {
      const target = prev.find((r) => getRowKey(r) === selectedKey);
      if (!target?.nativeeditor_status) {
        setError("변경된 행이 아닙니다.");
        return prev;
      }
      if (target.nativeeditor_status === "inserted") {
        return prev.filter((r) => getRowKey(r) !== selectedKey);
      }
      return prev.map((r) =>
        getRowKey(r) === selectedKey
          ? { ...r, nativeeditor_status: "" as RowStatus }
          : r,
      );
    });
    setSelectedKey(null);
  }, [selectedKey, setRows, setSelectedKey]);

  /**
   * 행추가 / 행복사 / 행삭제 통합 핸들러 (GridPanel onDataChange 시그니처).
   * addedRowKey 있음 → 신규/복사 (emptyRow() default 5종 — V-301).
   * 없음 → 행삭제 → newData 비교 → 사라진 행은 deleted 마킹 (V-101 MENU_ID 차단 포함).
   */
  const handleDataChange = useCallback(
    (newData: Record<string, unknown>[], addedRowKey?: string) => {
      if (addedRowKey) {
        const sourceRow = newData.find(
          (r) => (r as GridRow).__gridTempId === addedRowKey,
        ) as Partial<CommObjMngRow> | undefined;
        setRows((prev) => {
          const base = sourceRow ?? {};
          // 행복사 시 sourceRow 가 OBJECT_ID 들고 있을 수 있으나 PK 충돌 방지 위해 항상 빈 값
          // (cma masterCategoryMng 패턴 — 필수 PK 는 사용자 입력 강제).
          const newRow: CommObjMngRow & GridRow = {
            ...emptyRow(systemOptions[0]?.value ?? "mcm"),
            ...base,
            OBJECT_ID: "",
            __gridTempId: addedRowKey,
            nativeeditor_status: "inserted" as RowStatus,
          };
          return [...prev, newRow];
        });
        setSelectedKey(addedRowKey);
      } else {
        // 행삭제 — V-101 MENU_ID 존재 시 차단
        setRows((prev) => {
          const newKeys = new Set(newData.map((r) => getRowKey(r as GridRow)));
          const removed = prev.filter((r) => !newKeys.has(getRowKey(r)));
          for (const r of removed) {
            if (
              r.nativeeditor_status !== "inserted" &&
              r.MENU_ID &&
              String(r.MENU_ID).length > 0
            ) {
              setError("연결된 메뉴가 존재합니다. 제외 후 삭제 하세요.");
              return prev;
            }
          }
          const kept = newData as (CommObjMngRow & GridRow)[];
          const deleted = removed
            .filter((r) => r.nativeeditor_status !== "inserted")
            .map((r) => ({ ...r, nativeeditor_status: "deleted" as RowStatus }));
          return [...kept, ...deleted];
        });
      }
    },
    [systemOptions, setRows, setSelectedKey],
  );

  /** 셀 변경 — FORM_URL 자동 채움 (MENU_ID / OBJECT_ID 변경 시 `${MENU_ID}/${OBJECT_ID}` 재계산).
   *  2026-06-05 사용자 결정 변경:
   *    - 요청 1: MENU_ID 변경 시 OBJECT_ID 자동 prefix (`{menuId 앞 3자}::{ID}`) 제거 → OBJECT_ID 는 사용자 직접 입력.
   *    - 요청 2: FORM_URL 은 readOnly 자동 채움 — MENU_ID 또는 OBJECT_ID 변경 시 `${MENU_ID}/${OBJECT_ID}` 로 재계산.
   *      한쪽이라도 비어있으면 FORM_URL 도 빈 값. componentPath 정합 (Phase 1+2 라우팅 패턴).
   */
  const handleCellChange = useCallback(
    (p: { rowKey: string | number; field: string; newValue: unknown }) => {
      setRows((prev) =>
        prev.map((r) => {
          if (getRowKey(r) !== String(p.rowKey)) return r;
          const fieldName = String(p.field);
          const updated: CommObjMngRow & GridRow = {
            ...r,
            [fieldName]: p.newValue,
          };
          updated.nativeeditor_status =
            r.nativeeditor_status === "inserted" ? "inserted" : "updated";
          // FORM_URL 자동 채움 — PARENT_MENU_ID / OBJECT_ID 변경 시 `${PARENT_MENU_ID}/${OBJECT_ID}` 재계산.
          // 한쪽이라도 비어있으면 FORM_URL 도 빈 값.
          // BE searchCmObj 응답의 MENU_ID 는 OBJECT_ID 와 동일한 redundant alias — 실제 그룹 토큰 source 는 PARENT_MENU_ID.
          if (fieldName === "PARENT_MENU_ID" || fieldName === "OBJECT_ID") {
            const mid = String(updated.PARENT_MENU_ID ?? "").trim();
            const oid = String(updated.OBJECT_ID ?? "").trim();
            updated.FORM_URL = mid && oid ? `${mid}/${oid}` : "";
          }
          // BE 호환성 — OBJECT_ID 변경 시 MENU_ID 도 동기화 (redundant alias 유지).
          if (fieldName === "OBJECT_ID") {
            updated.MENU_ID = String(updated.OBJECT_ID ?? "");
          }
          return updated;
        }),
      );
    },
    [setRows],
  );

  /** B-003 저장 (fn_save / xfdl:464). V-001 ~ V-003 validation → API 호출. */
  const handleSave = useCallback(async () => {
    // V-001 변경 데이터 검증
    if (!hasAnyChanges) {
      setError("변경된 데이터가 없습니다.");
      return;
    }
    // V-002 필수 3 컬럼 (To-Be 정책 #1: BIZ_SYSTEM_CODE 제거)
    for (const r of rows) {
      if (!r.nativeeditor_status) continue;
      if (r.nativeeditor_status === "deleted") continue;
      if (!r.OBJECT_ID || String(r.OBJECT_ID).trim().length === 0) {
        setError("OBJECT_ID 는 필수 입력입니다.");
        return;
      }
      if (!r.ACCESS_TP || String(r.ACCESS_TP).trim().length === 0) {
        setError("접속 경로(ACCESS_TP) 는 필수 입력입니다.");
        return;
      }
      if (!r.USE_TP || String(r.USE_TP).trim().length === 0) {
        setError("사용여부(USE_TP) 는 필수 입력입니다.");
        return;
      }
    }

    setIsSaving(true);
    setError(null);
    try {
      const payload = rows
        .filter((r) => r.nativeeditor_status)
        .map((r) => ({
          ...stripInternal(r),
          rowStatus: r.nativeeditor_status,
        })) as unknown as CommObjMngRow[];
      const res = await saveCommObjMng(payload);
      // M-006 / V-702 — "성공적으로 저장되었습니다." + 후속 재조회
      showMessage({ message: `${res.cnt_merge ?? 0}건 저장되었습니다.` });
      const refreshed = (res.ds_main ?? []).map((r, i) => ({
        ...withSyntheticId(r, i),
        nativeeditor_status: "" as RowStatus,
      }));
      setRows(refreshed);
      setSelectedKey(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setIsSaving(false);
    }
  }, [rows, hasAnyChanges, showMessage, setRows, setSelectedKey]);

  /** Detail 필드 변경 — handleCellChange 위임. */
  const updateDetailField = (field: keyof CommObjMngRow, value: string) => {
    if (!selected) return;
    handleCellChange({ rowKey: getRowKey(selected), field: String(field), newValue: value });
  };

  return (
    <PageLayout
      title="OBJECT 관리"
      breadcrumb="공통관리 > 시스템관리 > OBJECT 관리"
      objId="commObjMng"
      // 2026-06-02 W5 pattern E — AsIs xfdl:279 commonTop 4 버튼 정합 (btn_search/btn_reset/btn_save/btn_close).
      //   - AsIs 가 btn_reset 포함 (W5 commUserMng 와 다른 점 — AsIs 따른다).
      //   - 사전 disabled 는 isSearching||isSaving 만 (double-click 방지). row-state 사전 disable ✗.
      //   - 핸들러가 V-NNN (변경된 데이터 없음 / 필수입력) 검증 후 ErrorModal 차단.
      buttons={[
        {
          id: "btn_search",
          label: "조회",
          onClick: handleSearch,
          type: "primary" as const,
          disabled: isSearching || isSaving,
          action: "search",
        },
        {
          id: "btn_reset",
          label: "초기화",
          onClick: handleReset,
          disabled: isSearching || isSaving,
          action: "cancel",
        },
        {
          id: "btn_save",
          label: "저장",
          onClick: () => void handleSave(),
          type: "save" as const,
          disabled: isSearching || isSaving,
          action: "save",
        },
      ]}
    >
      <SearchArea onSearch={handleSearch}>
        <SearchField
          label="OBJECT"
          name="OBJECT_ID"
          value={filters.edt_OBJECT_ID}
          onChange={(v) => handleFilterChange("edt_OBJECT_ID", v)}
        />
        <SearchField
          label="사용 여부"
          name="USE_TP"
          type="select"
          options={USE_TP_SEARCH_OPTIONS}
          value={filters.cbo_USE_TP}
          onChange={(v) => handleFilterChange("cbo_USE_TP", v)}
        />
      </SearchArea>

      <ContentBody root>
        {/* W5 pattern A — 좌측 그리드는 flex:1 (가용 영역 확장), 우측 Detail 은 width 좁게 (필요한 만큼만). */}
        <ContentPanel flex={1}>
          <GridPanel
            title="OBJECT 목록"
            count={visibleCount}
            showAddButton
            showCopyButton
            showDeleteButton
            buttons={[
              {
                id: "btn_rowCancel",
                label: "행취소",
                onClick: handleRowCancel,
                disabled: isSearching || isSaving || !hasAnyChanges,
              },
            ]}
            data={rows}
            rowKey="__rowId"
            columns={MASTER_COLUMNS}
            selectedRowKey={selectedKey}
            onDataChange={handleDataChange}
            loading={isSaving}
          >
            <AgDataGrid
              columnSizing="fit"
              columns={MASTER_COLUMNS}
              data={rows}
              rowKey="__rowId"
              sortable
              singleClickEdit
              stopEditingWhenCellsLoseFocus={false}
              highlightedRowKey={selectedKey}
              onRowClick={(row) => setSelectedKey(getRowKey(row as GridRow))}
              onCellValueChanged={handleCellChange}
              loading={isSearching}
              loadingMessage="조회 중..."
              emptyMessage="조회된 OBJECT 가 없습니다."
            />
          </GridPanel>
        </ContentPanel>

        {/* W5 pattern A — Detail 패널 좁게 (W5 commUserMng=480 보다 더 좁게: 본 화면 입력 width=236px 기준 → 430px).
            W5 pattern B — wrapper: marginTop 32 (panel-header 라인 자리 비움) + height auto + border + bg #fff,
                           28px header bar (배경 #f4f6f8 + fontWeight 600 + #333) 양 그리드 column-header 라인 정렬. */}
        <ContentPanel width={430}>
          <div style={{
            marginTop: 32,
            display: "flex",
            flexDirection: "column",
            height: "auto",
            border: "1px solid #d4dae0",
            background: "#fff",
          }}>
            <div style={{
              height: 28,
              background: "#f4f6f8",
              borderBottom: "1px solid #d4dae0",
              padding: "0 10px",
              display: "flex",
              alignItems: "center",
              fontWeight: 600,
              fontSize: 13,
              color: "#333",
              flexShrink: 0,
            }}>
              상세 정보
            </div>
            <div style={{ background: "#fff" }}>
              {selected ? (
                <DetailForm
                  selected={selected}
                  menuLov={menuLov}
                  systemOptions={systemOptions}
                  updateDetailField={updateDetailField}
                />
              ) : (
                <div style={{ padding: 16, color: "#888", background: "#fff" }}>
                  행을 선택하거나 행을 추가하세요.
                </div>
              )}
            </div>
          </div>
        </ContentPanel>
      </ContentBody>

      <ErrorModal message={error} onClose={() => setError(null)} />
    </PageLayout>
  );
}

/**
 * 상세 정보 폼 — As-Is OBJECT 관리 스크린샷 정합.
 *
 * 2026-06-01 fix:
 *   - shared 컴포넌트 (Input/Select/Radio/DatePicker/ComboBox) 사용 — 규칙 §11 / project guideline.
 *   - START/END_ACTIVE_DATE 는 DatePicker — As-Is xfdl:111/106 Calendar (yyyy-MM-dd) 정합.
 *   - MENU ID 는 ComboBox (LV-001 정적 검색 가능) — As-Is xfdl:124 cbo_folder.
 *   - 접속 경로 / 사용 여부 는 Select / Radio — As-Is xfdl:115/109.
 *   - V-401~V-403 분기: ACCESS_TP=1 → FORM_URL 활성 + edt_out_access_ip 비활성;
 *     ACCESS_TP=2 → 둘 다 활성; ACCESS_TP=3 → FORM_URL 비활성 + edt_out_access_ip 활성.
 */
function DetailForm({
  selected,
  menuLov,
  systemOptions,
  updateDetailField,
}: {
  selected: CommObjMngRow & GridRow;
  menuLov: MenuIdLov[];
  /** 2026-06-05 — SYSTEM 콤보 옵션 (TB_MCM_SEC_MENU_FLD root). */
  systemOptions: { value: string; label: string }[];
  updateDetailField: (field: keyof CommObjMngRow, value: string) => void;
}) {
  // 2026-06-05 사용자 결정 — FORM URL 은 사용자 직접 수정 ✗, 항상 `${PARENT_MENU_ID}/${OBJECT_ID}` 자동 산출.
  //   - readOnly 시각 힌트: 회색 background.
  //   - PARENT_MENU_ID 또는 OBJECT_ID 가 없으면 빈 값.
  //   - handleCellChange 에서 PARENT_MENU_ID / OBJECT_ID 변경 시 FORM_URL 동기화.
  //   - BE searchCmObj 응답의 MENU_ID 는 OBJECT_ID 와 동일한 redundant alias 라 그룹 토큰(csa/cma/cme) 은 PARENT_MENU_ID 필드.
  //     componentPath 정합 (Phase 1+2 라우팅 패턴) = `${groupToken}/${objectId}`.
  const outAccessIpDisabled = selected.ACCESS_TP !== "외부";
  const computedFormUrl = (() => {
    const mid = String(selected.PARENT_MENU_ID ?? "").trim();
    const oid = String(selected.OBJECT_ID ?? "").trim();
    return mid && oid ? `${mid}/${oid}` : "";
  })();

  const menuLovData = useMemo(
    () => menuLov.map((m) => ({ value: m.MENU_ID, label: m.MENU_ID_NM })),
    [menuLov],
  );

  return (
    <table style={DETAIL_TABLE_STYLE}>
      <tbody>
        {/* D-001 OBJECT ID — 신규 행 (inserted) 만 편집 가능 (PK). 기존 행 readOnly.
            V-502 (MENU_ID + ID 자동 조합) 도 신규 행에서 그대로 동작 — 자동 조합 결과를 사용자가 덮어쓸 수도 있음. */}
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="OBJECT_ID" label="OBJECT ID" required /></th>
          <td style={DETAIL_VALUE_CELL}>
            <Input
              value={String(selected.OBJECT_ID ?? "")}
              maxLength={100}
              readOnly={selected.nativeeditor_status !== "inserted"}
              onChange={(v: string) => updateDetailField("OBJECT_ID", v)}
            />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="SYSTEM_CODE" label="SYSTEM" /></th>
          <td style={DETAIL_VALUE_CELL}>
            {/* 2026-06-05 — Input → Select. options source = TB_MCM_SEC_MENU_FLD root (PARENT_MENU_ID IS NULL).
                현 시점 시드는 'mcm' 1행. 추후 다른 모듈(mpn/mqc 등) root 추가 시 자동 노출. */}
            <Select
              value={String(selected.SYSTEM_CODE ?? "")}
              options={systemOptions}
              placeholder="(선택)"
              onChange={(v: string) => updateDetailField("SYSTEM_CODE", v)}
            />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="PARENT_MENU_ID" label="MENU ID" /></th>
          <td style={DETAIL_VALUE_CELL}>
            {/* 2026-06-05 — BE searchCmObj 응답의 MENU_ID 는 OBJECT_ID 와 동일한 redundant alias.
                실제 그룹 토큰 (csa/cma/cme) source 는 PARENT_MENU_ID 필드 → value/onChange 모두 PARENT_MENU_ID 로 binding.
                라벨 "MENU ID" 는 사용자 친화 — As-Is 정합 유지. options source (menuLovData = TB_MCM_SEC_MENU_FLD) 동일. */}
            <ComboBox
              data={menuLovData}
              valueField="value"
              labelField="label"
              value={String(selected.PARENT_MENU_ID ?? "")}
              onChange={(v: string) => updateDetailField("PARENT_MENU_ID", v)}
              placeholder="(선택)"
            />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="ID" meta={false} label="ID" required /></th>
          <td style={DETAIL_VALUE_CELL}>
            <Input
              value={String(selected.ID ?? "")}
              maxLength={100}
              onChange={(v: string) => updateDetailField("ID", v)}
            />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="OBJECT_NM" label="OBJECT명" /></th>
          <td style={DETAIL_VALUE_CELL}>
            <Input
              value={String(selected.OBJECT_NM ?? "")}
              maxLength={100}
              onChange={(v: string) => updateDetailField("OBJECT_NM", v)}
            />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="PROGRAM_DESC" label="프로그램 설명" /></th>
          <td style={DETAIL_VALUE_CELL}>
            <Input
              value={String(selected.PROGRAM_DESC ?? "")}
              maxLength={300}
              onChange={(v: string) => updateDetailField("PROGRAM_DESC", v)}
            />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="OBJECT_TYPE" label="OBJECT TYPE" /></th>
          <td style={DETAIL_VALUE_CELL}>
            <Input
              value={String(selected.OBJECT_TYPE ?? "")}
              maxLength={90}
              onChange={(v: string) => updateDetailField("OBJECT_TYPE", v)}
            />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="SERVICE" meta={false} label="SERVICE" /></th>
          <td style={DETAIL_VALUE_CELL}>
            <Input
              value={String(selected.SERVICE ?? "")}
              maxLength={100}
              onChange={(v: string) => updateDetailField("SERVICE", v)}
            />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="ACCESS_TP" label="접속 경로" required /></th>
          <td style={DETAIL_VALUE_CELL}>
            <Select
              value={String(selected.ACCESS_TP ?? "")}
              options={ACCESS_TP_OPTIONS}
              placeholder="(선택)"
              onChange={(v: string) => updateDetailField("ACCESS_TP", v)}
            />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="computedFormUrl" meta={false} label="FORM URL" /></th>
          <td style={DETAIL_VALUE_CELL}>
            <Input
              value={computedFormUrl}
              maxLength={100}
              readOnly
              style={{ background: "#f4f6f8", cursor: "not-allowed" }}
              onChange={() => { /* readOnly — 사용자 직접 수정 ✗, MENU_ID/OBJECT_ID 변경 시 자동 동기화 */ }}
            />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="OUT_ACCESS_IP" label="외부 접속 주소" /></th>
          <td style={DETAIL_VALUE_CELL}>
            <Input
              value={String(selected.OUT_ACCESS_IP ?? "")}
              maxLength={150}
              disabled={outAccessIpDisabled}
              onChange={(v: string) => updateDetailField("OUT_ACCESS_IP", v)}
            />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="USE_TP" label="사용 여부" /></th>
          <td style={DETAIL_VALUE_CELL}>
            <Radio
              name="USE_TP"
              value={String(selected.USE_TP ?? "Y")}
              options={USE_TP_OPTIONS}
              onChange={(v: string) => updateDetailField("USE_TP", v)}
            />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="PARAM" meta={false} label="파라메터" /></th>
          <td style={DETAIL_VALUE_CELL}>
            <Input
              value={String(selected.PARAM ?? "")}
              maxLength={150}
              onChange={(v: string) => updateDetailField("PARAM", v)}
            />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="START_ACTIVE_DATE" label="유효 개시일" /></th>
          <td style={DETAIL_VALUE_CELL}>
            <DatePicker
              value={toDateInputValue(selected.START_ACTIVE_DATE)}
              onChange={(v) => updateDetailField("START_ACTIVE_DATE", v)}
            />
          </td>
        </tr>
        <tr>
          <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="END_ACTIVE_DATE" label="유효 기한일" /></th>
          <td style={DETAIL_VALUE_CELL}>
            <DatePicker
              value={toDateInputValue(selected.END_ACTIVE_DATE)}
              onChange={(v) => updateDetailField("END_ACTIVE_DATE", v)}
            />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
