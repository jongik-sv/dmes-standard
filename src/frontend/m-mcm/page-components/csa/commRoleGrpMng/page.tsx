"use client";

/**
 * commRoleGrpMng 화면 — 역할 그룹 관리 (As-Is CommRoleGrpMng.xfdl).
 *
 * 2026-06-02 round-2 — AsIs 1:1 재개발 (사용자 지적: AsIs/ToBe 레이아웃 완전 불일치).
 *
 * AsIs 인용 정본:
 *   - xfdl: docs/external/SampleErp/orgErpSource/mui/src/nxuiMui/csa/CommRoleGrpMng.xfdl
 *   - image: docs/external/SampleErp/orgErpSource/mui_screen/CommRoleGrpMng.jpg
 *   - BPMN: services/csa/CommRoleGrpMng.bpmn (action 7 → To-Be 6: lov 폐기)
 *   - Mapper: persistence/mappers-csa/CommRoleGrpMngMapper.xml
 *
 * To-Be 레이아웃 (사용자 결정 — 메뉴 트리 영역 제거):
 *   ┌──────────────────────────────────────┬─────────────────────────┐
 *   │ Row 1 좌 — 역할그룹 목록 (div_mainGrd) │ Row 1 우 — Detail        │
 *   │   STATUS/ID/NM/DESC/USE_TP/SAD/EAD    │   (div_mainDetail)      │
 *   │   width=메인:right=440 (좌 flex:1)     │   width=430              │
 *   ├────────────────────────┬──────────────┴─────────────────────────┤
 *   │ Row 2 좌 — 현재 역할     │ 셔틀  │ Row 2 우 — 전체 역할            │
 *   │ (sub1 div_subGrd1)     │ ▲▼   │ (sub2 div_subGrd2)             │
 *   └────────────────────────┴──────┴────────────────────────────────┘
 *   (Row 2 = sub1 flex:1 + 셔틀 36px + sub2 flex:1 3분할)
 *
 *   ※ 사용자 명시 (round 3): AsIs 메뉴 구조 트리 (grd_M0F1, width=250) 영역 제거.
 *
 * AsIs commonTopButton (xfdl:364): [btn_search], [btn_reset], [btn_save], [btn_close]
 * AsIs commonRightButton on grd_main (xfdl:376): [btn_rowAdd], [btn_rowDelete], [btn_rowCopy], [btn_rowCancel]
 * AsIs div_buttonGrp (xfdl:116~123): btn_right (▼ 위→아래 = 현재 → 제외) + btn_left (▲ 아래→위 = 추가)
 *
 * 2-chain auto load (xfdl:753~770 ds_main_onrowposchanged 中 2 회 호출만 유지):
 *   역할 그룹 행 선택 → searchCmRoleGrpMap + searchCmRole (2 회 fn_run).
 *   ※ AsIs 의 searchCmRoleGrpMenu 호출은 메뉴 트리 영역 제거로 동반 제거.
 *      BE action 자체는 보존 (다른 호출처 없음 확인 시점까지 안전 보존).
 *
 * To-Be 정책 #1: BIZ_SYSTEM_CODE 폐기 (S-001 / D-002 / G-005 / LV-001 / lov action 제거).
 *
 * W5 패턴 (A~G):
 *   - A: 메인 그리드 flex:1, Detail width=430 narrow
 *   - B: Detail wrapper marginTop=32 + 28px gray header "상세 정보"
 *   - C: form row alignment (table)
 *   - D: editable:false 전체 + date toDateInputValue + code LABEL_MAP
 *   - E: commonTopButton 4 (search/reset/save/close)
 *   - F: csa 자동조회 useEffect → loadList(DEFAULT_FILTERS)
 *   - G: BE END_OF_TIME=00:00:00 (이미 적용)
 *
 * 레이아웃 collapse 회피 (commRoleMng 검증 패턴):
 *   ContentBody root → 명시적 column stacker div → Row1 row + Row2 row.
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
  Button,
  Input,
  DatePicker,
  Radio,
} from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";
import {
  searchCmRoleGrp as apiSearchCmRoleGrp,
  saveCmRoleGrp as apiSaveCmRoleGrp,
  searchCmRoleGrpMap as apiSearchCmRoleGrpMap,
  saveCmRoleGrpMap as apiSaveCmRoleGrpMap,
  searchCmRole as apiSearchCmRole,
} from "./api";
import type {
  CommRoleGrpMngFilters,
  CommRoleGrpMngRoleMapRow,
  CommRoleGrpMngRoleRow,
  CommRoleGrpMngRow,
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
    String((row as { ROLE_GROUP_ID?: unknown }).ROLE_GROUP_ID ?? "")
  );
}

/** 신규/조회 행 모두 `__rowId` 합성 — AgDataGrid rowKey 가 단일 컬럼만 지원 + 신규 row PK 충돌 회피. */
function withSyntheticId<T extends Partial<CommRoleGrpMngRow>>(r: T, idx: number): T & { __rowId: string } {
  return { ...r, __rowId: `rg-${idx}-${String(r.ROLE_GROUP_ID ?? "")}` };
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

const DEFAULT_FILTERS: CommRoleGrpMngFilters = {
  edt_ROLE_GROUP_ID: "",
  edt_ROLE_GROUP_NM: "",
  cbo_USE_TP: "",
};

/** S-004 / G-006 / D-005 — LV-002 정적 Y/N (xfdl ds_useTp / LV-003 라디오 Y=Yes / N=No 디자인 §3.3 §4.1). */
const USE_TP_OPTIONS: { value: string; label: string }[] = [
  { value: "Y", label: "Yes" },
  { value: "N", label: "No" },
];

/** S-004 검색 Combo — As-Is xfdl displaynulltext="전체" + 정적 Y/Y, N/N (xfdl:24~42). */
const USE_TP_SEARCH_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "전체" },
  { value: "Y", label: "Y" },
  { value: "N", label: "N" },
];

