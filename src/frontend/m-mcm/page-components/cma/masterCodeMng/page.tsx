"use client";

/**
 * masterCodeMng 화면 — Master Code 관리 (As-Is MasterCodeMng.xfdl).
 *
 * 인용 정본:
 *   - 분석리포트 §3 (UI 컴포넌트), §4 (이벤트), §6 (SQL), §8 (BPMN)
 *   - 기능설계서 §3 (조회 + 그리드), §5 (버튼), §6 (validation), §10 (메시지)
 *   - 디자인설계서 §2 (레이아웃), §4 (그리드 컬럼)
 *   - BPMN설계서 §1.1 (API), §2 (action 흐름)
 *
 * 페이지 유형: D 다중 그리드 (Master G + Detail GE 좌우 분할).
 * 호출: POST /api/mcm/oasis/masterCodeMng/{action} (OASIS only — mcm 모듈 SqlSession 미등록).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  PageLayout,
  SearchArea,
  SearchField,
  ContentBody,
  ContentPanel,
  ErrorModal,
  canDoButton,
  useUserButtonRbac,
  type SearchTrigger,
} from "@dk-oasis/shared/layout";
import { GridPanel, AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { useCarryRestored, useCarryState } from "@dk-oasis/shared/portal-shell";
import { searchMaster, searchDetail, saveMaster, saveDetail } from "./api";
import { decideAreaSearch } from "./area-search";
import {
  MasterCodeUploadFilePopupDialog,
  OBJ_ID as UPLOAD_POPUP_OBJ_ID,
} from "../../cmz/masterCodeUploadFilePopup";
import type {
  CategoryLov,
  DetailRefLov,
  DetailRow,
  MasterCodeFilters,
  MasterLov,
  MasterRow,
  RowStatus,
} from "./types";

interface GridRow {
  __gridTempId?: string;
  nativeeditor_status?: RowStatus;
}

function getMasterRowId(row: MasterRow & GridRow): string {
  return row.__gridTempId || String(row.CODE_ID ?? "");
}

function getDetailRowId(row: DetailRow & GridRow): string {
  return (
    (row as { __rowId?: string }).__rowId ||
    row.__gridTempId ||
    `${String(row.MASTER_CODE ?? "")}|${String(row.CATEGORY_ID ?? "")}|${String(row.CODE_VAL ?? "")}`
  );
}

/** detailRow 에 합성 __rowId 부여 — AgDataGrid rowKey 가 단일 컬럼만 지원 + 신규 row CODE_VAL="" 충돌 회피. */
function withDetailSyntheticId<T extends Partial<DetailRow>>(r: T, idx: number): T & { __rowId: string } {
  return {
    ...r,
    __rowId: `r-${idx}-${String(r.MASTER_CODE ?? "")}|${String(r.CATEGORY_ID ?? "")}|${String(r.CODE_VAL ?? "")}`,
  };
}

function stripInternal<T extends GridRow>(row: T): Record<string, unknown> {
  const { __gridTempId: _t, nativeeditor_status: _s, ...rest } = row as Record<string, unknown>;
  return rest;
}

const DEFAULT_FILTERS: MasterCodeFilters = { pCodeId: "", pCodeNm: "" };

const USE_TP_OPTIONS = ["Y", "N"];

/**
 * 이 화면의 페이지 OBJECT_ID. PageLayout 의 objId 와 조회 핸들러 RBAC 판정이 **같은 값**을 봐야 하므로
 * 문자열을 두 곳에 흩뿌리지 않고 상수 하나로 묶는다(한쪽만 고쳐 갈리는 사고 방지).
 */
const PAGE_OBJ_ID = "masterCodeMng";

/**
 * Master 그리드 컬럼 — 분석 §3.3 G-001~G-011 / 디자인 §4.1.
 * 컬럼 순서/너비/편집조건 As-Is 1:1 보존. 신규 행만 CODE_ID 편집 (rowType==2 분기).
 */
function buildMasterColumns(masterLov: MasterLov[]): GridColumn[] {
  const masterCodes = masterLov.map((m) => String(m.CODE_ID));
  return [
    {
      key: "CODE_ID",
      header: "코드ID *",
      width: 200,
      editable: (r: Record<string, unknown>) => (r as GridRow).nativeeditor_status === "inserted",
    },
    { key: "CODE_NM", header: "코드명 *", width: 200, editable: true },
    { key: "MASTER_CODE", header: "마스터코드", width: 200, editable: true },
    { key: "CODE_DESC", header: "설명", width: 200, editable: true, hideable: true },
    {
      key: "MASTER_CODE_REF1",
      header: "참조1",
      width: 150,
      editable: true,
      cellEditor: "select",
      cellEditorValues: ["", ...masterCodes],
    },
    {
      key: "MASTER_CODE_REF2",
      header: "참조2",
      width: 150,
      editable: true,
      cellEditor: "select",
      cellEditorValues: ["", ...masterCodes],
    },
    {
      key: "MASTER_CODE_REF3",
      header: "참조3",
      width: 150,
      editable: true,
      cellEditor: "select",
      cellEditorValues: ["", ...masterCodes],
    },
    {
      key: "MASTER_CODE_REF4",
      header: "참조4",
      width: 150,
      editable: true,
      cellEditor: "select",
      cellEditorValues: ["", ...masterCodes],
    },
    {
      key: "MASTER_CODE_REF5",
      header: "참조5",
      width: 150,
      editable: true,
      cellEditor: "select",
      cellEditorValues: ["", ...masterCodes],
    },
    {
      key: "USE_TP",
      header: "사용여부 *",
      width: 100,
      editable: true,
      cellEditor: "select",
      cellEditorValues: USE_TP_OPTIONS,
      align: "center",
    },
  ];
}

