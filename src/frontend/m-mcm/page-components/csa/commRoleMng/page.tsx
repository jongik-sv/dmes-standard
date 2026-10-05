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
import { MdmFieldLabel } from "@dk-oasis/shared/mdm-meta";
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
 * 권한 저장 결과 메시지.
 *
 * <p>2026-09-04 fix — BE 는 중복 PK / PK 누락 / 미지원 status 를 log.warn 후 조용히 건너뛰고
 * `meta.success=true` 로 응답한다. 그래서 버튼을 눌러도 아무 일이 없는데 화면에는
 * "0건 저장되었습니다" 만 떴다. 건너뛴 행 수(cnt_skip)를 함께 알린다.
 */
function saveResultMessage(cntMerge: number, cntSkip: number): string {
  if (cntSkip > 0) {
    return `${cntMerge}건 저장되었습니다. (${cntSkip}건은 이미 부여됐거나 대상이 없어 처리되지 않았습니다)`;
  }
  return `${cntMerge}건 저장되었습니다.`;
}

/**
 * 저장된 MENU_ID 를 LoV 라벨("csa (시스템관리)") 로 치환. LoV 에 없으면 원본 코드를 그대로 보여준다.
 * (미지정이면 "" — 상세 영역에서 placeholder "(미지정)" 로 표기)
 */