const USE_TP_LABEL: Record<string, string> = {
  Y: "Y",
  N: "N",
};

/** As-Is `yyyyMMdd` (8자) → `yyyy-MM-dd` 변환 (G-007/G-008 displaytype=date / GE1/GE2 동일). */
function formatDateCell(raw: unknown): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s || s === "null") return "";
  if (s.includes("T")) return s.slice(0, 10);
  if (s.length >= 10 && s.charAt(4) === "-" && s.charAt(7) === "-") return s.slice(0, 10);
  if (s.length === 8 && /^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s;
}

function toIsoDate(raw: unknown): string {
  return formatDateCell(raw);
}

function fromIsoDate(iso: string): string {
  if (!iso) return "";
  if (iso.length === 10 && iso.charAt(4) === "-") {
    return iso.replace(/-/g, "");
  }
  return iso;
}

/** 메인 역할 그룹 그리드 컬럼 — 분석 §3.3 G-002~G-008 (To-Be 7 컬럼 / G-005 BIZ_SYSTEM_CODE 제외).
 *  editable: false (AsIs 행 클릭 → Detail 폼에서 수정 — xfdl ds_main_onrowposchanged → BindItem). */
const ROLEGRP_COLUMNS: GridColumn[] = [
  {
    key: "ROLE_GROUP_ID",
    header: "역할 그룹 ID *",
    width: 140,
    editable: false,
    align: "left",
  },
  { key: "ROLE_GROUP_NM", header: "역할 그룹명", width: 160, editable: false, align: "left" },
  { key: "ROLE_GROUP_DESC", header: "역할 그룹 설명", width: 240, editable: false, align: "left" },
  {
    key: "USE_TP",
    header: "사용구분",
    width: 80,
    editable: false,
    align: "center",
    render: (v) => USE_TP_LABEL[String(v ?? "")] ?? String(v ?? ""),
  },
  {
    key: "START_ACTIVE_DATE",
    header: "유효개시일",
    width: 100,
    editable: false,
    align: "center",
    render: (v) => formatDateCell(v),
  },
  {
    key: "END_ACTIVE_DATE",
    header: "유효기한일",
    width: 100,
    editable: false,
    align: "center",
    render: (v) => formatDateCell(v),
  },
];

