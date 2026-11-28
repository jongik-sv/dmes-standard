"use client";

/**
 * commObjMng 화면 — OBJECT 관리 (As-Is CommObjMng.xfdl) + 퍼미션 모델 v2.
 *
 * 인용 정본:
 *   - 분석리포트 §3 (UI 컴포넌트) / §4 (이벤트) / §6 (SQL) / §8 (BPMN)
 *   - 기능설계서 §3 (조회+그리드) / §4 (Detail 필드) / §5 (버튼) / §6 (validation V-001~V-901) / §10 (메시지)
 *   - 디자인설계서 §2 (좌우분할 레이아웃) / §4 (15 Detail 필드)
 *   - BPMN설계서 §1.1 (action) / §2 (action 흐름) — 새 action: searchObjPerm · searchObjMenu (퍼미션 절)
 *   - 시안 docs/perm-bench/mock-v16.html lgObjNext (「새 설계」)
 *
 * 화면 구성(시안 lgObjNext):
 *   위 왼쪽 = OBJECT 목록(OBJECT ID · OBJECT 명 · 사용 · 버튼 권한 · 메뉴 수 · 퍼미션 수), 위 오른쪽 = 상세(옛 15칸 + 허용 값 3칸).
 *   아래 왼쪽 = 「이 오브젝트의 퍼미션」(읽기 전용), 아래 오른쪽 = 「이 오브젝트를 가리키는 메뉴」.
 *   조회 조건 = OBJECT · 사용 여부 · 메뉴 폴더(빈 값 = 전체).
 *
 * 호출: POST /api/mcm/oasis/commObjMng/{action} (OASIS only — mcm 모듈 SqlSession 미등록).
 * To-Be 정책 #1: BIZ_SYSTEM_CODE/APP_HOST 폐기 → S-001 / D-003 / G-006 / LV-001 모두 제거.
 *
 * 성능(R12): 상세 입력 초안은 ObjDetailForm 안에만 있고 루트는 ref 핸들로 대화한다. 아래 두 칸은 memo 부품.
 *
 * 작업대에서 열기: useOpenWith("commObjMng") — mode edit → OBJECT_ID 행 선택(목록에 없으면 한 번 조회), mode new → 새 행.
 *   계약 = /Users/jji/.coord/perm-bench-mac/contracts/open-with.md. 보내는 쪽(「퍼미션 관리 →」)은 commPermBench/nav 의 openBench.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type PageButton,
  PageLayout,
  SearchArea,
  SearchField,
  ContentBody,
  ContentPanel,
  ErrorModal,
} from "@dk-oasis/shared/layout";
import { GridPanel, AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Button, type DetailDraftHandle } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { useCarryRestored, useCarryState } from "@dk-oasis/shared/portal-shell";
import { openBench, useOpenWith } from "@/page-components/csa/commPermBench/nav";
import { searchCommObjMng, saveCommObjMng, loadLov, searchSystemLov } from "./api";
import { ObjDetailForm } from "./ObjDetailForm";
import { impactLines } from "./perm-impact";
import {
  applyDraft,
  emptyRow,
  fillBlank,
  getRowKey,
  restoreRow,
  stripInternal,
  toCount,
  toListRow,
  type GridRow,
  type ObjRow,
} from "./row-model";
import { useObjPanels } from "./useObjPanels";
import type {
  CommObjMngFilters,
  CommObjMngRow,
  MenuIdLov,
  ObjMenuRow,
  ObjPermRow,
  RowStatus,
} from "./types";

const DEFAULT_FILTERS: CommObjMngFilters = {
  edt_OBJECT_ID: "",
  cbo_USE_TP: "",
  menuFolderId: "",
  cbo_SYSTEM_CODE: "",
  edt_OBJECT_TYPE: "",
  cbo_ACCESS_TP: "",
};

/** 조회조건 접속 경로 — "전체" + 내부/외부 (2026-11-26). */
const ACCESS_TP_SEARCH_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "전체" },
  { value: "내부", label: "내부" },
  { value: "외부", label: "외부" },
];