/**
 * Detail 그리드 컬럼 — 분석 §3.4 GE-001~GE-014 / 디자인 §4.2.
 * Ref1~5 는 동적 — MASTER_CODE_REF == "USER_DEFINE" 이면 text 자유 입력 / 그 외 combo.
 * To-Be 정정: As-Is `"nomal"` (xfdl:829 오타) → `"normal"` (분석 §10.1 ST-006 / §12).
 */
function buildDetailColumns(
  categoryLov: CategoryLov[],
  refLovs: { ref1: DetailRefLov[]; ref2: DetailRefLov[]; ref3: DetailRefLov[]; ref4: DetailRefLov[]; ref5: DetailRefLov[] },
  selectedMaster: MasterRow | null,
  onChkToggle: (row: Record<string, unknown>) => void,
): GridColumn[] {
  const categoryIds = categoryLov.map((c) => String(c.CATEGORY_ID));
  const buildRefCombo = (
    refKey: keyof Pick<MasterRow, "MASTER_CODE_REF1" | "MASTER_CODE_REF2" | "MASTER_CODE_REF3" | "MASTER_CODE_REF4" | "MASTER_CODE_REF5">,
    refLov: DetailRefLov[]
  ): Pick<GridColumn, "editable" | "cellEditor" | "cellEditorValues"> => {
    // MASTER_CODE_REF == "USER_DEFINE" → 자유 텍스트 / 그 외 → combo
    const masterRefVal = selectedMaster?.[refKey];
    if (masterRefVal === "USER_DEFINE") {
      return { editable: true };
    }
    return {
      editable: true,
      cellEditor: "select",
      cellEditorValues: ["", ...refLov.map((r) => String(r.CODE_VAL))],
    };
  };

  return [
    {
      key: "CHK",
      header: "선택",
      meta: false,
      width: 50,
      editable: false,
      align: "center",
      // GE-001 — As-Is displaytype=checkboxcontrol / edittype=checkbox (디자인설계서 §4.2).
      // 클릭 시 row 의 CHK 값을 1↔0 토글 (page.tsx 의 onChkToggle callback).
      render: (val, row) => (
        <input
          type="checkbox"
          checked={String(val ?? "") === "1"}
          onChange={() => onChkToggle(row)}
        />
      ),
    },
    {
      key: "STATUS",
      header: "상태",
      meta: false,
      width: 50,
      editable: false,
      align: "center",
      // GE-003 — 행 상태 아이콘 (디자인설계서 §4.2 / 분석 §3.4).
      // nativeeditor_status: inserted → ＋ / deleted → － / updated → ✏ / "" → 빈칸.
      render: (_v, row) => {
        const status = (row as GridRow).nativeeditor_status;
        if (status === "inserted") return <span title="신규" style={{ color: "#2e7d32", fontWeight: 700 }}>＋</span>;
        if (status === "deleted") return <span title="삭제" style={{ color: "#c62828", fontWeight: 700 }}>－</span>;
        if (status === "updated") return <span title="변경" style={{ color: "#1565c0", fontWeight: 700 }}>✏</span>;
        return null;
      },
    },
    {
      key: "CODE_VAL",
      header: "코드 값 *",
      meta: "CD_V",
      width: 100,
      editable: (r: Record<string, unknown>) => (r as GridRow).nativeeditor_status === "inserted",
    },
    { key: "CODE_VAL_MEAN", header: "코드 의미 *", width: 250, editable: true },
    {
      key: "CATEGORY_ID",
      header: "카테고리ID *",
      width: 100,
      editable: false,
    },
    { key: "CATEGORY_NM", header: "카테고리명", width: 120, editable: false },
    { key: "SORT_SEQ", header: "정렬순서", width: 90, editable: true, type: "number", align: "right" },
    { key: "CODE_VAL_DESC", header: "설명", width: 180, editable: true, hideable: true },
    { key: "CODE_VAL_REF1", header: "참조1", width: 100, ...buildRefCombo("MASTER_CODE_REF1", refLovs.ref1) },
    { key: "CODE_VAL_REF2", header: "참조2", width: 100, ...buildRefCombo("MASTER_CODE_REF2", refLovs.ref2) },
    { key: "CODE_VAL_REF3", header: "참조3", width: 100, ...buildRefCombo("MASTER_CODE_REF3", refLovs.ref3) },
    { key: "CODE_VAL_REF4", header: "참조4", width: 100, ...buildRefCombo("MASTER_CODE_REF4", refLovs.ref4) },
    { key: "CODE_VAL_REF5", header: "참조5", width: 100, ...buildRefCombo("MASTER_CODE_REF5", refLovs.ref5) },
  ];
}