/** sub1 — 현재 매핑 역할 그리드 (ds_roleGrpMap). xfdl:54~93 grd_sub1 8 col (CHK 컬럼은 셔틀용 selectable). */
const ROLEMAP_COLUMNS: GridColumn[] = [
  { key: "ROLE_ID", header: "역할 ID", width: 110, editable: false, align: "left" },
  { key: "ROLE_NM", header: "역할명", width: 140, editable: false, align: "left" },
  { key: "PARENT_ROLE_ID", header: "부모역할 ID", width: 110, editable: false, align: "left" },
  {
    key: "USE_TP",
    header: "사용 여부",
    width: 70,
    editable: false,
    align: "center",
    render: (v) => USE_TP_LABEL[String(v ?? "")] ?? String(v ?? ""),
  },
  {
    key: "START_ACTIVE_DATE",
    header: "유효개시일",
    width: 100,
    editable: false,
    align: "center",
    render: (v) => formatDateCell(v),
  },
  {
    key: "END_ACTIVE_DATE",
    header: "유효기한일",
    width: 100,
    editable: false,
    align: "center",
    render: (v) => formatDateCell(v),
  },
  { key: "ROLE_GROUP_ID", header: "역할 그룹 ID", width: 110, editable: false, align: "left" },
];

/** sub2 — 미매핑 전체 역할 그리드 (ds_role). xfdl:177~213 grd_sub2 7 col (CHK 컬럼은 셔틀용 selectable). */
const ROLE_COLUMNS: GridColumn[] = [
  { key: "ROLE_ID", header: "역할 ID", width: 110, editable: false, align: "left" },
  { key: "ROLE_NM", header: "역할명", width: 140, editable: false, align: "left" },
  { key: "PARENT_ROLE_ID", header: "부모역할 ID", width: 100, editable: false, align: "left" },
  {
    key: "USE_TP",
    header: "사용여부",
    width: 70,
    editable: false,
    align: "center",
    render: (v) => USE_TP_LABEL[String(v ?? "")] ?? String(v ?? ""),
  },
  {
    key: "START_ACTIVE_DATE",
    header: "유효개시일",
    width: 100,
    editable: false,
    align: "center",
    render: (v) => formatDateCell(v),
  },
  {
    key: "END_ACTIVE_DATE",
    header: "유효기한일",
    width: 100,
    editable: false,
    align: "center",
    render: (v) => formatDateCell(v),
  },
];

/**
 * 행추가 default (xfdl:710~723 fn_rowAdd):
 *  - USE_TP = 'Y'
 *  - START_ACTIVE_DATE = gfn_today() 8자
 *  - END_ACTIVE_DATE = "99991231" → BE END_OF_TIME (9999-12-31 00:00:00) 정정
 */
function emptyRow(): CommRoleGrpMngRow {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return {
    ROLE_GROUP_ID: "",
    ROLE_GROUP_NM: "",
    ROLE_GROUP_DESC: "",
    USE_TP: "Y",
    START_ACTIVE_DATE: today,
    END_ACTIVE_DATE: "99991231",
  };
}