/** S-003 (검색) — Combo 정적 옵션 "전체" + Y/N (xfdl:161 displaynulltext="전체"). */
const USE_TP_SEARCH_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "전체" },
  { value: "Y", label: "Yes" },
  { value: "N", label: "No" },
];

const USE_TP_LABEL: Record<string, string> = { Y: "Yes", N: "No" };

/**
 * OBJECT 목록 열 — 시안 「새 설계」 6칸. 나머지 옛 칸은 오른쪽 상세에서 보고 고친다(행 클릭 → 상세 수정 패턴).
 * 모듈 상수: 렌더마다 새 참조를 만들지 않는다(R7).
 */
const MASTER_COLUMNS: GridColumn[] = [
  { key: "OBJECT_ID", header: "OBJECT ID", width: 200, editable: false, align: "left" },
  { key: "OBJECT_NM", header: "OBJECT 명", width: 200, editable: false, align: "left" },
  {
    key: "USE_TP",
    header: "사용",
    width: 70,
    editable: false,
    align: "center",
    // As-Is G-009 displaytype="combotext" 정합 — code(Y/N) 저장, label(Yes/No) 표시.
    render: (v) => USE_TP_LABEL[String(v ?? "")] ?? String(v ?? ""),
  },
  { key: "BTN_PERM", header: "버튼 권한", meta: false, width: 220, editable: false, align: "left" },
  { key: "MENU_CNT", header: "메뉴", meta: false, width: 70, editable: false, align: "right", type: "number" },
  { key: "PERM_CNT", header: "퍼미션", meta: false, width: 80, editable: false, align: "right", type: "number" },
];

/** 「이 오브젝트의 퍼미션」 열 — 읽기 전용. 버튼·팝업은 오브젝트 허용 값 안에서 실제로 켜진 값(효과 값). */
const PERM_COLUMNS: GridColumn[] = [
  { key: "ROLE_ID", header: "역할 ID", meta: false, width: 180, align: "left" },
  { key: "ROLE_NM", header: "역할명", meta: false, width: 160, align: "left" },
  {
    key: "ROLE_USE_TP",
    header: "사용",
    meta: false,
    width: 60,
    align: "center",
    render: (v) => USE_TP_LABEL[String(v ?? "")] ?? String(v ?? ""),
  },
  { key: "EFF_BTN_PERM", header: "버튼 권한", meta: false, width: 180, align: "left" },
  { key: "EFF_POPUP_PERM", header: "팝업 권한", meta: false, width: 140, align: "left" },
  { key: "USER_CNT", header: "받은 사람", meta: false, width: 90, align: "right", type: "number" },
  {
    key: "__go",
    header: "",
    meta: false,
    width: 130,
    align: "center",
    sortable: false,
    filter: false,
    tooltip: false,
    // 행에 OBJECT_ID 가 들어 있다(useObjPanels). 모듈 상수 열 정의라 화면 상태를 닫지 않는다.
    render: (_v, row) => (
      <Button size="sm" onClick={() => openBench("commObjMng", String(row.ROLE_ID ?? ""), String(row.OBJECT_ID ?? ""))}>
        퍼미션 관리 →
      </Button>
    ),
  },
];

/** 「이 오브젝트를 가리키는 메뉴」 열. */
const MENU_COLUMNS: GridColumn[] = [
  { key: "MENU_PATH", header: "폴더", meta: false, width: 200, align: "left" },
  { key: "MENU_NM", header: "메뉴 명칭", meta: false, width: 160, align: "left" },
  { key: "MENU_ID", header: "MENU_ID", meta: false, width: 160, align: "left" },
  {
    key: "MENU_VIEW_YN",
    header: "표시",
    meta: false,
    width: 70,
    align: "center",
    render: (v) => (String(v ?? "") === "N" ? "숨김" : "보임"),
  },
  { key: "USE_TP", header: "사용", meta: false, width: 60, align: "center", render: (v) => USE_TP_LABEL[String(v ?? "")] ?? String(v ?? "") },
];