function menuIdLabel(menuId: string, lov: MenuIdLov[]): string {
  if (!menuId) return "";
  const hit = lov.find((m) => String(m.MENU_ID ?? "") === menuId);
  return String(hit?.MENU_ID_NM ?? menuId);
}

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

  /** sub2 우에서 현재 선택된 PERMISSION_ID (단일 선택 — 미선택이면 ""). */
  const selectedPermId = useMemo(() => {
    if (permSelectedKeys.length === 0) return "";
    const keySet = new Set(permSelectedKeys.map((k) => String(k)));
    const hit = permRows.find((r) => keySet.has(r.__pmId));
    return hit ? String(hit.PERMISSION_ID ?? "") : "";
  }, [permRows, permSelectedKeys]);

  /**
   * sub2 좌 — OBJECT 목록 필터.
   *
   * <p>2 단계 필터:
   * <ol>
   *   <li><b>이미 부여된 조합 제외</b> — 권한 매핑의 PK 는 (ROLE_ID, OBJECT_ID, PERMISSION_ID) 이므로
   *       "선택된 PERMISSION 기준으로" 이미 부여된 OBJECT 만 제외한다. 권한 미선택 시엔 제외하지 않는다.</li>
   *   <li><b>OBJECT FILTER UPPER LIKE</b> — OBJECT_ID + OBJECT_NM 양쪽 부분 일치.</li>
   * </ol>
   *
   * <p>2026-09-04 fix — 이전 구현은 PERMISSION 과 무관하게 "sub1 에 한 번이라도 등장한 OBJECT" 를
   * 전부 숨겼다. 그 결과 모든 OBJECT 에 권한이 하나씩 부여된 역할(예: SYSADMIN)에서는 OBJECT 목록이
   * 0 건이 되어 두 번째 PERMISSION 을 부여할 방법 자체가 사라졌다.
   */
  const filteredObjectRows = useMemo(() => {
    const kw = objectFilter.trim().toUpperCase();
    // 1) 선택된 PERMISSION 에 대해 이미 부여된 OBJECT_ID 집합
    const grantedObjIds = new Set(
      roleMapRows
        .filter((r) => String(r.PERMISSION_ID ?? "") === selectedPermId)
        .map((r) => String(r.OBJECT_ID ?? "").toUpperCase()),
    );
    return objectRows.filter((r) => {
      const id = String(r.OBJECT_ID ?? "").toUpperCase();
      if (selectedPermId && grantedObjIds.has(id)) return false; // 동일 권한 이미 부여 — 제외
      if (!kw) return true;
      const nm = String(r.OBJECT_NM ?? "").toUpperCase();
      return id.includes(kw) || nm.includes(kw);
    });
  }, [objectRows, objectFilter, roleMapRows, selectedPermId]);

  /**
   * 목록에서 사라진 OBJECT 의 체크 상태 정리 —
   * 권한을 바꿔 선택하면 표시 대상이 달라지므로, 보이지 않는 행이 선택된 채 남지 않게 한다.
   */
  useEffect(() => {
    const visible = new Set(filteredObjectRows.map((r) => r.__olId));
    setObjectSelectedKeys((prev) => {
      const next = prev.filter((k) => visible.has(String(k)));
      return next.length === prev.length ? prev : next;
    });
  }, [filteredObjectRows]);

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
    async (
      f: CommRoleMngFilters,
      opts?: { preferRoleId?: string; silent?: boolean },
    ) => {
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
          // 2026-09-04 fix — 재조회할 때마다 무조건 첫 행으로 튀지 않게, 보고 있던 역할이
          // 결과에 남아 있으면 그 행을 유지한다 (없을 때만 첫 행).
          const prefer = opts?.preferRoleId
            ? list.find((r) => String(r.ROLE_ID ?? "") === opts.preferRoleId)
            : undefined;
          setSelectedKey(getRowKey(prefer ?? list[0]));
        } else {
          setSelectedKey(null);
          setRoleMapRows([]);
          setPermRows([]);
        }
        if (!opts?.silent) {
          showMessage({ message: `${list.length}건 조회 되었습니다.`, toast: true });
        }
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

  const handleSearch = () =>
    void loadList(filters, { preferRoleId: String(selected?.ROLE_ID ?? "") || undefined });

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

  /**
   * sub1/sub2 갱신 트리거 — 선택된 "저장된" 역할의 ROLE_ID.
   * 신규(inserted) 행은 아직 DB 에 없으므로 권한 조회 대상이 아니다.
   *
   * 2026-09-04 fix — 트리거를 selectedKey 가 아닌 ROLE_ID 로 바꿨다.
   * 저장 후 목록이 재조회되면 행 key(__rowId)가 바뀌는데, 이전 구현은 selectedKey 만 보고 있어
   * 같은 역할을 계속 선택 중인데도 권한 그리드가 갱신되지 않았다.
   */
  const selectedRoleId =
    selected && selected.nativeeditor_status !== "inserted"
      ? String(selected.ROLE_ID ?? "")
      : "";

  useEffect(() => {
    if (!selectedRoleId) {
      setRoleMapRows([]);
      setPermRows([]);
      setRoleMapSelectedKeys([]);
      setPermSelectedKeys([]);
      setObjectSelectedKeys([]);
      return;
    }
    void loadRoleMapAndPerm(selectedRoleId);
  }, [selectedRoleId, loadRoleMapAndPerm]);

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
          // 2026-09-04 fix — GridPanel.createEmptyRow 는 columns 전 컬럼을 ""(빈 문자열)로 채워 넘긴다.
          // 그대로 spread 하면 emptyRow() 의 기본값(USE_TP='Y' / 유효개시일=오늘 / 유효기한일=9999-12-31)이
          // 빈 문자열로 덮여 사라진다 (행추가 직후 사용여부·유효일자가 비어 보이던 원인).
          // → 빈 값만 기본값으로 되메운다. 행복사(원본 값 보유)는 그대로 보존된다.
          const base = (sourceRow ?? {}) as Record<string, unknown>;
          const merged: Record<string, unknown> = { ...emptyRow() };
          for (const [k, v] of Object.entries(base)) {
            if (v !== "" && v !== null && v !== undefined) merged[k] = v;
          }
          const newRow: CommRoleMngRow & GridRow = {
            ...(merged as CommRoleMngRow),
            // ROLE_ID / ID 는 신규·복사 모두 비운다 — 메뉴 ID + ID 입력 시 ROLE_ID 자동 합성.
            // (메뉴 ID 는 복사 시 원본 폴더를 유지)
            ROLE_ID: "",
            ID: "",
            // AgDataGrid rowKey="__rowId" — 신규 행이 ""(전 행 중복 key)이 되지 않도록 tempId 로 채운다.
            __rowId: addedRowKey,
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
      // V-006 Essential — 신규 행은 메뉴 ID + ID 가 모두 있어야 ROLE_ID 가 합성된다.
      // (2026-09-04 fix — 검증이 없어 메뉴 ID 없이 임의 ROLE_ID 로 저장되던 결함)
      if (r.nativeeditor_status === "inserted") {
        if (!String(r.MENU_ID ?? "").trim()) {
          setError("메뉴 ID 는 필수 입력입니다.");
          return;
        }
        if (!String(r.ID ?? "").trim()) {
          setError("ID 는 필수 입력입니다.");
          return;
        }
      }
      if (!r.ROLE_ID || String(r.ROLE_ID).trim().length === 0) {
        setError("역할 ID 가 생성되지 않았습니다. 메뉴 ID 와 ID 를 입력하세요.");
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
      const keepRoleId = String(selected?.ROLE_ID ?? "");
      const res = await apiSaveCmRole(payload);
      showMessage({ message: `${res.cnt_merge ?? 0}건 저장되었습니다.` });
      // 2026-09-04 fix — 응답의 ds_main 은 BE 가 findAll() 로 만든 무조건 전체·무정렬 목록이라
      // 조건 조회 후 저장하면 갑자기 전체가 임의 순서로 뜬다. 현재 검색조건으로 다시 조회하고,
      // 방금 저장한 역할의 선택을 유지한다 (이어서 버튼 권한을 부여하는 것이 실제 동선).
      await loadList(filters, { preferRoleId: keepRoleId || undefined, silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패 하였습니다.");
    } finally {
      setIsSaving(false);
    }
  }, [rows, hasAnyChanges, selected, filters, loadList, showMessage]);

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
      showMessage({ message: saveResultMessage(res.cnt_merge ?? 0, res.cnt_skip ?? 0) });
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
      showMessage({ message: saveResultMessage(res.cnt_merge ?? 0, res.cnt_skip ?? 0) });
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
              // 2026-09-04 fix — 상세 영역이 row 높이를 넘어가면 하단 필드(유효 기한일)가 잘려
              // 접근 자체가 불가능했다. wrapper 를 패널 높이에 고정하고 본문만 스크롤시킨다.
              <div style={{
                marginTop: 32,
                display: "flex",
                flexDirection: "column",
                border: "1px solid #d4dae0",
                background: "#fff",
                height: "calc(100% - 32px)",
                minHeight: 0,
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
                <div style={{ padding: 0, background: "#fff", flex: "1 1 0", minHeight: 0, overflowY: "auto" }}>
                  <table style={DETAIL_TABLE_STYLE}>
                    <tbody>
                      <tr>
                        <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="ROLE_ID" label="역할 ID" required /></th>
                        <td style={DETAIL_VALUE_CELL}>
                          {/* AsIs xfdl:243 readonly="true" — ROLE_ID 는 항상 자동 합성값.
                              2026-09-04 fix: 신규 행에서 직접 입력이 열려 있어 메뉴 ID 없이
                              임의 ROLE_ID 가 만들어지던 결함(합성 규칙 무력화)을 차단. */}
                          <Input
                            value={String(selected.ROLE_ID ?? "")}
                            maxLength={100}
                            readOnly
                            placeholder="메뉴 ID + ID 입력 시 자동 생성"
                          />
                        </td>
                      </tr>

                      <tr>
                        <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="MENU_ID" label="메뉴 ID" required /></th>
                        <td style={DETAIL_VALUE_CELL}>
                          {isNewRow ? (
                            /* 메뉴 ID = 메뉴 폴더(csa/cma/...). 선택 즉시 ID 와 합쳐져
                               ROLE_ID = "role_{메뉴ID}_{ID}" 로 자동 생성된다. */
                            <ComboBox
                              data={menuLov as unknown as Record<string, unknown>[]}
                              valueField="MENU_ID"
                              labelField="MENU_ID_NM"
                              value={String(selected.MENU_ID ?? "")}
                              onChange={(v) => updateDetailField("MENU_ID", v)}
                              placeholder="(선택)"
                            />
                          ) : (
                            /* 기존 행의 메뉴 ID 는 ROLE_ID(PK) 구성요소라 변경 불가.
                               빈 콤보로 보여 "선택이 안 된 것" 처럼 오해되던 것을 읽기전용 표기로 바꿈. */
                            <Input
                              value={menuIdLabel(String(selected.MENU_ID ?? ""), menuLov)}
                              readOnly
                              placeholder="(미지정 — 기존 역할은 변경 불가)"
                            />
                          )}
                        </td>
                      </tr>

                      <tr>
                        <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="ID" meta={false} label="ID" required /></th>
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
                        <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="ROLE_NM" label="역할명" /></th>
                        <td style={DETAIL_VALUE_CELL}>
                          <Input
                            value={String(selected.ROLE_NM ?? "")}
                            maxLength={100}
                            onChange={(v) => updateDetailField("ROLE_NM", v)}
                          />
                        </td>
                      </tr>

                      <tr>
                        <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="ROLE_DESC" label="역할 설명" /></th>
                        <td style={DETAIL_VALUE_CELL}>
                          <Input
                            value={String(selected.ROLE_DESC ?? "")}
                            maxLength={100}
                            onChange={(v) => updateDetailField("ROLE_DESC", v)}
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
                            onChange={(v) => updateDetailField("USE_TP", v)}
                          />
                        </td>
                      </tr>

                      <tr>
                        <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="START_ACTIVE_DATE" label="유효 개시일" /></th>
                        <td style={DETAIL_VALUE_CELL}>
                          <DatePicker
                            value={toDateInputValue(selected.START_ACTIVE_DATE)}
                            onChange={(iso) => updateDetailField("START_ACTIVE_DATE", fromDateInputValue(iso))}
                          />
                        </td>
                      </tr>

                      <tr>
                        <th style={DETAIL_LABEL_CELL}><MdmFieldLabel name="END_ACTIVE_DATE" label="유효 기한일" /></th>
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
              title="이 역할의 버튼 권한"
              count={filteredRoleMapRows.length}
              buttons={[
                {
                  id: "btn_shuttle_remove",
                  // 2026-09-04 fix — 이 패널(좌)에서 후보 풀(우)로 되돌리는 동작이라 ▼ 가 아니라 ▶.
                  label: "권한 삭제 ▶",
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
              {/* 목록에서 제외되는 기준(선택 권한)을 화면에 드러낸다 — 왜 특정 OBJECT 가 안 보이는지 알 수 있게. */}
              <span style={{ fontSize: 11, color: selectedPermId ? "#1a5fb4" : "#888", whiteSpace: "nowrap" }}>
                {selectedPermId ? `선택 권한: ${selectedPermId} (부여됨 제외)` : "권한 미선택"}
              </span>
            </div>
            <GridPanel
              title="② 대상 화면(OBJECT) 선택"
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
              title="① 부여할 권한 선택"
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