export default function CommRoleGrpMngPage() {
  const { showMessage } = useMessage();

  const [filters, setFilters] = useState<CommRoleGrpMngFilters>(DEFAULT_FILTERS);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<(CommRoleGrpMngRow & GridRow)[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const [roleMapRows, setRoleMapRows] = useState<(CommRoleGrpMngRoleMapRow & { __rmId: string })[]>([]);
  const [roleRows, setRoleRows] = useState<(CommRoleGrpMngRoleRow & { __rId: string })[]>([]);

  /** sub1/sub2 체크박스 선택 — AgDataGrid selectable+multiSelect (xfdl CHK 컬럼 등가). */
  const [roleMapSelectedKeys, setRoleMapSelectedKeys] = useState<(string | number)[]>([]);
  const [roleSelectedKeys, setRoleSelectedKeys] = useState<(string | number)[]>([]);

  /** GE2 필터 입력 — As-Is V-801 (xfdl:862~870 / `edt_rolefilter`). ROLE_ID indexOf 부분 일치. */
  const [roleFilter, setRoleFilter] = useState<string>("");

  const selected = useMemo<(CommRoleGrpMngRow & GridRow) | null>(() => {
    if (!selectedKey) return null;
    return rows.find((r) => getRowKey(r) === selectedKey) ?? null;
  }, [rows, selectedKey]);

  const hasAnyChanges = useMemo(
    () => rows.some((r) => r.nativeeditor_status),
    [rows],
  );

  const visibleCount = rows.filter((r) => r.nativeeditor_status !== "deleted").length;

  // GE2 필터 적용 — V-801 (xfdl:864)
  const filteredRoleRows = useMemo(() => {
    if (!roleFilter || roleFilter.trim().length === 0) return roleRows;
    const upper = roleFilter.toUpperCase();
    return roleRows.filter((r) => String(r.ROLE_ID ?? "").toUpperCase().includes(upper));
  }, [roleRows, roleFilter]);

  // ── search ──
  /** action=searchCmRoleGrp (EX-001 / fn_search → fn_run("searchCmRoleGrp"), xfdl:665). */
  const loadList = useCallback(
    async (f: CommRoleGrpMngFilters) => {
      setIsSearching(true);
      setError(null);
      try {
        const payload = await apiSearchCmRoleGrp(f);
        const list = (payload.ds_main ?? []).map((r, i) => ({
          ...withSyntheticId(r, i),
          nativeeditor_status: "" as RowStatus,
        }));
        setRows(list);
        if (list.length > 0) {
          setSelectedKey(getRowKey(list[0]));
        } else {
          setSelectedKey(null);
          setRoleMapRows([]);
          setRoleRows([]);
        }
        showMessage({ message: `${list.length}건 조회 되었습니다.`, toast: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : "조회 실패");
        setRows([]);
        setRoleMapRows([]);
        setRoleRows([]);
      } finally {
        setIsSearching(false);
      }
    },
    [showMessage],
  );

  const handleFilterChange = (k: keyof CommRoleGrpMngFilters, v: string) =>
    setFilters((p) => ({ ...p, [k]: v }));

  const handleSearch = () => void loadList(filters);

  /** EX-002 초기화 (fn_reset, xfdl:669). */
  const handleReset = () => {
    setFilters(DEFAULT_FILTERS);
  };

  // ── row select — 자동 2 chain 갱신 (ds_main_onrowposchanged, xfdl:753~770 중 sub1/sub2 만 — 메뉴 트리 영역 제거) ──
  const loadSubGrids = useCallback(async (roleGroupId: string) => {
    try {
      const [rm, rl] = await Promise.all([
        apiSearchCmRoleGrpMap(roleGroupId),
        apiSearchCmRole(roleGroupId),
      ]);
      setRoleMapRows(
        (rm.ds_roleGrpMap ?? []).map((r, i) => ({
          ...r,
          __rmId: `rm-${i}-${String(r.ROLE_GROUP_ID ?? "")}-${String(r.ROLE_ID ?? "")}`,
        })),
      );
      setRoleRows(
        (rl.ds_role ?? []).map((r, i) => ({
          ...r,
          __rId: `r-${i}-${String(r.ROLE_ID ?? "")}`,
        })),
      );
      setRoleMapSelectedKeys([]);
      setRoleSelectedKeys([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "매핑 조회 실패");
      setRoleMapRows([]);
      setRoleRows([]);
    }
  }, []);

  // W5 F — csa 그룹 화면 진입 시 자동조회 (AsIs gfn_formOnLoad(obj,true) 정합).
  useEffect(() => {
    void loadList(DEFAULT_FILTERS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // selectedKey 변경 시 2 sub 자동 갱신 (inserted ✗ / 메뉴 트리 영역 제거로 2-chain)
  useEffect(() => {
    if (!selectedKey || !selected) {
      setRoleMapRows([]);
      setRoleRows([]);
      return;
    }
    if (selected.nativeeditor_status === "inserted") {
      setRoleMapRows([]);
      setRoleRows([]);
      return;
    }
    const roleGroupId = String(selected.ROLE_GROUP_ID ?? "");
    if (roleGroupId) {
      void loadSubGrids(roleGroupId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  /**
   * EX3-004 행취소 — 선택된 단일 row 만 취소.
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
  }, [selectedKey]);

  /** 행추가 / 행복사 / 행삭제 통합 (GridPanel showAddButton/showCopyButton/showDeleteButton onDataChange). */
  const handleDataChange = useCallback(
    (newData: Record<string, unknown>[], addedRowKey?: string) => {
      if (addedRowKey) {
        const sourceRow = newData.find(
          (r) => (r as GridRow).__gridTempId === addedRowKey,
        ) as Partial<CommRoleGrpMngRow> | undefined;
        setRows((prev) => {
          const base = sourceRow ?? {};
          const newRow: CommRoleGrpMngRow & GridRow = {
            ...emptyRow(),
            ...base,
            ROLE_GROUP_ID: "", // PK 사용자 입력 강제
            __gridTempId: addedRowKey,
            nativeeditor_status: "inserted" as RowStatus,
          };
          return [...prev, newRow];
        });
        setSelectedKey(addedRowKey);
      } else {
        // 행삭제 — V-101 USER_ID 클라 검증 (선 검증 — 서버는 NOT EXISTS 재검증)
        for (const oldRow of rows) {
          if (!newData.some((r) => getRowKey(r as GridRow) === getRowKey(oldRow))) {
            if (oldRow.USER_ID && String(oldRow.USER_ID).trim().length > 0) {
              setError("연결된 사용자가 존재합니다. 제외 후 삭제 하세요.");
              return;
            }
          }
        }
        setRows((prev) => {
          const newKeys = new Set(newData.map((r) => getRowKey(r as GridRow)));
          const removed = prev.filter((r) => !newKeys.has(getRowKey(r)));
          const kept = newData as (CommRoleGrpMngRow & GridRow)[];
          const deleted = removed
            .filter((r) => r.nativeeditor_status !== "inserted")
            .map((r) => ({ ...r, nativeeditor_status: "deleted" as RowStatus }));
          return [...kept, ...deleted];
        });
      }
    },
    [rows],
  );

  /** 셀 변경 — Detail 폼 → 양방향 bind. PK ROLE_GROUP_ID 는 신규 행만 편집 가능. */
  const handleCellChange = useCallback(
    (p: { rowKey: string | number; field: string; newValue: unknown }) => {
      setRows((prev) =>
        prev.map((r) => {
          if (getRowKey(r) !== String(p.rowKey)) return r;
          const fieldName = String(p.field);
          if (fieldName === "ROLE_GROUP_ID" && r.nativeeditor_status !== "inserted") {
            return r;
          }
          const updated: CommRoleGrpMngRow & GridRow = {
            ...r,
            [fieldName]: p.newValue,
          };
          updated.nativeeditor_status =
            r.nativeeditor_status === "inserted" ? "inserted" : "updated";
          return updated;
        }),
      );
    },
    [],
  );

  /**
   * EX-003 저장 (fn_save / xfdl:674~685).
   * V-002 — gfn_isDatasetChanged false 차단.
   * V-003 — ds_roleGrpMap.rowCount > 0 시 차단.
   * V-004 — gfn_cpRequired("ROLE_GROUP_ID") 필수.
   */
  const handleSave = useCallback(async () => {
    if (!hasAnyChanges) {
      setError("저장할 데이터가 없습니다.");
      return;
    }
    const editedSelected = selected && selected.nativeeditor_status;
    if (editedSelected && roleMapRows.length > 0) {
      setError("현재 연결된 역할이 존재 합니다. 삭제 후 처리하세요.");
      return;
    }
    for (const r of rows) {
      if (!r.nativeeditor_status) continue;
      if (r.nativeeditor_status === "deleted") continue;
      if (!r.ROLE_GROUP_ID || String(r.ROLE_GROUP_ID).trim().length === 0) {
        setError("ROLE_GROUP_ID 는 필수 입력 항목 입니다.");
        return;
      }
    }

    if (typeof window !== "undefined" && !window.confirm("저장하시겠습니까?")) {
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const payload = rows
        .filter((r) => r.nativeeditor_status)
        .map((r) => ({
          ...stripInternal(r),
          rowStatus: r.nativeeditor_status,
        })) as unknown as CommRoleGrpMngRow[];
      const res = await apiSaveCmRoleGrp(payload);
      showMessage({ message: `${res.cnt_merge ?? 0}건 저장되었습니다.` });
      const refreshed = (res.ds_main ?? []).map((r, i) => ({
        ...withSyntheticId(r, i),
        nativeeditor_status: "" as RowStatus,
      }));
      setRows(refreshed);
      setSelectedKey(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패 하였습니다.");
    } finally {
      setIsSaving(false);
    }
  }, [rows, hasAnyChanges, selected, roleMapRows, showMessage]);

  // ── shuttle (div_buttonGrp xfdl:116~123) ──

  /** B-002 — 현재 역할 제외 (xfdl:611~623 / fn_removeRoleMapRow / saveCmRoleGrpMap action DELETE). btn_right ▼. */
  const handleShuttleRemove = useCallback(async () => {
    if (roleMapSelectedKeys.length === 0) {
      setError("제외할 역할을 선택하세요.");
      return;
    }
    const selKeySet = new Set(roleMapSelectedKeys.map((k) => String(k)));
    const checked = roleMapRows.filter((r) => selKeySet.has(r.__rmId));
    if (checked.length === 0) {
      setError("제외할 역할을 선택하세요.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const payload = checked.map((r) => ({
        ROLE_GROUP_ID: r.ROLE_GROUP_ID,
        ROLE_ID: r.ROLE_ID,
        rowStatus: "deleted" as RowStatus,
      })) as unknown as CommRoleGrpMngRoleMapRow[];
      const res = await apiSaveCmRoleGrpMap(payload);
      showMessage({ message: `${res.cnt_merge ?? 0}건 저장되었습니다.` });
      // 후속 3 chain 재조회 (xfdl:572~578 fn_callBack saveCmRoleGrpMap)
      if (selected && selected.ROLE_GROUP_ID) {
        await loadSubGrids(String(selected.ROLE_GROUP_ID));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setIsSaving(false);
    }
  }, [roleMapRows, roleMapSelectedKeys, selected, loadSubGrids, showMessage]);

  /** B-003 — 현재 역할 추가 (xfdl:625~645 / fn_appendRoleMapRow). V-401 + V-402 검증. btn_left ▲. */
  const handleShuttleAdd = useCallback(async () => {
    if (!selected || !selected.ROLE_GROUP_ID) {
      setError("선택된 Role 그룹 ID가 없습니다.");
      return;
    }
    if (roleSelectedKeys.length === 0) {
      setError("추가할 역할을 선택하세요.");
      return;
    }
    const selKeySet = new Set(roleSelectedKeys.map((k) => String(k)));
    const checked = roleRows.filter(
      (r) => selKeySet.has(r.__rId) && r.ROLE_ID && String(r.ROLE_ID).trim().length > 0,
    );
    if (checked.length === 0) {
      setError("추가할 역할을 선택하세요.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const payload = checked.map((r) => ({
        ROLE_GROUP_ID: String(selected.ROLE_GROUP_ID),
        ROLE_ID: r.ROLE_ID,
        rowStatus: "inserted" as RowStatus,
      })) as unknown as CommRoleGrpMngRoleMapRow[];
      const res = await apiSaveCmRoleGrpMap(payload);
      showMessage({ message: `${res.cnt_merge ?? 0}건 저장되었습니다.` });
      if (selected.ROLE_GROUP_ID) {
        await loadSubGrids(String(selected.ROLE_GROUP_ID));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setIsSaving(false);
    }
  }, [selected, roleRows, roleSelectedKeys, loadSubGrids, showMessage]);

  // ── Detail (D-NNN) ──
  const updateDetailField = (field: keyof CommRoleGrpMngRow, value: string) => {
    if (!selected) return;
    handleCellChange({ rowKey: getRowKey(selected), field: String(field), newValue: value });
  };

  const isNewRow = selected?.nativeeditor_status === "inserted";

  return (
    <PageLayout
      title="역할 그룹 관리"
      breadcrumb="공통관리 > 시스템관리 > 역할 그룹 관리"
      objId="commRoleGrpMng"
      // AsIs xfdl:364 commonTopButton: [btn_search], [btn_reset], [btn_save], [btn_close].
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
        {/* S-001 BIZ SYSTEM 콤보 폐기 (정책 #1) */}
        <SearchField
          label="역할 그룹 ID"
          value={filters.edt_ROLE_GROUP_ID}
          onChange={(v) => handleFilterChange("edt_ROLE_GROUP_ID", v)}
        />
        <SearchField
          label="역할 그룹명"
          value={filters.edt_ROLE_GROUP_NM}
          onChange={(v) => handleFilterChange("edt_ROLE_GROUP_NM", v)}
        />
        <SearchField
          label="사용 여부"
          type="select"
          options={USE_TP_SEARCH_OPTIONS}
          value={filters.cbo_USE_TP}
          onChange={(v) => handleFilterChange("cbo_USE_TP", v)}
        />
      </SearchArea>

      {/* AsIs 2-row layout — commRoleMng 검증 패턴 (외곽 ContentBody row + 명시적 column stacker). */}
      <ContentBody root>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: "1 1 0",
            gap: 6,
            minHeight: 0,
          }}
        >
          {/* ── Row 1: 역할그룹 목록 (좌, flex:1) + Detail (우, width=430) ── */}
          <div
            style={{
              display: "flex",
              flex: "1 1 0",
              flexDirection: "row",
              gap: 6,
              minHeight: 0,
            }}
          >
            {/* W5 A: 메인 그리드 flex:1 (xfdl div_mainGrd right=440 ↔ Detail width=430). */}
            <ContentPanel>
              <GridPanel
                title="역할그룹 목록"
                count={visibleCount}
                showAddButton
                showCopyButton
                showDeleteButton
                buttons={[
                  {
                    id: "btn_rowCancel",
                    label: "행취소",
                    onClick: handleRowCancel,
                    disabled: isSearching || isSaving,
                  },
                ]}
                data={rows}
                rowKey="__rowId"
                columns={ROLEGRP_COLUMNS}
                selectedRowKey={selectedKey}
                onDataChange={handleDataChange}
                loading={isSaving}
              >
                <AgDataGrid
                  columnSizing="fit"
                  columns={ROLEGRP_COLUMNS}
                  data={rows}
                  rowKey="__rowId"
                  sortable
                  highlightedRowKey={selectedKey}
                  onRowClick={(row) => setSelectedKey(getRowKey(row as GridRow))}
                  loading={isSearching}
                  loadingMessage="조회 중..."
                  emptyMessage="조회된 역할 그룹이 없습니다."
                />
              </GridPanel>
            </ContentPanel>

            {/* W5 A + B: Detail width=430 (AsIs xfdl:220 div_mainDetail width=430 정합). */}
            <ContentPanel width={430}>
              {selected ? (
                <div style={{
                  marginTop: 32,
                  display: "flex",
                  flexDirection: "column",
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
                  <div style={{ padding: 0, background: "#fff" }}>
                    <table style={DETAIL_TABLE_STYLE}>
                      <tbody>
                        {/* D-001 역할 그룹 ID — 신규 행만 편집 (PK / V-004 필수 / xfdl:238 maxlength=90) */}
                        <tr>
                          <th style={DETAIL_LABEL_CELL}>역할 그룹 ID *</th>
                          <td style={DETAIL_VALUE_CELL}>
                            <Input
                              value={String(selected.ROLE_GROUP_ID ?? "")}
                              maxLength={100}
                              readOnly={selected.nativeeditor_status !== "inserted"}
                              onChange={(v: string) => updateDetailField("ROLE_GROUP_ID", v)}
                            />
                          </td>
                        </tr>
                        {/* D-002 BIZ SYSTEM 콤보 폐기 (정책 #1) */}
                        {/* D-003 역할 그룹명 (xfdl:240 maxlength=100) */}
                        <tr>
                          <th style={DETAIL_LABEL_CELL}>역할 그룹명</th>
                          <td style={DETAIL_VALUE_CELL}>
                            <Input
                              value={String(selected.ROLE_GROUP_NM ?? "")}
                              maxLength={100}
                              onChange={(v) => updateDetailField("ROLE_GROUP_NM", v)}
                            />
                          </td>
                        </tr>
                        {/* D-004 역할 그룹 설명 (xfdl:260 maxlength=100) */}
                        <tr>
                          <th style={DETAIL_LABEL_CELL}>역할 그룹 설명</th>
                          <td style={DETAIL_VALUE_CELL}>
                            <Input
                              value={String(selected.ROLE_GROUP_DESC ?? "")}
                              maxLength={100}
                              onChange={(v) => updateDetailField("ROLE_GROUP_DESC", v)}
                            />
                          </td>
                        </tr>
                        {/* D-005 사용 여부 — Radio (xfdl:241~258 Y=Yes / N=No / direction=vertical) */}
                        <tr>
                          <th style={DETAIL_LABEL_CELL}>사용 여부</th>
                          <td style={DETAIL_VALUE_CELL}>
                            <Radio
                              name="USE_TP"
                              value={String(selected.USE_TP ?? "Y")}
                              options={USE_TP_OPTIONS}
                              onChange={(v) => updateDetailField("USE_TP", v)}
                            />
                          </td>
                        </tr>
                        {/* D-006 유효 개시일 — DatePicker (xfdl:259 cal_start_active_date) */}
                        <tr>
                          <th style={DETAIL_LABEL_CELL}>유효 개시일</th>
                          <td style={DETAIL_VALUE_CELL}>
                            <DatePicker
                              value={toIsoDate(selected.START_ACTIVE_DATE)}
                              onChange={(iso) => updateDetailField("START_ACTIVE_DATE", fromIsoDate(iso))}
                            />
                          </td>
                        </tr>
                        {/* D-007 유효 기한일 — DatePicker (xfdl:239 cal_end_active_date) */}
                        <tr>
                          <th style={DETAIL_LABEL_CELL}>유효 기한일</th>
                          <td style={DETAIL_VALUE_CELL}>
                            <DatePicker
                              value={toIsoDate(selected.END_ACTIVE_DATE)}
                              onChange={(iso) => updateDetailField("END_ACTIVE_DATE", fromIsoDate(iso))}
                            />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div style={{
                  marginTop: 32,
                  display: "flex",
                  flexDirection: "column",
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
                  }}>
                    상세 정보
                  </div>
                  <div style={{ padding: 16, color: "#888", background: "#fff" }}>
                    역할 그룹을 선택하거나 행을 추가하세요.
                  </div>
                </div>
              )}
            </ContentPanel>
          </div>

          {/* ── Row 2: 현재 역할(좌, flex:1) + 셔틀(36px) + 전체 역할(우, flex:1) ──
              사용자 결정 (round 3): AsIs 메뉴 구조 트리 (width=250) 영역 제거.
              AsIs xfdl div_subGrd1 의 우측 sub1 (left=260) + div_buttonGrp (셔틀) + div_subGrd2 (sub2). */}
          <div
            style={{
              display: "flex",
              flex: "1 1 0",
              flexDirection: "row",
              gap: 6,
              minHeight: 0,
            }}
          >
            {/* GE1 — 현재 역할 (AsIs grd_sub1 sub1, div_subGrd1 의 우측 부분 left=260 right=0). */}
            <ContentPanel>
              <GridPanel
                title="현재 역할"
                count={roleMapRows.length}
                data={roleMapRows}
                rowKey="__rmId"
                columns={ROLEMAP_COLUMNS}
              >
                <AgDataGrid
                  columnSizing="fit"
                  columns={ROLEMAP_COLUMNS}
                  data={roleMapRows}
                  rowKey="__rmId"
                  selectable
                  multiSelect
                  sortable={false}
                  onRowSelect={(ids) => setRoleMapSelectedKeys(ids)}
                  emptyMessage="현재 매핑된 역할이 없습니다."
                />
              </GridPanel>
            </ContentPanel>

            {/* div_buttonGrp — 셔틀 버튼 (xfdl:116~123 width=24, btn_right ▼ 제외 / btn_left ▲ 추가). */}
            <div style={{
              flex: "0 0 36px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "0 4px",
            }}>
              <Button
                onClick={() => void handleShuttleAdd()}
                disabled={isSaving}
                ariaLabel="선택한 역할을 현재 역할에 추가 (B-003 btn_left ▲)"
              >
                ▲
              </Button>
              <Button
                onClick={() => void handleShuttleRemove()}
                disabled={isSaving}
                ariaLabel="선택한 역할을 현재 역할에서 제외 (B-002 btn_right ▼)"
              >
                ▼
              </Button>
            </div>

            {/* GE2 — 전체 역할 (AsIs grd_sub2 sub2, div_subGrd2). 우측 상단에 Role 라벨 + 필터 입력. */}
            <ContentPanel>
              <GridPanel
                title="전체 역할"
                count={filteredRoleRows.length}
                data={filteredRoleRows}
                rowKey="__rId"
                columns={ROLE_COLUMNS}
              >
                <div style={{ display: "flex", gap: 8, padding: 4, alignItems: "center", justifyContent: "flex-end" }}>
                  <span style={{ fontSize: 12, color: "#555" }}>Role</span>
                  <div style={{ width: 160 }}>
                    <Input
                      value={roleFilter}
                      onChange={(v) => setRoleFilter(v)}
                      placeholder="ROLE_ID 부분 일치"
                    />
                  </div>
                </div>
                <AgDataGrid
                  columnSizing="fit"
                  columns={ROLE_COLUMNS}
                  data={filteredRoleRows}
                  rowKey="__rId"
                  selectable
                  multiSelect
                  sortable={false}
                  onRowSelect={(ids) => setRoleSelectedKeys(ids)}
                  emptyMessage="조회된 역할이 없습니다."
                />
              </GridPanel>
            </ContentPanel>
          </div>
        </div>
      </ContentBody>

      <ErrorModal message={error} onClose={() => setError(null)} />
    </PageLayout>
  );
}
