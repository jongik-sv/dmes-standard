"use client";

/**
 * commRoleMng 화면 — 역할 관리 (As-Is CommRoleMng.xfdl).
 *
 * 2026-06-02 — AsIs 1:1 재개발 (W5 commUserMng 정본 패턴 A~G 적용).
 * 2026-06-02 round-2 fix — sub2 OBJECT-LoV 신규 구현 (Q-016 closed):
 *   - As-Is xfdl:129 `div_object_id` (commonDynamic.xfdl Essential) 의 OBJECT 검색 + 선택 UI 가
 *     ToBe 에 누락되어 sub2 → sub1 권한 추가 시 V-002 "OBJECT ID 입력 후 추가해주세요" alert 으로
 *     기능 차단되던 결함을 해소.
 *   - 신규 BE action {@code searchObjectLov} 호출.
 *
 * 2026-06-02 round-3 fix — OBJECT-LoV Modal → 인라인 그리드 방식 (사용자 결정):
 *   - 기존 Modal (round-2) 폐기. sub2 영역을 좌(OBJECT 그리드) + 우(권한 그리드) 2 패널로 분할.
 *   - 좌: OBJECT FILTER input + 그리드 (다중 체크박스 selectable+multiSelect=true).
 *     데이터 = BE searchObjectLov 응답 (Form onload 시 1회 + OBJECT FILTER 변경 시 useMemo 클라이언트 필터).
 *   - 우: 권한 그리드 (단일 라디오 selectable+multiSelect=false).
 *     데이터 = BE searchCmPerm 응답 (기존).
 *   - "권한 추가" 버튼: selected OBJECTs (N개) × selected PERM (1개) = N row 권한 INSERT
 *     (BE saveCmRoleMap 이미 List<Map> 다중 row 지원 — BE 변경 ✗).
 *   - V-001 ROLE 미선택 / V-002 OBJECT 미선택 / V-PERM 권한 미선택 검증.
 *   - "권한 조회" 버튼 유지: 기존 fn_permSearch 동작 (우 권한 그리드 재조회).
 *
 * 2026-06-03 round-4 fix — 정합 정책 변경 (사용자 결정):
 *   1) sub2 좌 OBJECT 목록 — sub1 (현재 권한) 에 이미 부여된 OBJECT 는 FE 클라이언트 필터로 제외.
 *      이미 부여된 OBJECT 의 재부여 차단 (filteredObjectRows useMemo 분기 추가, roleMapRows 의존).
 *   2) sub2 우 전체 버튼 권한 — BE searchCmPerm 의 NOT EXISTS 분기 제거. 권한 부여 여부 무관 항상 전체 권한 표시.
 *      (SecRoleMappingNativeRepository.searchCmPerm SQL 의 NOT EXISTS 제거.)
 *   3) FILTER input 2개 panel header 신설 — OBJECT 목록 / 전체 버튼 권한 각각 우측 정렬 "FILTER" 라벨 + Input.
 *      OBJECT FILTER : OBJECT_ID + OBJECT_NM UPPER LIKE 부분 일치.
 *      PERMISSION FILTER : PERMISSION_ID + PERMISSION_NM UPPER LIKE 부분 일치 (기존 ID 단독 → 양쪽 확장).
 *
 * AsIs 인용 정본:
 *   - xfdl: docs/external/SampleErp/orgErpSource/mui/src/nxuiMui/csa/CommRoleMng.xfdl
 *   - 이미지: docs/external/SampleErp/orgErpSource/mui_screen/CommRoleMng.jpg
 *   - BPMN: services/csa/CommRoleMng.bpmn (action 7 — searchCmRole/saveCmRole/searchCmRoleMap/saveCmRoleMap/searchCmPerm/lov/searchObjectLov)
 *   - Mapper: persistence/mappers-csa/CommRoleMngMapper.xml
 *
 * AsIs 2x2 레이아웃 정합 (xfdl):
 *   ┌───────────────────────────────┬───────────────────────┐
 *   │ 역할 목록 (div_mainGrd)       │ 상세 (div_mainDetail) │
 *   ├───────────────────────────────┼───────────────────────┤
 *   │ 현재 버튼 권한 (div_subGrd1)   │ OBJECT (좌) + 권한 (우) │
 *   └───────────────────────────────┴───────────────────────┘
 *   AsIs div_buttonGrp (btn_left=추가, btn_right=삭제) 셔틀 — 권한 추가/삭제 버튼.
 *
 * W5 패턴 적용 (commUserMng — 2026-06-02 iter#5):
 *   - A 레이아웃 / B Detail wrapper / C Form row / D Grid / E Buttons / F Auto-search / G BE time.
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
  ComboBox,
  DatePicker,
  Radio,
} from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";
import {
  searchCmRole as apiSearchCmRole,
  saveCmRole as apiSaveCmRole,
  searchCmRoleMap as apiSearchCmRoleMap,
  saveCmRoleMap as apiSaveCmRoleMap,
  searchCmPerm as apiSearchCmPerm,
  loadLov as apiLoadLov,
  searchObjectLov as apiSearchObjectLov,
} from "./api";
import type {
  CommRoleMngFilters,
  CommRoleMngPermRow,
  CommRoleMngRoleMapRow,
  CommRoleMngRow,
  MenuIdLov,
  ObjectLovRow,
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
    String((row as { ROLE_ID?: unknown }).ROLE_ID ?? "")
  );
}

/** 신규/조회 행 모두 `__rowId` 합성 — AgDataGrid rowKey 가 단일 컬럼만 지원 + 신규 row PK 충돌 회피. */
function withSyntheticId<T extends Partial<CommRoleMngRow>>(r: T, idx: number): T & { __rowId: string } {
  return { ...r, __rowId: `r-${idx}-${String(r.ROLE_ID ?? "")}` };
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

const DEFAULT_FILTERS: CommRoleMngFilters = {
  edt_ROLE_ID: "",
  edt_ROLE_NM: "",
  cbo_USE_TP: "",
};

/** S-004 / G-007 / D-007 — LV-002 정적 Y/N (xfdl ds_useTp). */
const USE_TP_OPTIONS: { value: string; label: string }[] = [
  { value: "Y", label: "사용" },
  { value: "N", label: "미사용" },
];

/** S-004 검색 — Combo 정적 옵션 "전체" + Y/N (AsIs xfdl displaynulltext="전체"). */
const USE_TP_SEARCH_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "전체" },
  ...USE_TP_OPTIONS,
];