const PermPanel = memo(function PermPanel({
  rows,
  loading,
  error,
}: {
  rows: ObjPermRow[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <GridPanel
      title="이 오브젝트의 퍼미션"
      count={rows.length}
      titleExtra={<span style={NOTE_STYLE}>읽기 전용 · 시스템 관리자는 퍼미션 없이 씁니다</span>}
    >
      <AgDataGrid
        gridId="objPerm"
        columnSizing="fit"
        columns={PERM_COLUMNS}
        data={rows}
        rowKey="ROLE_ID"
        sortable
        loading={loading}
        loadingMessage="조회 중..."
        emptyMessage={error ?? "이 오브젝트를 쓰는 역할이 없습니다."}
      />
    </GridPanel>
  );
});

const MenuPanel = memo(function MenuPanel({
  rows,
  loading,
  error,
}: {
  rows: ObjMenuRow[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <GridPanel
      title="이 오브젝트를 가리키는 메뉴"
      count={rows.length}
      titleExtra={<span style={NOTE_STYLE}>한 오브젝트를 여러 메뉴가 가리킬 수 있습니다</span>}
    >
      <AgDataGrid
        gridId="objMenu"
        columnSizing="fit"
        columns={MENU_COLUMNS}
        data={rows}
        rowKey="MENU_ID"
        sortable
        loading={loading}
        loadingMessage="조회 중..."
        emptyMessage={error ?? "이 오브젝트를 가리키는 메뉴가 없습니다."}
      />
    </GridPanel>
  );
});

const NOTE_STYLE = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" } as const;

export default function CommObjMngPage() {
  const { showMessage } = useMessage();

  // 새 창으로 분리할 때 이어받는 상태(useCarryState) — 조회 조건·선택 키는 가볍게, 조회 결과 행은 bulky.
  // 메뉴·SYSTEM LoV 는 마운트 때 다시 받는 목록이라 이어받지 않는다(useState).
  const [filters, setFilters] = useCarryState<CommObjMngFilters>("filters", DEFAULT_FILTERS);
  // 조회·저장 busy 는 용도별로 나눈다(R5).
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useCarryState<ObjRow[]>("rows", [], { bulky: true });
  const [selectedKey, setSelectedKey] = useCarryState<string | null>("selectedKey", null);
  const restored = useCarryRestored();

  const [menuLov, setMenuLov] = useState<MenuIdLov[]>([]);
  /**
   * 2026-06-05 — SYSTEM 콤보박스 옵션 (TB_MCM_SEC_MENU_FLD root 폴더).
   * mount 시 1회 로드. 현 시점 시드는 'mcm' 1행. 추후 다른 모듈 root 추가 시 자동 노출.
   */
  const [systemOptions, setSystemOptions] = useState<{ value: string; label: string }[]>([]);

  const detailRef = useRef<DetailDraftHandle<ObjRow>>(null);
  /** 조회 요청 순번 — 더 새 조회(또는 저장 뒤 재조회)가 시작되면 앞선 응답은 버린다. */
  const searchSeq = useRef(0);

  const selected = useMemo<ObjRow | null>(() => {
    if (!selectedKey) return null;
    return rows.find((r) => getRowKey(r) === selectedKey) ?? null;
  }, [rows, selectedKey]);

  const hasAnyChanges = useMemo(() => rows.some((r) => r.nativeeditor_status), [rows]);
  const visibleCount = useMemo(() => rows.filter((r) => r.nativeeditor_status !== "deleted").length, [rows]);

  // 아래 두 칸 — 저장 전 신규 행은 서버에 없으니 조회하지 않는다. 읽는 값(OBJECT_ID)만 의존해 같은 오브젝트에서는 다시 부르지 않는다.
  const panelObjectId = selected && selected.nativeeditor_status !== "inserted" ? String(selected.OBJECT_ID ?? "") : "";
  const panels = useObjPanels(panelObjectId);
  const reloadPanels = panels.reload;

  /** 조회조건 SYSTEM — "전체" + SYSTEM LoV (2026-11-26). */
  const systemSearchOptions = useMemo(
    () => [{ value: "", label: "전체" }, ...systemOptions],
    [systemOptions],
  );

  // 조회 조건 「메뉴 폴더」 옵션 = lov 의 ds_lovMenuId (BE 새 action 없음).
  // ds_lovMenuId 는 루트 폴더를 뺀다 — 루트(모듈) 단위로도 거를 수 있게 ds_systemLov(루트 폴더)를 앞에 붙인다.
  const folderOptions = useMemo(() => {
    const seen = new Set<string>([""]);
    const opts = [{ value: "", label: "전체" }];
    for (const o of [...systemOptions, ...menuLov.map((m) => ({ value: m.MENU_ID, label: m.MENU_ID_NM }))]) {
      if (seen.has(o.value)) continue;
      seen.add(o.value);
      opts.push(o);
    }
    return opts;
  }, [menuLov, systemOptions]);

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

  /** action=search (fn_search → fn_run("searchCmObj"), xfdl:404). */
  const loadList = useCallback(
    async (f: CommObjMngFilters): Promise<void> => {
      const seq = ++searchSeq.current;
      setIsSearching(true);
      setError(null);
      try {
        const payload = await searchCommObjMng(f);
        if (seq !== searchSeq.current) return;
        const list = (payload.ds_main ?? []).map(toListRow);
        setRows(list);
        setSelectedKey(list.length > 0 ? getRowKey(list[0]) : null);
        // V-701 — As-Is "{N}건 조회 되었습니다." (xfdl:376)
        showMessage({ message: `${list.length}건 조회 되었습니다.`, toast: true });
      } catch (e) {
        if (seq !== searchSeq.current) return;
        setError(e instanceof Error ? e.message : "조회 실패");
        setRows([]);
      } finally {
        if (seq === searchSeq.current) setIsSearching(false);
      }
    },
    [showMessage, setRows, setSelectedKey],
  );

  useEffect(() => {
    // 복원됐는데 행이 없으면 이어받은 조건으로 조회한다. 복원 아닌 첫 조회는 SearchArea autoSearch 가 한다(설계 2026-10-07-search-defaults §6.4).
    // 조회 결과를 상태에 담는 비동기 호출이라 effect 안 setState 규칙에 걸린다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (restored && rows.length === 0) void loadList(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilterChange = (k: keyof CommObjMngFilters, v: string) =>
    setFilters((p) => ({ ...p, [k]: v }));

  const handleSearch: () => void = useCallback(() => {
    void loadList(filters);
  }, [loadList, filters]);

  /** B-002 초기화 (fn_reset / xfdl:409). */
  const handleReset = useCallback((): void => {
    setFilters(DEFAULT_FILTERS);
  }, [setFilters]);

  /**
   * B-006 행취소 — 선택된 단일 row 만 취소 (GridPanel 표준 행취소 패턴).
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
      // 조회 시점 값으로 되돌린다(고친 값·허용 값 칩이 남지 않게).
      return prev.map((r) => (getRowKey(r) === selectedKey ? restoreRow(r) : r));
    });
    // inserted 는 행이 사라지니 선택을 푼다. 그 밖은 같은 행을 고른 채 폼이 되돌린 값을 보인다.
    const sel = rows.find((r) => getRowKey(r) === selectedKey);
    if (sel?.nativeeditor_status === "inserted") setSelectedKey(null);
  }, [selectedKey, rows, setRows, setSelectedKey]);

  /**
   * 행추가 / 행복사 / 행삭제 통합 핸들러 (GridPanel onDataChange 시그니처).
   * addedRowKey 있음 → 신규/복사 (emptyRow() default 5종 — V-301).
   * 없음 → 행삭제 → newData 비교 → 사라진 행은 deleted 마킹 (V-101 메뉴·퍼미션 사용 오브젝트 차단 포함).
   */
  const handleDataChange = useCallback(
    (newData: Record<string, unknown>[], addedRowKey?: string) => {
      if (addedRowKey) {
        const sourceRow = newData.find((r) => (r as GridRow).__gridTempId === addedRowKey) as
          | Partial<CommObjMngRow>
          | undefined;
        setRows((prev) => {
          const base = sourceRow ?? {};
          // 행복사 시 sourceRow 가 OBJECT_ID 들고 있을 수 있으나 PK 충돌 방지 위해 항상 빈 값
          // (필수 PK 는 사용자 입력 강제). 집계(메뉴·퍼미션 수)와 조회 시점 값은 새 행에 없다.
          // GridPanel 이 칸마다 ""를 채워 보내므로 빈 값은 기본값(USE_TP "Y" 등, V-301)을 지킨다.
          const newRow: ObjRow = {
            ...fillBlank(base, emptyRow(systemOptions[0]?.value ?? "mcm")),
            OBJECT_ID: "",
            MENU_CNT: 0,
            PERM_CNT: 0,
            __orig: undefined,
            __snap: undefined,
            __gridTempId: addedRowKey,
            nativeeditor_status: "inserted" as RowStatus,
          };
          return [...prev, newRow];
        });
        setSelectedKey(addedRowKey);
      } else {
        // 행삭제 — 가리키는 메뉴(MENU_CNT)·퍼미션(PERM_CNT)이 있으면 차단한다(서버도 업무 예외로 거절한다).
        //   2026-11-26 — 응답의 MENU_ID(메뉴 역조회 값)로 막던 검사는 뺐다. 오브젝트는 메뉴 정보를 갖지 않는다.
        setRows((prev) => {
          const newKeys = new Set(newData.map((r) => getRowKey(r as GridRow)));
          const removed = prev.filter((r) => !newKeys.has(getRowKey(r)));
          for (const r of removed) {
            if (r.nativeeditor_status === "inserted") continue;
            if (toCount(r.MENU_CNT) > 0) {
              setError(`「${r.OBJECT_ID}」을(를) 가리키는 메뉴가 ${toCount(r.MENU_CNT)}개 있습니다. 메뉴에서 제외한 뒤 삭제하세요.`);
              return prev;
            }
            if (toCount(r.PERM_CNT) > 0) {
              setError(`「${r.OBJECT_ID}」에 퍼미션이 ${toCount(r.PERM_CNT)}건 있습니다. 퍼미션을 먼저 뺀 뒤 삭제하세요.`);
              return prev;
            }
          }
          const kept = newData as ObjRow[];
          const deleted = removed
            .filter((r) => r.nativeeditor_status !== "inserted")
            .map((r) => ({ ...r, nativeeditor_status: "deleted" as RowStatus }));
          return [...kept, ...deleted];
        });
      }
    },
    [systemOptions, setRows, setSelectedKey],
  );

  /** 상세 폼 초안 → 목록 행 (blur·행 전환·저장 직전). 같은 행이 없으면 prev 그대로. */
  const handleDetailCommit = useCallback(
    (draft: ObjRow) => setRows((prev) => applyDraft(prev, draft)),
    [setRows],
  );

  const handleRowClick = useCallback(
    (row: Record<string, unknown>) => setSelectedKey(getRowKey(row as GridRow)),
    [setSelectedKey],
  );

  // 권한 작업대에서 열기(dmes:open-with) — 첫 조회가 끝난 뒤 받은 오브젝트를 고르거나 새 행을 연다.
  useOpenWith(
    "commObjMng",
    (ow, attempt) => {
      if (ow.mode === "new") return void handleDataChange([{ __gridTempId: `__new_ow_${ow.at}`, __rowId: "" }], `__new_ow_${ow.at}`);
      const hit = rows.find((r) => r.nativeeditor_status !== "deleted" && String(r.OBJECT_ID ?? "") === ow.id);
      if (hit) return void setSelectedKey(getRowKey(hit));
      // 목록에 없으면 그 ID 로 한 번만 조회한다(고친 행이 있으면 목록을 바꾸지 않는다).
      if (!ow.id || attempt > 0 || hasAnyChanges) return;
      const f: CommObjMngFilters = { ...DEFAULT_FILTERS, edt_OBJECT_ID: ow.id };
      setFilters(f);
      void loadList(f);
      return "wait";
    },
    !isSearching && rows.length > 0,
  );

  /** B-003 저장 (fn_save / xfdl:464). V-001 ~ V-003 validation → API 호출. */
  const handleSave: () => Promise<void> = useCallback(async () => {
    // 아직 blur 가 안 일어난 입력까지 반영한다(저장 단추는 폼 밖에 있다).
    const draft = detailRef.current?.getDraft() ?? null;
    const dirty = detailRef.current?.isDirty() ?? false;
    detailRef.current?.commit();
    const effective = draft && dirty ? applyDraft(rows, draft) : rows;

    // V-001 변경 데이터 검증
    if (!effective.some((r) => r.nativeeditor_status)) {
      setError("변경된 데이터가 없습니다.");
      return;
    }
    // V-002 필수 3 컬럼 (To-Be 정책 #1: BIZ_SYSTEM_CODE 제거)
    for (const r of effective) {
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
      const payload = effective
        .filter((r) => r.nativeeditor_status)
        .map((r) => ({
          ...stripInternal(r),
          rowStatus: r.nativeeditor_status,
        })) as unknown as CommObjMngRow[];
      const res = await saveCommObjMng(payload);
      // 저장 뒤: 서버의 ds_main 은 조회 조건을 무시한 전체 목록이라, 지금 조회 조건으로 다시 조회해 목록을 채운다
      // (재조회가 실패하면 ds_main 으로 대신한다). 고르던 오브젝트를 그대로 고르고 아래 두 칸을 다시 읽는다.
      const seq = ++searchSeq.current; // 저장 전에 시작한 조회의 늦은 응답이 이 목록을 덮지 않게 한다.
      let refreshed: ObjRow[];
      try {
        refreshed = ((await searchCommObjMng(filters)).ds_main ?? []).map(toListRow);
      } catch {
        refreshed = (res.ds_main ?? []).map(toListRow);
      }
      if (seq === searchSeq.current) {
        const keepId = selected?.OBJECT_ID ? String(selected.OBJECT_ID) : "";
        setRows(refreshed);
        const keep = keepId ? refreshed.find((r) => String(r.OBJECT_ID) === keepId) : undefined;
        setSelectedKey(keep ? getRowKey(keep) : null);
        reloadPanels();
      }
      // M-006 / V-702 — "성공적으로 저장되었습니다." + 영향(뺀 값·사용 안 함이 퍼미션에 미친 건수, 서버 집계)
      const lines = impactLines(res.impacts ?? []);
      if (lines.length > 0) {
        showMessage({
          alertType: "warning",
          title: "저장 영향",
          message: `${res.cnt_merge ?? 0}건 저장되었습니다.\n${lines.join("\n")}`,
        });
      } else {
        showMessage({ message: `${res.cnt_merge ?? 0}건 저장되었습니다.` });
      }
    } catch (e) {
      // 서버 거절은 "CODE: 상세" 형식(예: PERM_TOO_LONG: …) — 그대로 보인다.
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setIsSaving(false);
    }
  }, [rows, selected, filters, showMessage, setRows, setSelectedKey, reloadPanels]);

  const isBusy = isSearching || isSaving;

  // 2026-06-02 W5 pattern E — AsIs xfdl:279 commonTop 4 버튼 정합 (btn_search/btn_reset/btn_save/btn_close).
  //   사전 disabled 는 isSearching||isSaving 만 (double-click 방지). 핸들러가 V-NNN 검증 후 ErrorModal 차단.
  const pageButtons = useMemo<PageButton[]>(
    () => [
      { id: "btn_search", label: "조회", onClick: handleSearch, type: "primary" as const, disabled: isBusy, action: "search" },
      { id: "btn_reset", label: "초기화", onClick: handleReset, disabled: isBusy, action: "cancel" },
      { id: "btn_save", label: "저장", onClick: () => void handleSave(), type: "save" as const, disabled: isBusy, action: "save" },
    ],
    [isBusy, handleSearch, handleReset, handleSave],
  );

  const gridButtons = useMemo(
    () => [
      {
        id: "btn_rowCancel",
        label: "행취소",
        onClick: handleRowCancel,
        disabled: isBusy || !hasAnyChanges,
      },
    ],
    [handleRowCancel, isBusy, hasAnyChanges],
  );

  return (
    <PageLayout
      title="OBJECT 관리"
      breadcrumb="공통관리 > 시스템관리 > OBJECT 관리"
      objId="commObjMng"
      buttons={pageButtons}
    >
      <SearchArea onSearch={handleSearch} autoSearch>
        <SearchField
          label="메뉴 폴더"
          defaultKey="menuFolderId"
          type="select"
          options={folderOptions}
          value={filters.menuFolderId ?? ""}
          onChange={(v) => handleFilterChange("menuFolderId", v)}
        />
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
        <SearchField
          label="SYSTEM"
          name="SYSTEM_CODE"
          type="select"
          options={systemSearchOptions}
          value={filters.cbo_SYSTEM_CODE ?? ""}
          onChange={(v) => handleFilterChange("cbo_SYSTEM_CODE", v)}
        />
        <SearchField
          label="OBJECT TYPE"
          name="OBJECT_TYPE"
          value={filters.edt_OBJECT_TYPE ?? ""}
          onChange={(v) => handleFilterChange("edt_OBJECT_TYPE", v)}
        />
        <SearchField
          label="접속 경로"
          name="ACCESS_TP"
          type="select"
          options={ACCESS_TP_SEARCH_OPTIONS}
          value={filters.cbo_ACCESS_TP ?? ""}
          onChange={(v) => handleFilterChange("cbo_ACCESS_TP", v)}
        />
      </SearchArea>

      <ContentBody root direction="column" resizable storageKey="mcm.csa.commObjMng">
        {/* 위: 목록(남는 폭) + 상세 */}
        <ContentBody resizable storageKey="mcm.csa.commObjMng.top" height="60%">
          <ContentPanel minSize={320}>
            <GridPanel
              title="OBJECT 목록"
              count={visibleCount}
              showAddButton
              showCopyButton
              showDeleteButton
              buttons={gridButtons}
              data={rows}
              rowKey="__rowId"
              columns={MASTER_COLUMNS}
              selectedRowKey={selectedKey}
              onDataChange={handleDataChange}
              loading={isSaving}
            >
              <AgDataGrid
                gridId="main"
                columnSizing="fit"
                columns={MASTER_COLUMNS}
                data={rows}
                rowKey="__rowId"
                sortable
                stopEditingWhenCellsLoseFocus={false}
                highlightedRowKey={selectedKey}
                onRowClick={handleRowClick}
                loading={isSearching}
                loadingMessage="조회 중..."
                emptyMessage="조회된 OBJECT 가 없습니다."
              />
            </GridPanel>
          </ContentPanel>
          <ContentPanel width={460} scrollY>
            <ObjDetailForm
              ref={detailRef}
              row={selected}
              onCommit={handleDetailCommit}
              systemOptions={systemOptions}
              perm={panels.perm}
              disabled={isSaving}
            />
          </ContentPanel>
        </ContentBody>

        {/* 아래: 이 오브젝트의 퍼미션(읽기 전용) + 이 오브젝트를 가리키는 메뉴 */}
        <ContentBody resizable storageKey="mcm.csa.commObjMng.bottom" height="40%">
          <ContentPanel minSize={320}>
            <PermPanel rows={panels.perm.rows} loading={panels.loading} error={panels.permError} />
          </ContentPanel>
          <ContentPanel minSize={320}>
            <MenuPanel rows={panels.menus} loading={panels.loading} error={panels.menuError} />
          </ContentPanel>
        </ContentBody>
      </ContentBody>

      <ErrorModal message={error} onClose={() => setError(null)} />
    </PageLayout>
  );
}