export default function MasterCodeMngPage() {
  const { showMessage } = useMessage();
  // 조회 핸들러·팝업 오픈 버튼의 RBAC 판정용 — 툴바 버튼은 PageLayout 이 자기 안에서 같은 훅으로
  //   판정하지만, 툴바를 거치지 않는 경로(조회조건 Enter, GridPanel 버튼)는 여기서 직접 판정해야 한다.
  //   (훅은 globalThis 단일 store 캐시라 PageLayout 과 같이 써도 fetch 는 1회다.)
  const rbac = useUserButtonRbac(true);

  // 새 창으로 분리할 때 이어받는 상태(useCarryState) — 조회 조건·Master 선택 키는 가볍게, Master 조회 결과(행·전체 코드 LOV)는 bulky.
  // Detail 행·카테고리 LOV·카테고리 선택은 이어받지 않는다 — 이어받은 Master 선택이 있으면 새 창이 상세를 한 번 다시 조회해 채운다.
  const [filters, setFilters] = useCarryState<MasterCodeFilters>("filters", DEFAULT_FILTERS);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [masterRows, setMasterRows] = useCarryState<(MasterRow & GridRow)[]>("masterRows", [], { bulky: true });
  // 전체 코드 LOV 는 Master 조회 응답에 실려 오고 행 없이는 다시 채워지지 않아(자동 조회를 건너뛴다) 행과 함께 옮긴다.
  const [masterLov, setMasterLov] = useCarryState<MasterLov[]>("masterLov", [], { bulky: true });
  const [selectedMasterKey, setSelectedMasterKey] = useCarryState<string | null>("selectedMasterKey", null);
  const restored = useCarryRestored();

  const [detailRows, setDetailRows] = useState<(DetailRow & GridRow)[]>([]);
  // 상세 행(detailRows)을 이어받지 않으므로 상세 선택 키도 이어받지 않는다(키만 남으면 없는 행을 가리킨다).
  const [selectedDetailKey, setSelectedDetailKey] = useState<string | null>(null);
  const [categoryLov, setCategoryLov] = useState<CategoryLov[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [refLovs, setRefLovs] = useState<{
    ref1: DetailRefLov[];
    ref2: DetailRefLov[];
    ref3: DetailRefLov[];
    ref4: DetailRefLov[];
    ref5: DetailRefLov[];
  }>({ ref1: [], ref2: [], ref3: [], ref4: [], ref5: [] });

  const selectedMaster = useMemo<MasterRow | null>(() => {
    if (!selectedMasterKey) return null;
    return masterRows.find((r) => getMasterRowId(r) === selectedMasterKey) ?? null;
  }, [masterRows, selectedMasterKey]);

  const effectiveMasterCode = useMemo(() => {
    if (!selectedMaster) return "";
    return String(selectedMaster.MASTER_CODE ?? selectedMaster.CODE_ID ?? "");
  }, [selectedMaster]);

  const effectiveMasterCodeRef = useRef("");
  useEffect(() => {
    effectiveMasterCodeRef.current = effectiveMasterCode;
  }, [effectiveMasterCode]);

  // ── load ──
  /** action=search 호출 (fn_search, xfdl:330). */
  const loadMaster = useCallback(
    async (f: MasterCodeFilters) => {
      setIsSearching(true);
      setError(null);
      try {
        const payload = await searchMaster(f);
        const rows = (payload.ds_GetCodeMasterList ?? []).map((r) => ({
          ...r,
          nativeeditor_status: "" as RowStatus,
        }));
        setMasterRows(rows);
        // V-801 USER_DEFINE prepend (xfdl:576~578).
        const lov = payload.ds_GetCodeMasterAllList ?? [];
        const lovWithUserDefine = lov.some((m) => m.CODE_ID === "USER_DEFINE")
          ? lov
          : [{ CODE_ID: "USER_DEFINE", CODE_NM: "사용자 정의" }, ...lov];
        setMasterLov(lovWithUserDefine);
        if (rows.length > 0 && !rows.find((r) => r.CODE_ID === selectedMasterKey)) {
          setSelectedMasterKey(rows[0].CODE_ID);
        } else if (rows.length === 0) {
          setSelectedMasterKey(null);
        }
        showMessage({ message: `${rows.length}건 조회 되었습니다.`, toast: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : "조회 실패");
        setMasterRows([]);
      } finally {
        setIsSearching(false);
      }
    },
    [selectedMasterKey, showMessage, setMasterRows, setMasterLov, setSelectedMasterKey]
  );

  /** action=searchDetail 호출 (fn_searchDetail, xfdl:410). */
  const loadDetail = useCallback(async (master: MasterRow | null) => {
    if (!master) {
      setDetailRows([]);
      setCategoryLov([]);
      setRefLovs({ ref1: [], ref2: [], ref3: [], ref4: [], ref5: [] });
      setSelectedCategoryId("");
      return;
    }
    try {
      const payload = await searchDetail(String(master.MASTER_CODE ?? master.CODE_ID), {
        ref1: master.MASTER_CODE_REF1,
        ref2: master.MASTER_CODE_REF2,
        ref3: master.MASTER_CODE_REF3,
        ref4: master.MASTER_CODE_REF4,
        ref5: master.MASTER_CODE_REF5,
      });
      const rows = (payload.ds_GetCodeDetailList ?? []).map((r, i) => ({
        ...withDetailSyntheticId(r, i),
        nativeeditor_status: "" as RowStatus,
      }));
      setDetailRows(rows);
      // V-704 (xfdl:527~529): "전체" prepend
      const cats = payload.ds_GetTbMcmCodeCategoryList ?? [];
      const catsWithAll = [{ CATEGORY_ID: "", CATEGORY_NM: "전체" }, ...cats];
      setCategoryLov(catsWithAll);
      setSelectedCategoryId("");
      setRefLovs({
        ref1: payload.ds_codeValRef1 ?? [],
        ref2: payload.ds_codeValRef2 ?? [],
        ref3: payload.ds_codeValRef3 ?? [],
        ref4: payload.ds_codeValRef4 ?? [],
        ref5: payload.ds_codeValRef5 ?? [],
      });
      if (payload.ds_GetCodeMasterAllList) {
        const lov = payload.ds_GetCodeMasterAllList;
        const lovWithUserDefine = lov.some((m) => m.CODE_ID === "USER_DEFINE")
          ? lov
          : [{ CODE_ID: "USER_DEFINE", CODE_NM: "사용자 정의" }, ...lov];
        setMasterLov(lovWithUserDefine);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "상세 조회 실패");
    }
  }, [setMasterLov]);

  // 초기 로드 + Master 선택 시 Detail 로드
  useEffect(() => {
    // 첫 진입 조회는 SearchArea autoSearch 가 사용자 기본값을 넣은 뒤 한다(설계 2026-10-07-search-defaults §6.4, handleAreaSearch).
    // 여기서는 새 창이 Master 행 없이 복원됐을 때만 이어받은 조건으로 조회한다(autoSearch 는 복원이면 조회하지 않는다).
    // 조회 결과를 상태에 담는 비동기 호출이라 effect 안 setState 규칙에 걸린다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (restored && masterRows.length === 0) void loadMaster(filters);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // 선택된 Master 가 있고 rowType != "inserted" (신규 아님) 일 때만 loadDetail (V-702).
    if (selectedMaster && selectedMaster.nativeeditor_status !== "inserted") {
      // 상세 조회 결과를 상태에 담는 비동기 호출이라 effect 안 setState 규칙에 걸린다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadDetail(selectedMaster);
    } else {
      void loadDetail(null);
    }
  }, [selectedMaster, loadDetail]);

  // ── handlers ──
  const handleFilterChange = (k: keyof MasterCodeFilters, v: string) =>
    setFilters((p) => ({ ...p, [k]: v }));

  /**
   * 조회 (B-001).
   *
   * 권한 판정을 **핸들러 안**에 둔다 — 툴바 [조회]는 PageLayout 이 RBAC 로 막지만, 조회조건 칸의
   *   Enter 는 SearchArea 가 이 함수를 직접 부르므로 버튼 판정을 통째로 우회한다(진입 수단에 따라
   *   권한이 갈리는 구멍). 같은 판정(페이지 objId x "search")을 여기 겹쳐 두 경로를 일치시킨다.
   *   진입 시 자동 조회와 팝업 저장 후 재조회는 loadMaster/loadDetail 를 직접 부르므로 이 가드를
   *   타지 않는다 — 가드는 사용자 조작 진입점에만 있다.
   */
  const handleSearch = () => {
    // canDoButton 은 로딩 중이면 보안 default 로 false 다 — 진입 직후 친 Enter 를 "권한 없음"으로
    //   오표시하지 않도록 로딩 상태를 먼저 갈라 안내한다.
    if (rbac.isLoading) {
      showMessage({ message: "권한 확인 중입니다.", toast: true });
      return;
    }
    if (!canDoButton(rbac, PAGE_OBJ_ID, "search")) {
      showMessage({ message: "권한이 없습니다.", toast: true });
      return;
    }
    void loadMaster(filters);
  };

  /**
   * 조회 영역의 조회(Enter·autoSearch). autoSearch 가 부른 첫 호출(trigger === "auto")만 진입 자동 조회라 가드 없이 loadMaster 를 부른다 —
   *   autoSearch 는 사용자 확인 직후 한 번만 부르므로 그때 권한 확인이 끝나지 않았으면 가드가 첫 조회를 버린다.
   *   사용자가 친 Enter(인자 없음)는 진입 대기 중이어도 늘 handleSearch(권한 가드 포함)를 탄다 — 조회 기본값을 기다리는 동안
   *   친 Enter 가 진입 대기 표지(autoSearchPendingRef)를 먼저 가져가 가드를 건너뛰는 경합을 막는다.
   *   복원으로 시작하면 autoSearch 가 부르지 않으므로 처음부터 가드를 탄다.
   */
  const autoSearchPendingRef = useRef(!restored);
  const handleAreaSearch = (trigger?: SearchTrigger) => {
    if (decideAreaSearch(trigger, autoSearchPendingRef.current) === "entry") {
      autoSearchPendingRef.current = false;
      void loadMaster(filters);
      return;
    }
    handleSearch();
  };

  /** Master 그리드 행 클릭 → Detail 자동 조회 (V-701~V-704). */
  const handleMasterRowClick = useCallback((row: Record<string, unknown>) => {
    const r = row as MasterRow & GridRow;
    const key = getMasterRowId(r);
    setSelectedMasterKey(key);
  }, [setSelectedMasterKey]);

  // Master 그리드 데이터 변경 (행 추가 / 복사 / 삭제)
  const handleMasterDataChange = useCallback(
    (newData: Record<string, unknown>[], addedRowKey?: string) => {
      if (addedRowKey) {
        // 행복사: newData 의 copied row 의 데이터 보존 → ...source 가 defaults 를 덮음.
        // 행추가: source 가 emptyRow 라 defaults 적용됨.
        const source = newData.find(
          (r) => (r as GridRow).__gridTempId === addedRowKey
        ) as Partial<MasterRow> | undefined;
        const base = source ?? {};
        const newRow: MasterRow & GridRow = {
          CODE_NM: "",
          USE_TP: "Y",
          CODE_VER: "1", // ST-002 — As-Is 행추가 시 "1" 하드코딩 (xfdl:618)
          ...base,
          // 행복사 시에도 CODE_ID 는 비워서 사용자 입력 강제 (PK 충돌 방지)
          CODE_ID: "",
          __gridTempId: addedRowKey,
          nativeeditor_status: "inserted",
        };
        setMasterRows((prev) => [...prev, newRow]);
        setSelectedMasterKey(addedRowKey);
      } else {
        // V-301 — 기존 Master 삭제 차단 (xfdl:632~636).
        const removedKeys = masterRows
          .filter((r) => !newData.find((n) => getMasterRowId(n as MasterRow & GridRow) === getMasterRowId(r)))
          .filter((r) => r.nativeeditor_status !== "inserted");
        if (removedKeys.length > 0) {
          setError("기존 마스터 코드는 삭제할 수 없습니다.");
          return;
        }
        setMasterRows(newData as (MasterRow & GridRow)[]);
      }
    },
    [masterRows, setMasterRows, setSelectedMasterKey]
  );

  const handleMasterCellChange = useCallback(
    (p: { rowKey: string | number; field: string; newValue: unknown }) => {
      setMasterRows((prev) =>
        prev.map((r) => {
          if (getMasterRowId(r) !== String(p.rowKey)) return r;
          const updated = { ...r, [p.field]: p.newValue } as MasterRow & GridRow;
          updated.nativeeditor_status =
            r.nativeeditor_status === "inserted" ? "inserted" : "updated";
          return updated;
        })
      );
    },
    [setMasterRows]
  );

  // Detail 그리드 데이터 변경
  const handleDetailDataChange = useCallback(
    (newData: Record<string, unknown>[], addedRowKey?: string) => {
      if (addedRowKey) {
        // V-201 / V-202 — 카테고리 선택 검증
        if (categoryLov.length <= 1) {
          // [전체] 1개만 있으면 실제 카테고리 0
          setError("코드를 선택해 주시기 바랍니다.");
          return;
        }
        // 카테고리 미선택 시 자동으로 첫 실제 카테고리 (categoryLov[1], [0]은 "전체") 선택.
        let effectiveCategoryId = selectedCategoryId;
        if (!effectiveCategoryId) {
          effectiveCategoryId = String(categoryLov[1]?.CATEGORY_ID ?? "");
          if (!effectiveCategoryId) {
            setError("카테고리를 선택해 주시기 바랍니다.");
            return;
          }
          setSelectedCategoryId(effectiveCategoryId);
        }
        // 행복사: newData 에 copied row 포함 — sourceRow 추출해서 데이터 보존.
        // 행추가: sourceRow 의 값은 emptyRow (모두 비어있음) → defaults 적용됨.
        const sourceRow = newData.find(
          (r) => (r as GridRow).__gridTempId === addedRowKey,
        ) as Partial<DetailRow> | undefined;
        const categoryNm =
          categoryLov.find((c) => c.CATEGORY_ID === effectiveCategoryId)?.CATEGORY_NM ?? "";
        const base = sourceRow ?? {};
        const newRow: DetailRow & GridRow & { __rowId: string } = {
          CODE_VAL: "",
          CODE_VER: "1",
          ...base,
          // ...base 가 CATEGORY_ID 등 PK 를 빈값으로 덮어쓸 수 있어 명시적 override (행추가 시 안전 보장).
          MASTER_CODE: effectiveMasterCodeRef.current,
          CATEGORY_ID: effectiveCategoryId,
          CATEGORY_NM: categoryNm,
          CHK: "1", // 변경 마킹 (V-601)
          __gridTempId: addedRowKey,
          __rowId: addedRowKey, // AgDataGrid rowKey 매칭용
          nativeeditor_status: "inserted",
        };
        setDetailRows((prev) => [...prev, newRow]);
      } else {
        // 행 삭제 → status="deleted" 마킹 (As-Is saveDetail status 분기)
        setDetailRows((prev) => {
          const newKeys = new Set(newData.map((r) => getDetailRowId(r as DetailRow & GridRow)));
          const kept = newData as (DetailRow & GridRow)[];
          const deleted = prev
            .filter((r) => !newKeys.has(getDetailRowId(r)))
            .filter((r) => r.nativeeditor_status !== "inserted")
            .map((r) => ({ ...r, nativeeditor_status: "deleted" as RowStatus, CHK: "1" }));
          return [...kept, ...deleted];
        });
      }
    },
    [categoryLov, selectedCategoryId]
  );

  // GE-001 CHK toggle — 1↔0 전환. 다른 셀 변경 시 자동 CHK=1 (V-601) 와 별도 직접 클릭 토글.
  const handleDetailChkToggle = useCallback((row: Record<string, unknown>) => {
    const rid = getDetailRowId(row as DetailRow & GridRow);
    setDetailRows((prev) =>
      prev.map((r) => {
        if (getDetailRowId(r) !== rid) return r;
        const next = String(r.CHK ?? "") === "1" ? "0" : "1";
        const updated = { ...r, CHK: next } as DetailRow & GridRow;
        // CHK 변경만으로는 rowStatus 갱신 ✗ (As-Is 동작) — V-601 은 다른 셀 변경 시 자동 CHK=1 의 의미.
        return updated;
      })
    );
  }, []);

  const handleDetailCellChange = useCallback(
    (p: { rowKey: string | number; field: string; newValue: unknown }) => {
      setDetailRows((prev) =>
        prev.map((r) => {
          if (getDetailRowId(r) !== String(p.rowKey)) return r;
          const updated = { ...r, [p.field]: p.newValue } as DetailRow & GridRow;
          // V-601 — CHK 외 컬럼 변경 시 자동 CHK=1
          if (p.field !== "CHK") {
            updated.CHK = "1";
          }
          updated.nativeeditor_status =
            r.nativeeditor_status === "inserted" ? "inserted" : "updated";
          return updated;
        })
      );
    },
    []
  );

  // ── 저장 (Master) — B-006 ──
  const handleSaveMaster = useCallback(async () => {
    // V-002 ~ V-006 (기능 §6.1)
    const changed = masterRows.filter((r) => r.nativeeditor_status);
    if (changed.length === 0) {
      setError("저장할 변경분이 없습니다.");
      return;
    }
    for (const r of changed) {
      if (!String(r.CODE_ID ?? "").trim()) {
        setError("코드ID를 입력해 주십시오.");
        return;
      }
      if (!String(r.CODE_NM ?? "").trim()) {
        setError("코드명을 입력해 주십시오.");
        return;
      }
      if (!String(r.USE_TP ?? "").trim()) {
        setError("사용여부를 입력해 주십시오.");
        return;
      }
    }
    // V-005 본 그리드 내 CODE_ID 중복
    const codeIdSet = new Set<string>();
    for (const r of masterRows.filter((r) => r.nativeeditor_status !== "deleted")) {
      const id = String(r.CODE_ID);
      if (codeIdSet.has(id)) {
        setError("중복된 코드값이 존재합니다.");
        return;
      }
      codeIdSet.add(id);
    }
    // V-006 — 전체 마스터 (ds_grdMainAll) 내 CODE_ID 중복 (신규 행만 검증).
    // As-Is xfdl:389~396 — rowType != 1 && rowType != 4 → 신규 행만 검사 대상.
    const lovIds = new Set(masterLov.map((m) => String(m.CODE_ID)));
    // 본 그리드의 기존 행 (수정 행) CODE_ID 는 LoV 에 자기 자신이 있으므로 제외 대상.
    const insertedRows = changed.filter((r) => r.nativeeditor_status === "inserted");
    for (const r of insertedRows) {
      const id = String(r.CODE_ID);
      if (lovIds.has(id)) {
        setError("전체 마스터 내 중복된 코드값이 존재합니다.");
        return;
      }
    }

    setIsSaving(true);
    try {
      const rows = changed.map((r) => ({
        ...(stripInternal(r) as MasterRow),
        rowStatus: r.nativeeditor_status === "inserted" ? "inserted" : "updated",
      }));
      const payload = await saveMaster(rows as unknown as MasterRow[]);
      showMessage({ message: `${payload.cnt_merge ?? 0}건 저장 되었습니다.` });
      await loadMaster(filters);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setIsSaving(false);
    }
  }, [masterRows, filters, loadMaster, showMessage]);

  // ── 저장 (Detail) — B-013 ──
  const handleSaveDetail = useCallback(async () => {
    // V-101 ~ V-109 (기능 §6.2)
    if (categoryLov.length <= 1) {
      setError("코드를 선택해 주시기 바랍니다.");
      return;
    }
    const changed = detailRows.filter((r) => r.nativeeditor_status);
    if (changed.length === 0) {
      setError("저장할 변경분이 없습니다.");
      return;
    }
    const chkRows = changed.filter((r) => r.CHK === "1");
    if (chkRows.length === 0) {
      setError("코드를 선택 후 저장해 주십시오.");
      return;
    }
    for (const r of chkRows) {
      if (r.nativeeditor_status !== "deleted") {
        if (!String(r.CATEGORY_ID ?? "").trim()) {
          setError("카테고리를 선택해 주시기 바랍니다.");
          return;
        }
        if (!String(r.CODE_VAL ?? "").trim()) {
          setError("코드 값를 입력해 주십시오.");
          return;
        }
        if (!String(r.CODE_VAL_MEAN ?? "").trim()) {
          setError("코드 의미를 입력해 주십시오.");
          return;
        }
      }
    }
    // V-107 CODE_VAL 중복 (categoryId / masterCode 무관 — As-Is 보존)
    const codeValSet = new Set<string>();
    for (const r of chkRows.filter((r) => r.nativeeditor_status !== "deleted")) {
      const cv = String(r.CODE_VAL);
      if (codeValSet.has(cv)) {
        setError("중복된 코드가 존재합니다.");
        return;
      }
      codeValSet.add(cv);
    }

    setIsSaving(true);
    try {
      const rows = chkRows.map((r) => ({
        ...(stripInternal(r) as DetailRow),
        rowStatus: r.nativeeditor_status, // "inserted" / "updated" / "deleted"
      }));
      const payload = await saveDetail(rows as unknown as DetailRow[]);
      showMessage({ message: `${payload.cnt_mergeDetail ?? 0}건 저장 되었습니다.` });
      if (selectedMaster) {
        await loadDetail(selectedMaster);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setIsSaving(false);
    }
  }, [detailRows, categoryLov, selectedMaster, loadDetail, showMessage]);

  // Detail 그리드 카테고리 필터 (FX-002 onitemchanged, xfdl:582)
  const filteredDetailRows = useMemo(() => {
    if (!selectedCategoryId) return detailRows;
    return detailRows.filter((r) => r.CATEGORY_ID === selectedCategoryId);
  }, [detailRows, selectedCategoryId]);

  const masterColumns = useMemo(() => buildMasterColumns(masterLov), [masterLov]);
  const detailColumns = useMemo(
    () => buildDetailColumns(categoryLov, refLovs, selectedMaster, handleDetailChkToggle),
    [categoryLov, refLovs, selectedMaster, handleDetailChkToggle]
  );

  const masterCount = masterRows.filter((r) => r.nativeeditor_status !== "deleted").length;
  const detailCount = filteredDetailRows.filter((r) => r.nativeeditor_status !== "deleted").length;

  // ── B-004 Master 행취소 — 선택된 단일 row 만 취소 (사용자 결정 2026-05-29) ──
  // inserted → row 제거 / updated → status "" reset / 다른 row 의 변경분은 유지.
  const handleResetMaster = useCallback(() => {
    if (!selectedMasterKey) {
      setError("취소할 행을 선택하세요.");
      return;
    }
    setMasterRows((prev) => {
      const target = prev.find((r) => getMasterRowId(r) === selectedMasterKey);
      if (!target?.nativeeditor_status) {
        setError("변경된 행이 아닙니다.");
        return prev;
      }
      if (target.nativeeditor_status === "inserted") {
        return prev.filter((r) => getMasterRowId(r) !== selectedMasterKey);
      }
      // updated → status reset (사용자 입력값은 그대로 — 원본 복원은 후속 단계)
      return prev.map((r) =>
        getMasterRowId(r) === selectedMasterKey
          ? { ...r, nativeeditor_status: "" as RowStatus }
          : r,
      );
    });
  }, [selectedMasterKey, setMasterRows]);

  // ── B-010 Detail 행취소 — 선택된 단일 row 만 취소 (사용자 결정 2026-05-29) ──
  const handleResetDetail = useCallback(() => {
    if (!selectedDetailKey) {
      setError("취소할 행을 선택하세요.");
      return;
    }
    setDetailRows((prev) => {
      const target = prev.find((r) => getDetailRowId(r) === selectedDetailKey);
      if (!target?.nativeeditor_status) {
        setError("변경된 행이 아닙니다.");
        return prev;
      }
      if (target.nativeeditor_status === "inserted") {
        return prev.filter((r) => getDetailRowId(r) !== selectedDetailKey);
      }
      // updated/deleted → status reset (deleted 였으면 다시 활성화)
      return prev.map((r) =>
        getDetailRowId(r) === selectedDetailKey
          ? { ...r, nativeeditor_status: "" as RowStatus }
          : r,
      );
    });
  }, [selectedDetailKey]);

  // ── B-005 Master Export — As-Is `gfn_exportExcel(grd_main, titletext)` (xfdl:659~662) ──
  const handleExportMaster = useCallback(() => {
    // V-401 — Export 대상 데이터 검증 (W5 E 패턴: 사전 disable 제거 → 핸들러 validation).
    const exportTargets = masterRows.filter((r) => r.nativeeditor_status !== "deleted");
    if (exportTargets.length === 0) {
      setError("Export 할 데이터가 없습니다.");
      return;
    }
    const exportRows = exportTargets
      .map((r) => {
        const o = stripInternal(r);
        // CHK / 내부 컬럼 제외 — 화면 표시 컬럼만 export (As-Is 동일)
        const out: Record<string, unknown> = {};
        for (const c of masterColumns) {
          out[(c.header ?? c.key).replace(/\s*\*$/, "").trim()] = (o as Record<string, unknown>)[c.key];
        }
        return out;
      });
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Master Code");
    XLSX.writeFile(wb, `Master_Code_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }, [masterRows, masterColumns]);

  // ── B-012 Detail Export — As-Is `gfn_exportExcel(grd_detail, titletext, ["마스터코드 : "+MASTER_CODE])`
  //    (xfdl:788~794). V-501 — Master 미선택 시 차단 + V-402 빈 데이터 차단 (W5 E 패턴).
  const handleExportDetail = useCallback(() => {
    if (!effectiveMasterCode) {
      setError("Master Code 를 먼저 선택하세요.");
      return;
    }
    const exportTargets = filteredDetailRows.filter((r) => r.nativeeditor_status !== "deleted");
    if (exportTargets.length === 0) {
      setError("Export 할 데이터가 없습니다.");
      return;
    }
    const exportRows = exportTargets
      .map((r) => {
        const o = stripInternal(r);
        const out: Record<string, unknown> = {};
        for (const c of detailColumns) {
          out[(c.header ?? c.key).replace(/\s*\*$/, "").trim()] = (o as Record<string, unknown>)[c.key];
        }
        return out;
      });
    const ws = XLSX.utils.json_to_sheet(exportRows);
    // As-Is 헤더 row: "마스터코드 : XXX" — Excel A1 표시
    XLSX.utils.sheet_add_aoa(ws, [[`마스터코드 : ${effectiveMasterCode}`]], { origin: "A1" });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Detail");
    XLSX.writeFile(wb, `Detail_${effectiveMasterCode}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }, [filteredDetailRows, detailColumns, effectiveMasterCode]);

  // ── B-011 Detail Import — As-Is `gfn_openPopup(... MasterCodeUploadFilePopup.xfdl ...)` (xfdl:772~779) ──
  // V-501: rowposition == -1 차단 (xfdl:774).
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const handleOpenUpload = useCallback(() => {
    if (!effectiveMasterCode) {
      setError("Master Code 를 먼저 선택하세요.");
      return;
    }
    setIsUploadOpen(true);
  }, [effectiveMasterCode]);
  const handleCloseUpload = useCallback(
    (saved: boolean) => {
      setIsUploadOpen(false);
      // As-Is fn_returnMasterCodeUploadFilePopupCallBack (xfdl:782~785) 은 무동작이나,
      // To-Be 는 저장됐다면 Detail 그리드 재조회 (사용자 정합 보강).
      if (saved && selectedMaster) {
        void loadDetail(selectedMaster);
      }
    },
    [selectedMaster, loadDetail]
  );

  return (
    <PageLayout
      title="Master Code 관리"
      breadcrumb="공통관리 > Master 관리(원장) > Master Code 관리"
      objId={PAGE_OBJ_ID}
      buttons={[
        // 화면 자기 버튼 — 페이지 objId(masterCodeMng) + 실제 액션명. 최근검색값 발행은 명시 플래그가 정본.
        {
          id: "btn_search",
          label: "조회",
          onClick: handleSearch,
          type: "primary" as const,
          disabled: isSearching || isSaving,
          action: "search",
          emitSearch: true,
        },
      ]}
    >
      <SearchArea onSearch={handleAreaSearch} autoSearch>
        <SearchField
          label="코드ID"
          name="codeId"
          value={filters.pCodeId}
          onChange={(v) => handleFilterChange("pCodeId", v)}
        />
        <SearchField
          label="코드명"
          name="codeNm"
          value={filters.pCodeNm}
          onChange={(v) => handleFilterChange("pCodeNm", v)}
        />
        {effectiveMasterCode && (
          <div style={{ marginLeft: 16, color: "indigo", fontWeight: 600 }}>
            선택 Master: {effectiveMasterCode}
          </div>
        )}
      </SearchArea>

      <ContentBody root>
        <ContentPanel>
          <div style={{ display: "flex", flexDirection: "row", flex: "1 1 0", minHeight: 0, gap: 6 }}>
            {/* 좌: Master 그리드 — toolbar 에 B-001 B-002 B-004 B-005 B-006 (행추가/행복사/행취소/Export/저장).
                 B-003 행삭제 제외 — V-301 으로 기존 Master 삭제 차단 (사용자 결정 2026-05-28). */}
            <div style={{ display: "flex", flex: "1 1 0", minWidth: 0, minHeight: 0 }}>
              <GridPanel
                title="Master Code"
                count={masterCount}
                showAddButton
                showCopyButton
                buttons={[
                  // W5 E 패턴 — 사전 row-state disable 제거. `isSearching || isSaving` 만 유지.
                  // 빈 동작 차단은 각 핸들러 내 V-NNN 검증 + ErrorModal.
                  {
                    id: "btn_rowCencelL",
                    label: "행취소",
                    onClick: handleResetMaster,
                    disabled: isSearching || isSaving,
                  },
                  {
                    id: "btn_excelDownL",
                    label: "Export",
                    onClick: handleExportMaster,
                    disabled: isSearching || isSaving,
                  },
                  // 서버 쓰기 액션 — GridPanel 버튼은 objId/action props 가 없어 canDoButton 을 직접 겹친다
                  //   (btn_excelUploadR 과 같은 방식). 판정 축은 페이지 objId × 실제 액션 "save".
                  {
                    id: "btn_saveL",
                    label: "저장",
                    onClick: () => void handleSaveMaster(),
                    className: "btn-primary",
                    disabled: isSearching || isSaving || !canDoButton(rbac, PAGE_OBJ_ID, "save"),
                  },
                ]}
                data={masterRows}
                rowKey="CODE_ID"
                columns={masterColumns}
                selectedRowKey={selectedMasterKey}
                onDataChange={handleMasterDataChange}
                loading={isSaving}
              >
                <AgDataGrid
                  gridId="masterCode"
                  columnSizing="fit"
                  columns={masterColumns}
                  data={masterRows}
                  rowKey="CODE_ID"
                  sortable
                  singleClickEdit
                  stopEditingWhenCellsLoseFocus={false}
highlightedRowKey={selectedMasterKey}
                  onRowClick={handleMasterRowClick}
                  onCellValueChanged={handleMasterCellChange}
                  loading={isSearching}
                  loadingMessage="조회 중..."
                  emptyMessage="등록된 Master Code 가 없습니다."
                />
              </GridPanel>
            </div>

            {/* 우: Detail 그리드 — toolbar 에 B-007~B-013 (행추가/행복사/행삭제/행취소/Import/Export/저장) */}
            <div style={{ display: "flex", flex: "1 1 0", minWidth: 0, minHeight: 0 }}>
              <GridPanel
                title={`Detail ${effectiveMasterCode ? `(${effectiveMasterCode})` : ""}`}
                count={detailCount}
                showAddButton
                showDeleteButton
                showCopyButton
                buttons={[
                  // W5 E 패턴 — 사전 row-state / master-selection disable 제거.
                  // `isSearching || isSaving` 만 유지. 차단은 핸들러 내 V-NNN.
                  {
                    id: "btn_rowCencelR",
                    label: "행취소",
                    onClick: handleResetDetail,
                    disabled: isSearching || isSaving,
                  },
                  // 팝업을 여는 버튼 — 팝업 단위 RBAC(팝업 OBJECT_ID x "popup"). GridPanel 버튼은
                  //   PageLayout 과 달리 objId/action props 가 없어 canDoButton 을 직접 겹친다.
                  {
                    id: "btn_excelUploadR",
                    label: "Import",
                    onClick: handleOpenUpload,
                    disabled:
                      isSearching || isSaving || !canDoButton(rbac, UPLOAD_POPUP_OBJ_ID, "popup"),
                  },
                  {
                    id: "btn_excelDownR",
                    label: "Export",
                    onClick: handleExportDetail,
                    disabled: isSearching || isSaving,
                  },
                  // 서버 쓰기 액션 — Detail 저장은 별개 토큰 "saveDetail" 이다(Master 의 "save" 와 분리).
                  {
                    id: "btn_saveR",
                    label: "저장",
                    onClick: () => void handleSaveDetail(),
                    className: "btn-primary",
                    disabled: isSearching || isSaving || !canDoButton(rbac, PAGE_OBJ_ID, "saveDetail"),
                  },
                ]}
                data={filteredDetailRows}
                rowKey="__rowId"
                columns={detailColumns}
                selectedRowKey={selectedDetailKey}
                onDataChange={handleDetailDataChange}
                loading={isSaving}
                titleExtra={
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span>카테고리:</span>
                    <select
                      value={selectedCategoryId}
                      onChange={(e) => setSelectedCategoryId(e.target.value)}
                      style={{ padding: 4 }}
                    >
                      {categoryLov.map((c) => (
                        <option key={c.CATEGORY_ID} value={c.CATEGORY_ID}>
                          {c.CATEGORY_NM}
                        </option>
                      ))}
                    </select>
                  </div>
                }
              >
                <AgDataGrid
                  gridId="masterDetail"
                  columnSizing="fit"
                  columns={detailColumns}
                  data={filteredDetailRows}
                  rowKey="__rowId"
                  sortable
                  singleClickEdit
                  stopEditingWhenCellsLoseFocus={false}
                  highlightedRowKey={selectedDetailKey}
                  onRowClick={(row) => setSelectedDetailKey(getDetailRowId(row as DetailRow & GridRow))}
                  onCellValueChanged={handleDetailCellChange}
                  emptyMessage={
                    effectiveMasterCode
                      ? "상세 코드가 없습니다."
                      : "Master Code 를 먼저 선택하세요."
                  }
                />
              </GridPanel>
            </div>
          </div>
        </ContentPanel>
      </ContentBody>

      <ErrorModal message={error} onClose={() => setError(null)} />

      {/* P-001 — masterCodeUploadFilePopup (B-011 Import) — As-Is xfdl:772~785 */}
      <MasterCodeUploadFilePopupDialog
        open={isUploadOpen}
        sMasterCode={effectiveMasterCode}
        sCodeNm={String(selectedMaster?.CODE_NM ?? "")}
        onClose={handleCloseUpload}
      />
    </PageLayout>
  );
}