const USE_TP_LABEL_MAP: Record<string, string> = Object.fromEntries(
  USE_TP_OPTIONS.map((o) => [o.value, o.label]),
);

/**
 * BE LocalDateTime ISO / "yyyyMMdd" 8자 / "yyyy-MM-dd" / null → "yyyy-MM-dd" 정규화 (W5 정본).
 */
function toDateInputValue(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s || s === "null") return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  if (/^\d{8}$/.test(s)) return `${s.substring(0, 4)}-${s.substring(4, 6)}-${s.substring(6, 8)}`;
  return "";
}

/** DatePicker onChange (yyyy-MM-dd) → BE 가 LocalDateTime 으로 변환 가능한 형태로 보존. */
function fromDateInputValue(iso: string): string {
  return iso ?? "";
}

/**
 * 메인 역할 그리드 컬럼 — AsIs xfdl:142~184 grd_main 9 col 매핑.
 */
const ROLE_COLUMNS: GridColumn[] = [
  { key: "ROLE_ID", header: "ROLE ID", width: 160, editable: false, align: "left" },
  { key: "ROLE_NM", header: "ROLE 이름", width: 200, editable: false, align: "left" },
  { key: "ROLE_DESC", header: "ROLE 설명", width: 280, editable: false, align: "left" },
  { key: "MENU_ID", header: "MENU", width: 80, editable: false, align: "center" },
  {
    key: "USE_TP",
    header: "사용구분",
    width: 80,
    editable: false,
    align: "center",
    render: (v) => USE_TP_LABEL_MAP[String(v ?? "")] ?? String(v ?? ""),
  },
  {
    key: "START_ACTIVE_DATE",
    header: "유효개시일",
    width: 110,
    editable: false,
    align: "center",
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
];

/**
 * sub1 — 현재 권한 그리드 (ds_roleMap). AsIs xfdl:36~84 grd_sub1 10 col (CHK 헤더 자연 흡수).
 * BS-001 셔틀 삭제 전용 — 셀 편집 ✗.
 */
const ROLE_MAP_COLUMNS: GridColumn[] = [
  { key: "PERMISSION_ID", header: "PERMISSION ID", width: 130, editable: false, align: "left" },
  { key: "OBJECT_ID", header: "OBJECT ID", width: 110, editable: false, align: "left" },
  { key: "PERMISSION_NM", header: "PERMISSION 명", width: 140, editable: false, align: "left" },
  { key: "PERMISSION_COMMON", header: "공통 권한", width: 150, editable: false, align: "left" },
  { key: "PERMISSION_CUSTOM", header: "CUSTOM 권한", width: 150, editable: false, align: "left" },
  { key: "POPUP_BTN", header: "POPUP 버튼", width: 130, editable: false, align: "left" },
  { key: "OBJECT_NM", header: "OBJECT 명", width: 110, editable: false, align: "left" },
  { key: "SYSTEM_CODE", header: "SYSTEM", width: 70, editable: false, align: "center" },
  { key: "SERVICE", header: "SERVICE", width: 90, editable: false, align: "left" },
  { key: "ROLE_ID", header: "역할 ID", width: 90, editable: false, align: "left" },
];

/**
 * sub2 좌 — OBJECT 그리드 (round-3 fix / 인라인 grid 방식).
 * AsIs xfdl:321~336 commonDynamic_onload 응답 5 컬럼 중 OBJECT_ID / OBJECT_NM 만 노출 (사용자 사양).
 * 다중 체크박스 선택 (multiSelect=true).
 */
const OBJECT_COLUMNS: GridColumn[] = [
  { key: "OBJECT_ID", header: "OBJECT ID", width: 160, editable: false, align: "left" },
  { key: "OBJECT_NM", header: "OBJECT 명", width: 200, editable: false, align: "left" },
];

/**
 * sub2 우 — 전체 권한 후보 그리드 (ds_perm). AsIs xfdl:95~128 grd_sub2 5 col.
 * round-3 fix: 단일 선택 (multiSelect=false — 라디오 동작).
 */
const PERM_COLUMNS: GridColumn[] = [
  { key: "PERMISSION_ID", header: "PERMISSION ID", width: 140, editable: false, align: "left" },
  { key: "PERMISSION_NM", header: "PERMISSION명", width: 140, editable: false, align: "left" },
  { key: "PERMISSION_COMMON", header: "공통 권한", width: 170, editable: false, align: "left" },
  { key: "PERMISSION_CUSTOM", header: "CUSTOM 권한", width: 160, editable: false, align: "left" },
  { key: "POPUP_BTN", header: "POPUP버튼", width: 130, editable: false, align: "left" },
];

/**
 * 행추가 default — AsIs xfdl:687~697 fn_rowAdd.
 */
function emptyRow(): CommRoleMngRow {
  const today = new Date().toISOString().slice(0, 10); // yyyy-MM-dd
  return {
    ROLE_ID: "",
    ROLE_NM: "",
    ROLE_DESC: "",
    MENU_ID: "",
    USE_TP: "Y",
    START_ACTIVE_DATE: today,
    END_ACTIVE_DATE: "9999-12-31",
    ID: "",
  };
}

export default function CommRoleMngPage() {
  const { showMessage } = useMessage();

  const [filters, setFilters] = useState<CommRoleMngFilters>(DEFAULT_FILTERS);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<(CommRoleMngRow & GridRow)[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const [roleMapRows, setRoleMapRows] = useState<(CommRoleMngRoleMapRow & { __rmId: string })[]>([]);
  const [permRows, setPermRows] = useState<(CommRoleMngPermRow & { __pmId: string })[]>([]);
  const [menuLov, setMenuLov] = useState<MenuIdLov[]>([]);

  /**
   * sub2 좌 OBJECT 그리드 state (round-3 fix — 인라인 그리드 방식).
   *  - {@code objectRows}            : 전체 OBJECT 목록 (BE searchObjectLov 1회 로드)
   *  - {@code objectFilter}          : OBJECT FILTER input — OBJECT_ID/OBJECT_NM 부분 일치 (UPPER LIKE)
   *  - {@code objectSelectedKeys}    : 선택된 OBJECT 행 키 배열 (다중)
   *  - {@code objectLoading}         : OBJECT 조회 중 표시
   */
  const [objectRows, setObjectRows] = useState<(ObjectLovRow & { __olId: string })[]>([]);
  const [objectFilter, setObjectFilter] = useState<string>("");
  const [objectSelectedKeys, setObjectSelectedKeys] = useState<(string | number)[]>([]);
  const [objectLoading, setObjectLoading] = useState<boolean>(false);

  /** sub1 체크박스 다중 선택 — 권한 삭제용. */
  const [roleMapSelectedKeys, setRoleMapSelectedKeys] = useState<(string | number)[]>([]);

  /** sub2 우 권한 그리드 단일 선택 (round-3 fix: multiSelect=false → 단일 라디오). */
  const [permSelectedKeys, setPermSelectedKeys] = useState<(string | number)[]>([]);

  /** sub1 PERM 필터 (xfdl edt_permfilter2 onkeyup — UPPER LIKE). */
  const [roleMapFilter, setRoleMapFilter] = useState<string>("");
  /** sub2 우 PERM 필터 (xfdl edt_permfilter onkeyup — UPPER LIKE). */
  const [permFilter, setPermFilter] = useState<string>("");

  const selected = useMemo<(CommRoleMngRow & GridRow) | null>(() => {
    if (!selectedKey) return null;
    return rows.find((r) => getRowKey(r) === selectedKey) ?? null;
  }, [rows, selectedKey]);

  const hasAnyChanges = useMemo(
    () => rows.some((r) => r.nativeeditor_status),
    [rows],
  );

  const visibleCount = rows.filter((r) => r.nativeeditor_status !== "deleted").length;

  /** sub1 — PERMISSION_ID UPPER LIKE 필터 (xfdl:944~954 onkeyup). */
  const filteredRoleMapRows = useMemo(() => {
    const kw = roleMapFilter.trim().toUpperCase();
    if (!kw) return roleMapRows;
    return roleMapRows.filter((r) =>
      String(r.PERMISSION_ID ?? "").toUpperCase().includes(kw),
    );
  }, [roleMapRows, roleMapFilter]);

  /**
   * sub2 우 — 전체 버튼 권한 필터 (2026-06-03 사용자 결정 / xfdl:929~939 onkeyup 확장).
   * PERMISSION_ID + PERMISSION_NM 양쪽 부분 일치 (UPPER LIKE) — 기존 PERMISSION_ID 단독 → 양쪽 확장.
   */
  const filteredPermRows = useMemo(() => {
    const kw = permFilter.trim().toUpperCase();
    if (!kw) return permRows;
    return permRows.filter((r) => {
      const id = String(r.PERMISSION_ID ?? "").toUpperCase();
      const nm = String(r.PERMISSION_NM ?? "").toUpperCase();
      return id.includes(kw) || nm.includes(kw);
    });
  }, [permRows, permFilter]);

  /**
   * sub2 좌 — OBJECT 목록 필터 (2026-06-03 사용자 결정 — 정책 변경).
   *
   * <p>2 단계 필터:
   * <ol>
   *   <li><b>이미 부여된 OBJECT 제외</b> — sub1 (현재 권한 그리드) 의 OBJECT_ID 집합과 매칭하여 제외.
   *       이미 부여된 OBJECT 는 재부여 불가 → 목록에서 자체 숨김 (FE 클라이언트 필터).</li>
   *   <li><b>OBJECT FILTER UPPER LIKE</b> — OBJECT_ID + OBJECT_NM 양쪽 부분 일치.</li>
   * </ol>
   */
  const filteredObjectRows = useMemo(() => {
    const kw = objectFilter.trim().toUpperCase();
    // 1) sub1 의 OBJECT_ID 집합 — 이미 부여된 OBJECT 는 목록에서 제외
    const grantedObjIds = new Set(
      roleMapRows.map((r) => String(r.OBJECT_ID ?? "").toUpperCase()),
    );
    return objectRows.filter((r) => {
      const id = String(r.OBJECT_ID ?? "").toUpperCase();
      if (grantedObjIds.has(id)) return false; // 이미 부여 — 제외
      if (!kw) return true;
      const nm = String(r.OBJECT_NM ?? "").toUpperCase();
      return id.includes(kw) || nm.includes(kw);
    });
  }, [objectRows, objectFilter, roleMapRows]);

  // ── LoV (Form onload, AsIs xfdl:316~347 CommRoleMng_onload → fn_lov) ──
  useEffect(() => {
    void (async () => {
      try {
        const lov = await apiLoadLov();
        setMenuLov(lov.ds_lovMenuId ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "LoV 조회 실패");
      }
    })();
  }, []);

  /**
   * sub2 좌 OBJECT 그리드 로드 — Form onload 시 1회 (전체 OBJECT 목록 캐시).
   * AsIs xfdl:321~336 commonDynamic_onload 의 본 화면 namespace 내재화.
   * 검색 키워드 = "" (전체) → BE searchObjectLov("") → TB_MCM_SEC_OBJ WHERE USE_TP='Y' 전체.
   * 이후 OBJECT FILTER input 변경 시 클라이언트 useMemo 필터 (서버 재호출 ✗).
   */
  const loadObjectList = useCallback(async () => {
    setObjectLoading(true);
    try {
      const payload = await apiSearchObjectLov("");
      const list = (payload.ds_menuObjLst ?? []).map((r, i) => ({
        ...r,
        __olId: `ol-${i}-${String(r.OBJECT_ID ?? "")}`,
      }));
      setObjectRows(list);
      setObjectSelectedKeys([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "OBJECT 조회 실패");
      setObjectRows([]);
    } finally {
      setObjectLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadObjectList();
  }, [loadObjectList]);

  // ── search (action=searchCmRole — fn_search → fn_run("searchCmRole"), xfdl:630) ──
  const loadList = useCallback(
    async (f: CommRoleMngFilters) => {
      setIsSearching(true);
      setError(null);
      try {
        const payload = await apiSearchCmRole(f);
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
          setPermRows([]);
        }
        showMessage({ message: `${list.length}건 조회 되었습니다.`, toast: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : "조회 실패");
        setRows([]);
        setRoleMapRows([]);
        setPermRows([]);
      } finally {
        setIsSearching(false);
      }
    },
    [showMessage],
  );

  const handleFilterChange = (k: keyof CommRoleMngFilters, v: string) =>
    setFilters((p) => ({ ...p, [k]: v }));

  const handleSearch = () => void loadList(filters);

  /** B-002 초기화 (fn_reset, xfdl:634) — AsIs 명시 버튼. */
  const handleReset = () => {
    setFilters(DEFAULT_FILTERS);
  };

  // ── row select — 자동 sub1 + sub2 권한 갱신 (AsIs ds_main_onrowposchanged, xfdl:740) ──
  const loadRoleMapAndPerm = useCallback(async (roleId: string) => {
    try {
      const [rm, pm] = await Promise.all([
        apiSearchCmRoleMap(roleId),
        apiSearchCmPerm(roleId),
      ]);
      setRoleMapRows(
        (rm.ds_roleMap ?? []).map((r, i) => ({
          ...r,
          __rmId: `rm-${i}-${String(r.PERMISSION_ID ?? "")}-${String(r.OBJECT_ID ?? "")}`,
        })),
      );
      setPermRows(
        (pm.ds_perm ?? []).map((r, i) => ({
          ...r,
          __pmId: `pm-${i}-${String(r.PERMISSION_ID ?? "")}`,
        })),
      );
      setRoleMapSelectedKeys([]);
      setPermSelectedKeys([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "권한 조회 실패");
      setRoleMapRows([]);
      setPermRows([]);
    }
  }, []);

  // W5 F — csa 그룹 화면 진입 시 자동조회 (AsIs gfn_formOnLoad(obj,true) 등가).
  useEffect(() => {
    void loadList(DEFAULT_FILTERS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // selectedKey 변경 시 + (inserted ✗) 시 sub1/sub2 자동 갱신.
  useEffect(() => {
    if (!selectedKey || !selected) {
      setRoleMapRows([]);
      setPermRows([]);
      return;
    }
    if (selected.nativeeditor_status === "inserted") {
      setRoleMapRows([]);
      setPermRows([]);
      return;
    }
    const roleId = String(selected.ROLE_ID ?? "");
    if (roleId) {
      void loadRoleMapAndPerm(roleId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  /**
   * 행취소 (xfdl:736 fn_rowCancel = gfn_grdInit — 그리드 변경 전체 reset 이나, To-Be 는 선택 행만 취소).
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
        ) as Partial<CommRoleMngRow> | undefined;
        setRows((prev) => {
          const base = sourceRow ?? {};
          const newRow: CommRoleMngRow & GridRow = {
            ...emptyRow(),
            ...base,
            ROLE_ID: "",
            MENU_ID: "",
            ID: "",
            __gridTempId: addedRowKey,
            nativeeditor_status: "inserted" as RowStatus,
          };
          return [...prev, newRow];
        });
        setSelectedKey(addedRowKey);
      } else {
        setRows((prev) => {
          const newKeys = new Set(newData.map((r) => getRowKey(r as GridRow)));
          const removed = prev.filter((r) => !newKeys.has(getRowKey(r)));
          const kept = newData as (CommRoleMngRow & GridRow)[];
          const deleted = removed
            .filter((r) => r.nativeeditor_status !== "inserted")
            .map((r) => ({ ...r, nativeeditor_status: "deleted" as RowStatus }));
          return [...kept, ...deleted];
        });
      }
    },
    [],
  );

  /**
   * 셀 변경 (Detail 폼 → 양방향 bind).
   * AsIs ds_main_oncolumnchanged (xfdl:906~916): MENU_ID 또는 ID 변경 시 ROLE_ID = "role_"+MENU_ID+"_"+ID.
   */
  const handleCellChange = useCallback(
    (p: { rowKey: string | number; field: string; newValue: unknown }) => {
      setRows((prev) =>
        prev.map((r) => {
          if (getRowKey(r) !== String(p.rowKey)) return r;
          const fieldName = String(p.field);
          const updated: CommRoleMngRow & GridRow = {
            ...r,
            [fieldName]: p.newValue,
          };
          updated.nativeeditor_status =
            r.nativeeditor_status === "inserted" ? "inserted" : "updated";
          if (fieldName === "MENU_ID" || fieldName === "ID") {
            const mid = String(updated.MENU_ID ?? "");
            const id = String(updated.ID ?? "");
            if (mid && id) {
              updated.ROLE_ID = `role_${mid}_${id}`;
            }
          }
          return updated;
        }),
      );
    },
    [],
  );

  /**
   * B-003 저장 (fn_save / xfdl:648).
   */
  const handleSave = useCallback(async () => {
    if (!hasAnyChanges) {
      setError("저장할 데이터가 없습니다.");
      return;
    }
    for (const r of rows) {
      if (!r.nativeeditor_status) continue;
      if (r.nativeeditor_status === "deleted") continue;
      if (!r.ROLE_ID || String(r.ROLE_ID).trim().length === 0) {
        setError("ROLE_ID 는 필수 입력입니다. (메뉴 ID + ID 입력 시 자동 합성)");
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
        })) as unknown as CommRoleMngRow[];
      const res = await apiSaveCmRole(payload);
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
  }, [rows, hasAnyChanges, showMessage]);

  // ── shuttle ──

  /** BS-001 — 현재 권한 삭제 (xfdl:773 / fn_removeRoleMapRow / saveCmRoleMap action / btn_right 아래화살표). */
  const handleShuttleRemove = useCallback(async () => {
    if (roleMapSelectedKeys.length === 0) {
      setError("삭제할 권한을 선택하세요.");
      return;
    }
    const selKeySet = new Set(roleMapSelectedKeys.map((k) => String(k)));
    const checked = roleMapRows.filter((r) => selKeySet.has(r.__rmId));
    if (checked.length === 0) {
      setError("삭제할 권한을 선택하세요.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const payload = checked.map((r) => ({
        ROLE_ID: r.ROLE_ID,
        OBJECT_ID: r.OBJECT_ID,
        PERMISSION_ID: r.PERMISSION_ID,
        rowStatus: "deleted" as RowStatus,
      })) as unknown as CommRoleMngRoleMapRow[];
      const res = await apiSaveCmRoleMap(payload);
      showMessage({ message: `${res.cnt_merge ?? 0}건 저장되었습니다.` });
      if (selected) {
        await loadRoleMapAndPerm(String(selected.ROLE_ID ?? ""));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setIsSaving(false);
    }
  }, [roleMapRows, roleMapSelectedKeys, selected, loadRoleMapAndPerm, showMessage]);

  /**
   * BS-002 — 권한 추가 (round-3 fix / 인라인 grid 방식 / AsIs xfdl:782 fn_appendRoleMapRow 등가).
   *
   * <p>로직:
   * <ol>
   *   <li>V-001 — ROLE 미선택 시 차단</li>
   *   <li>V-002 — OBJECT 다중 선택 0 개 시 차단</li>
   *   <li>V-PERM — 권한 단일 선택 미선택 시 차단</li>
   *   <li>selected OBJECTs (N) × selected PERM (1) = N row 의 권한 매핑 INSERT
   *       (BE saveCmRoleMap 이 List<Map> 다중 row 지원 — 단일 호출로 일괄 처리)</li>
   *   <li>성공 시 sub1 + sub2 권한 그리드 재조회 (AsIs ds_main_onrowposchanged 등가)</li>
   * </ol>
   */
  const handleAddPerms = useCallback(async () => {
    if (!selected || !selected.ROLE_ID) {
      setError("V-001 역할을 선택하세요.");
      return;
    }
    if (objectSelectedKeys.length === 0) {
      setError("V-002 OBJECT 를 1개 이상 선택하세요.");
      return;
    }
    if (permSelectedKeys.length === 0) {
      setError("V-PERM 권한을 선택하세요.");
      return;
    }
    const objKeySet = new Set(objectSelectedKeys.map((k) => String(k)));
    const checkedObjs = objectRows.filter((r) => objKeySet.has(r.__olId));
    if (checkedObjs.length === 0) {
      setError("V-002 OBJECT 를 1개 이상 선택하세요.");
      return;
    }
    const permKeySet = new Set(permSelectedKeys.map((k) => String(k)));
    const checkedPerms = permRows.filter((r) => permKeySet.has(r.__pmId));
    if (checkedPerms.length === 0) {
      setError("V-PERM 권한을 선택하세요.");
      return;
    }
    // 단일 라디오 가정 — 첫 번째만 사용 (사용자 사양: single PERM).
    const selPerm = checkedPerms[0];
    setIsSaving(true);
    setError(null);
    try {
      // N OBJECT × 1 PERM = N row.
      const roleId = String(selected.ROLE_ID);
      const payload = checkedObjs.map((o) => ({
        ROLE_ID: roleId,
        OBJECT_ID: String(o.OBJECT_ID ?? ""),
        PERMISSION_ID: String(selPerm.PERMISSION_ID ?? ""),
        rowStatus: "inserted" as RowStatus,
      })) as unknown as CommRoleMngRoleMapRow[];
      const res = await apiSaveCmRoleMap(payload);
      showMessage({ message: `${res.cnt_merge ?? 0}건 저장되었습니다.` });
      await loadRoleMapAndPerm(roleId);
      setObjectSelectedKeys([]);
      setPermSelectedKeys([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setIsSaving(false);
    }
  }, [
    selected,
    objectRows,
    objectSelectedKeys,
    permRows,
    permSelectedKeys,
    loadRoleMapAndPerm,
    showMessage,
  ]);

  /** btn_permSearch — 전체 권한 조회 (xfdl:662 / fn_permSearch / searchCmPerm action). */
  const handlePermSearch = useCallback(() => {
    if (!selected || !selected.ROLE_ID) {
      setError("ROLE 을 먼저 선택하세요.");
      return;
    }
    void (async () => {
      try {
        const pm = await apiSearchCmPerm(String(selected.ROLE_ID));
        setPermRows(
          (pm.ds_perm ?? []).map((r, i) => ({
            ...r,
            __pmId: `pm-${i}-${String(r.PERMISSION_ID ?? "")}`,
          })),
        );
        setPermSelectedKeys([]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "권한 조회 실패");
      }
    })();
  }, [selected]);

  // ── Detail (D-NNN) ──
  const updateDetailField = (field: keyof CommRoleMngRow, value: string) => {
    if (!selected) return;
    handleCellChange({ rowKey: getRowKey(selected), field: String(field), newValue: value });
  };

  const isNewRow = selected?.nativeeditor_status === "inserted";

  return (
    <PageLayout
      title="역할 관리"
      breadcrumb="공통관리 > 시스템관리 > 역할 관리"
      objId="commRoleMng"
      // AsIs xfdl:283~289 commonTopButton basic 4: [btn_search], [btn_reset], [btn_save], [btn_close].
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
          label="역할 ID"
          value={filters.edt_ROLE_ID}
          onChange={(v) => handleFilterChange("edt_ROLE_ID", v)}
        />
        <SearchField
          label="역할명"
          value={filters.edt_ROLE_NM}
          onChange={(v) => handleFilterChange("edt_ROLE_NM", v)}
        />
        <SearchField
          label="사용 여부"
          type="select"
          options={USE_TP_SEARCH_OPTIONS}
          value={filters.cbo_USE_TP}
          onChange={(v) => handleFilterChange("cbo_USE_TP", v)}
        />
      </SearchArea>

      {/* AsIs 2x2 레이아웃: row 1 = main grid + detail / row 2 = sub1 + sub2 (좌 OBJECT + 우 PERM).
          NOTE: shared `.page-layout .content-body--column { flex-direction: column }` 가 portal shell 에서
                무력화 → 외곽 column stacker div 명시. */}
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
        {/* ── Row 1: 역할 목록 (좌) + 상세 (우) ── */}
        <div
          style={{
            display: "flex",
            flex: "1 1 0",
            flexDirection: "row",
            gap: 6,
            minHeight: 0,
          }}
        >
          <ContentPanel>
            <GridPanel
              title="역할 목록"
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
              columns={ROLE_COLUMNS}
              selectedRowKey={selectedKey}
              onDataChange={handleDataChange}
              loading={isSaving}
            >
              <AgDataGrid
                columnSizing="fit"
                columns={ROLE_COLUMNS}
                data={rows}
                rowKey="__rowId"
                sortable
                highlightedRowKey={selectedKey}
                onRowClick={(row) => setSelectedKey(getRowKey(row as GridRow))}
                loading={isSearching}
                loadingMessage="조회 중..."
                emptyMessage="조회된 역할이 없습니다."
              />
            </GridPanel>
          </ContentPanel>

          <ContentPanel width={480}>
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
                      <tr>
                        <th style={DETAIL_LABEL_CELL}>역할 ID *</th>
                        <td style={DETAIL_VALUE_CELL}>
                          <Input
                            value={String(selected.ROLE_ID ?? "")}
                            maxLength={100}
                            readOnly={selected.nativeeditor_status !== "inserted"}
                            onChange={(v: string) => updateDetailField("ROLE_ID", v)}
                          />
                        </td>
                      </tr>

                      <tr>
                        <th style={DETAIL_LABEL_CELL}>메뉴 ID *</th>
                        <td style={DETAIL_VALUE_CELL}>
                          <ComboBox
                            data={menuLov as unknown as Record<string, unknown>[]}
                            valueField="MENU_ID"
                            labelField="MENU_ID_NM"
                            value={String(selected.MENU_ID ?? "")}
                            onChange={(v) => updateDetailField("MENU_ID", v)}
                            readOnly={!isNewRow}
                            disabled={!isNewRow}
                            placeholder="(선택)"
                          />
                        </td>
                      </tr>

                      <tr>
                        <th style={DETAIL_LABEL_CELL}>ID *</th>
                        <td style={DETAIL_VALUE_CELL}>
                          <Input
                            value={String(selected.ID ?? "")}
                            maxLength={100}
                            readOnly={!isNewRow}
                            onChange={(v) => updateDetailField("ID", v)}
                          />
                        </td>
                      </tr>

                      <tr>
                        <th style={DETAIL_LABEL_CELL}>역할명</th>
                        <td style={DETAIL_VALUE_CELL}>
                          <Input
                            value={String(selected.ROLE_NM ?? "")}
                            maxLength={100}
                            onChange={(v) => updateDetailField("ROLE_NM", v)}
                          />
                        </td>
                      </tr>

                      <tr>
                        <th style={DETAIL_LABEL_CELL}>역할 설명</th>
                        <td style={DETAIL_VALUE_CELL}>
                          <Input
                            value={String(selected.ROLE_DESC ?? "")}
                            maxLength={100}
                            onChange={(v) => updateDetailField("ROLE_DESC", v)}
                          />
                        </td>
                      </tr>

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

                      <tr>
                        <th style={DETAIL_LABEL_CELL}>유효 개시일</th>
                        <td style={DETAIL_VALUE_CELL}>
                          <DatePicker
                            value={toDateInputValue(selected.START_ACTIVE_DATE)}
                            onChange={(iso) => updateDetailField("START_ACTIVE_DATE", fromDateInputValue(iso))}
                          />
                        </td>
                      </tr>

                      <tr>
                        <th style={DETAIL_LABEL_CELL}>유효 기한일</th>
                        <td style={DETAIL_VALUE_CELL}>
                          <DatePicker
                            value={toDateInputValue(selected.END_ACTIVE_DATE)}
                            onChange={(iso) => updateDetailField("END_ACTIVE_DATE", fromDateInputValue(iso))}
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
                  역할을 선택하거나 행을 추가하세요.
                </div>
              </div>
            )}
          </ContentPanel>
        </div>

        {/* ── Row 2: 현재 버튼 권한 (sub1) | OBJECT 그리드 (sub2 좌) | 권한 그리드 (sub2 우) ── */}
        <div
          style={{
            display: "flex",
            flex: "1 1 0",
            flexDirection: "row",
            gap: 6,
            minHeight: 0,
          }}
        >
          {/* sub1 — 현재 버튼 권한 (AsIs div_subGrd1). */}
          <ContentPanel>
            <GridPanel
              title="현재 버튼 권한"
              count={filteredRoleMapRows.length}
              buttons={[
                {
                  id: "btn_shuttle_remove",
                  label: "▼ 권한 삭제",
                  onClick: () => void handleShuttleRemove(),
                  disabled: isSearching || isSaving,
                },
              ]}
              data={filteredRoleMapRows}
              rowKey="__rmId"
              columns={ROLE_MAP_COLUMNS}
            >
              <div style={{ display: "flex", gap: 8, padding: 4, alignItems: "center", justifyContent: "flex-end" }}>
                <span style={{ fontSize: 12, color: "#555" }}>Perm</span>
                <div style={{ width: 160 }}>
                  <Input
                    value={roleMapFilter}
                    onChange={(v) => setRoleMapFilter(v)}
                    placeholder="PERMISSION_ID 필터"
                  />
                </div>
              </div>
              <AgDataGrid
                columnSizing="fit"
                columns={ROLE_MAP_COLUMNS}
                data={filteredRoleMapRows}
                rowKey="__rmId"
                selectable
                multiSelect
                sortable={false}
                onRowSelect={(ids) => setRoleMapSelectedKeys(ids)}
                emptyMessage="현재 권한이 없습니다."
              />
            </GridPanel>
          </ContentPanel>

          {/* sub2 좌 — OBJECT 그리드 (round-3 fix / 인라인 grid 방식 / 2026-06-03 — 이미 부여된 OBJECT 제외).
              panel header 우측 FILTER 라벨 + input (OBJECT_ID + OBJECT_NM 부분 일치 UPPER LIKE).
              다중 체크박스 selectable+multiSelect=true. */}
          <ContentPanel>
            <div style={{ display: "flex", gap: 8, padding: "4px 8px", alignItems: "center", background: "#f4f6f8", borderBottom: "1px solid #d4dae0", flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: "#333", fontWeight: 600 }}>FILTER</span>
              <div style={{ flex: 1, maxWidth: 280 }}>
                <Input
                  value={objectFilter}
                  onChange={(v) => setObjectFilter(v)}
                  placeholder="OBJECT_ID / OBJECT명"
                />
              </div>
            </div>
            <GridPanel
              title="OBJECT 목록"
              count={filteredObjectRows.length}
              data={filteredObjectRows}
              rowKey="__olId"
              columns={OBJECT_COLUMNS}
            >
              <AgDataGrid
                columnSizing="fit"
                columns={OBJECT_COLUMNS}
                data={filteredObjectRows}
                rowKey="__olId"
                selectable
                multiSelect
                sortable
                onRowSelect={(ids) => setObjectSelectedKeys(ids)}
                loading={objectLoading}
                loadingMessage="조회 중..."
                emptyMessage="OBJECT 가 없습니다."
              />
            </GridPanel>
          </ContentPanel>

          {/* sub2 우 — 전체 권한 후보 그리드 (AsIs div_subGrd2 / round-3 fix: 단일 라디오 /
              2026-06-03 — NOT EXISTS 분기 제거로 모든 권한 항상 표시).
              panel header 우측 FILTER 라벨 + input (PERMISSION_ID + PERMISSION_NM 부분 일치 UPPER LIKE). */}
          <ContentPanel>
            <div style={{ display: "flex", gap: 8, padding: "4px 8px", alignItems: "center", background: "#f4f6f8", borderBottom: "1px solid #d4dae0", flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: "#333", fontWeight: 600 }}>FILTER</span>
              <div style={{ flex: 1, maxWidth: 280 }}>
                <Input
                  value={permFilter}
                  onChange={(v) => setPermFilter(v)}
                  placeholder="PERMISSION_ID / PERMISSION명"
                />
              </div>
            </div>
            <GridPanel
              title="전체 버튼 권한"
              count={filteredPermRows.length}
              buttons={[
                {
                  id: "btn_permSearch",
                  label: "권한 조회",
                  onClick: handlePermSearch,
                  disabled: isSearching || isSaving,
                },
                {
                  id: "btn_addPerms",
                  label: "권한 추가",
                  onClick: () => void handleAddPerms(),
                  disabled: isSearching || isSaving,
                },
              ]}
              data={filteredPermRows}
              rowKey="__pmId"
              columns={PERM_COLUMNS}
            >
              <AgDataGrid
                columnSizing="fit"
                columns={PERM_COLUMNS}
                data={filteredPermRows}
                rowKey="__pmId"
                selectable
                multiSelect={false}
                sortable={false}
                onRowSelect={(ids) => setPermSelectedKeys(ids)}
                emptyMessage="조회된 권한이 없습니다."
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
