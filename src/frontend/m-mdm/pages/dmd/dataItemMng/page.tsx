"use client";

/**
 * dataItemMng — 항목 편집 화면(05 「화면」 항목 관리, TSK-07-03 design.md §2). D-104 로 카테고리 편집(dataCateEdit)과
 * 항목 이력(dataHistory) 화면을 합치고 메뉴 이름을 「항목 편집」으로 바꿨다(D-101 codeItemEdit 선례).
 *
 * 본문은 좌우 분할이다. 왼쪽 탭 [항목]·[트리]·[카테고리], 오른쪽 열은 탭에 따라 바뀐다 — 항목·트리 탭은 등록 폼과 고른 행의
 * 이력, 카테고리 탭은 REGEX 미리보기와 고른 카테고리의 카테고리·소속 이력이다.
 *
 * 마루 데이터를 고르면 머리(view)로 동적 열(계층 1차~lvl_cnt차, 라벨 있는 추가 컬럼, Q5)을 만들고 서버 페이징(search)으로
 * 한 쪽을 받는다. 열린 행의 칸은 그 자리에서 고치고 행의 「저장」으로 1건을 저장한다. 행마다 닫기·다시 열기·이력 버튼이
 * 있다. EXTERNAL 원천이거나 DEPRECATED 면 조회 전용이다(Q6) — 카테고리 탭도 편집을 막는다. 저장 방식은 합치기 전 그대로다:
 * 상단 [저장] 없이 항목은 행마다, 카테고리는 등록·닫기·다시 열기·REGEX 저장·TABLE 적용마다 각 서비스를 바로 부른다.
 *
 * 충돌 문구("다른 사용자가 수정했습니다")를 받으면 안내를 보이고 목록을 다시 부른다(F1, 수용 기준 4). 「이력」은 오른쪽
 * 이력 패널에 같은 타임라인 컴포넌트로 연다(D8).
 *
 * 트리 보기·CSV 업로드(TSK-07-04 design.md §2): 트리는 그리드 페이징과 별개로 `searchDataItems(..., withTree=true)` 로
 * 받는다(§2 "별도(비페이징) 조회"). 트리에서 "이 노드로 보기"를 누르면 `nodeFilter` 를 검색 조건에 실어 그리드를 다시
 * 조회하고 칩으로 보인다. "CSV 업로드" 버튼은 `dataCsvUploadPop` 의 OBJECT_ID 로 판정한다(팝업 버튼은 팝업의 OBJECT_ID).
 *
 * 진입 마루 데이터는 handoff(openMdmPage, 한 번) > snapshot > 첫 항목 순서로 정하고, 고른 값은 snapshot 에 남긴다(§6.10).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ContentBody,
  ContentPanel,
  DETAIL_LABEL_CELL,
  DETAIL_TABLE_STYLE,
  DETAIL_VALUE_CELL,
  ErrorModal,
  SearchArea,
  SearchField,
  canDoButton,
  useUserButtonRbac,
} from "@dk-oasis/shared/layout";
import { AgDataGrid, GridBadge, GridPanel, Pagination } from "@dk-oasis/shared/grid";
import { Button, Input, Select } from "@dk-oasis/shared/form";
import { Tabs } from "@dk-oasis/shared/tabs";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { IdPicker, MdmPageLayout, filterIdPicks, useMdmPageParams } from "@/shell";

import { DataCsvUploadPopModal, OBJ_ID as CSV_UPLOAD_OBJ_ID } from "../dataCsvUploadPop";
import { CategoryTab } from "./cate/CategoryTab";
import { PreviewPanel as CatePreviewPanel } from "./cate/components/PreviewPanel";
import { useDataCategories } from "./cate/useDataCategories";
import { CategoryHistoryPanel } from "./history/CategoryHistoryPanel";
import { DataHistoryTimeline } from "./history/DataHistoryTimeline";
import { searchDataHistory } from "./history/api";
import type { DataHistoryResult } from "./history/types";
import { ItemTreePanel } from "./ItemTreePanel";
import {
  closeDataItem,
  modifyDataItem,
  registerDataItem,
  reopenDataItem,
  searchDataItems,
  viewDataItems,
} from "./api";
import { buildItemColumns, isRowEditable, isRowVersionConflict, toSaveParams } from "./columns";
import {
  LVL_FIELDS,
  PAGE_SIZE,
  emptyFilters,
  emptyItemForm,
  errorMessage,
  toMaruPicks,
  type AttrField,
  type DataItemFilters,
  type DataItemForm,
  type DataItemHeader,
  type DataItemRow,
  type MaruDataOption,
} from "./types";

const SCREEN_ID = "dataItemMng";
const COMPONENT_PATH = "dmd/dataItemMng";
/** 마루 데이터 고르기 후보 건수 — 룰·세트·코드 고르기와 같은 20건. */
const MARU_PICK_LIMIT = 20;
/** 카테고리 쓰기 권한 OBJECT — 합치기 전 카테고리 편집 화면의 키를 그대로 쓴다(D-104). */
const CATE_OBJ_ID = "dataCateEdit";

type Draft = Record<string, unknown>;
/** 쓰기를 시작할 때의 마루 데이터와 선택 순번(selectSeq). */
interface WriteOrigin {
  md: string;
  seq: number;
}
export type ItemTab = "grid" | "tree" | "cate";

const panelTitle = { fontWeight: 600, color: "var(--color-text-secondary)" } as const;
const hint = { color: "var(--color-text-muted)", margin: 0 } as const;

interface DataItemMngPageProps {
  tabId?: string;
  snapshot?: unknown;
  onSnapshotChange?: (snapshot: unknown) => void;
}

function snapshotMaruDataId(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const id = (snapshot as Record<string, unknown>).maruDataId;
  return typeof id === "string" && id ? id : null;
}

export default function DataItemMngPage({ tabId, snapshot, onSnapshotChange }: DataItemMngPageProps = {}) {
  const rbac = useUserButtonRbac(true);
  const { showMessage } = useMessage();

  const [options, setOptions] = useState<MaruDataOption[]>([]);
  const [filters, setFilters] = useState<DataItemFilters>(emptyFilters);
  const [header, setHeader] = useState<DataItemHeader | null>(null);
  const [rows, setRows] = useState<DataItemRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [form, setForm] = useState<DataItemForm | null>(null);
  const [history, setHistory] = useState<DataHistoryResult | null>(null);
  const [busy, setBusy] = useState(false);
  // 목록 조회 전용 — 그리드 로딩 표시는 이것만 본다(행 쓰기·이력 조회로 목록이 깜빡이지 않게, Local-Rules §11).
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<ItemTab>("grid");
  const [tree, setTree] = useState<DataItemRow[]>([]);
  const [treeTruncated, setTreeTruncated] = useState(false);
  const [treeLoading, setTreeLoading] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);

  /** 마지막으로 조회한 조건·쪽 — 쪽 이동과 재조회(F1)가 쓴다. */
  const applied = useRef<{ filters: DataItemFilters; page: number }>({ filters: emptyFilters(), page: 0 });
  /** 요청 순번 — 늦게 도착한 옛 응답(예: 첫 로드의 자동 선택 조회)이 새 결과를 덮지 않게 한다. */
  const searchSeq = useRef(0);
  const selectSeq = useRef(0);
  const treeSeq = useRef(0);
  const historySeq = useRef(0);
  /** 지금 탭 — 마루 데이터를 바꾼 콜백이 트리를 다시 읽을지 본다. */
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const handedOff = useRef(false);
  /** 선택(selectMaruData)의 view 가 마루 데이터 목록을 채웠는지 — 마운트 때 목록 응답이 더 늦게 와도 덮지 않게. */
  const optionsFromSelect = useRef(false);
  /** 이력 패널에 보이는 항목 키 — 쓰기 응답 때 클로저 값 대신 지금 값을 본다. */
  const historyKeyRef = useRef<string | undefined>(undefined);
  historyKeyRef.current = history?.key;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const refreshHeader = useCallback(async () => {
    const md = applied.current.filters.maruDataId;
    if (!md) return;
    const seq = selectSeq.current;
    try {
      const view = await viewDataItems(md);
      if (seq === selectSeq.current) setHeader(view.header ?? null);
    } catch {
      // 조회조건의 카테고리 목록만 늦게 맞춰질 뿐이라 알리지 않는다 — 다음 선택·조회 때 다시 읽는다.
    }
  }, []);

  const cate = useDataCategories({
    maruDataId: filters.maruDataId,
    active: tab === "cate",
    onError: setError,
    onChanged: () => void refreshHeader(),
  });
  const { invalidate: invalidateCategories, reload: reloadCategories } = cate;

  const runSearch = useCallback(async (f: DataItemFilters, p: number) => {
    if (!f.maruDataId) return;
    const seq = ++searchSeq.current;
    setListLoading(true);
    try {
      const res = await searchDataItems(f, p, PAGE_SIZE);
      if (seq !== searchSeq.current) return;
      setRows(res.list ?? []);
      setTotal(res.totalCount ?? 0);
      setPage(res.page ?? p);
      setDrafts({});
      applied.current = { filters: f, page: res.page ?? p };
    } catch (e) {
      if (seq === searchSeq.current) setError(errorMessage(e));
    } finally {
      if (seq === searchSeq.current) setListLoading(false);
    }
  }, []);

  const reload = useCallback(
    () => runSearch(applied.current.filters, applied.current.page),
    [runSearch],
  );

  /**
   * 트리는 그리드 페이징과 별개 조회다(design.md §2) — `list`/`totalCount` 는 무시하고 `tree`/`treeTruncated` 만 쓴다.
   * `size` 는 최소값(1)으로 보낸다(그리드 목록 자체는 필요 없다).
   */
  const loadTree = useCallback(async (maruDataId: string) => {
    if (!maruDataId) {
      setTree([]);
      setTreeTruncated(false);
      return;
    }
    const seq = ++treeSeq.current;
    setTreeLoading(true);
    try {
      const res = await searchDataItems({ ...emptyFilters(), maruDataId }, 0, 1, true);
      if (seq !== treeSeq.current) return;
      setTree(res.tree ?? []);
      setTreeTruncated(res.treeTruncated ?? false);
    } catch (e) {
      if (seq === treeSeq.current) setError(errorMessage(e));
    } finally {
      if (seq === treeSeq.current) setTreeLoading(false);
    }
  }, []);

  const changeTab = useCallback(
    (next: ItemTab) => {
      setTab(next);
      if (next === "tree") void loadTree(applied.current.filters.maruDataId);
    },
    [loadTree],
  );

  const viewNode = useCallback(
    (value: string) => {
      const next = { ...filters, nodeFilter: value };
      setFilters(next);
      setTab("grid");
      void runSearch(next, 0);
    },
    [filters, runSearch],
  );

  const clearNodeFilter = useCallback(() => {
    const next = { ...filters, nodeFilter: null };
    setFilters(next);
    void runSearch(next, 0);
  }, [filters, runSearch]);

  const loadHistory = useCallback(async (maruDataId: string, code: string) => {
    const seq = ++historySeq.current;
    const out = await searchDataHistory({ maruDataId, target: "ITEM", cateId: "", key: code });
    if (seq === historySeq.current) setHistory(out);
  }, []);

  /** 쓰기 실패 — 문구를 그대로 보이고, 충돌이면 목록을 다시 부른다(F1). */
  const handleWriteError = useCallback(
    async (e: unknown) => {
      const message = errorMessage(e);
      setError(message);
      if (isRowVersionConflict(message)) {
        await reload();
      }
    },
    [reload],
  );

  /**
   * 쓰기 성공 뒤. `origin` 은 쓰기를 시작할 때의 마루 데이터·선택 순번이다 — 응답을 기다리는 사이 마루 데이터가 바뀌었으면
   * (조회조건 변경·handoff) 이전 데이터의 이력·트리를 새 데이터 화면에 그리지 않게 둘 다 건너뛴다. 목록 재조회는 지금
   * 데이터(applied)로 하므로 그대로 한다. 이력·트리 판정은 클로저 값이 아니라 ref 로 본다.
   */
  const afterWrite = useCallback(
    async (origin: WriteOrigin, code: string, message: string) => {
      showMessage({ message, toast: true });
      // 항목이 바뀌면 카테고리 건수·TABLE 후보도 바뀐다 — 카테고리 탭에 다시 들어갈 때 새로 읽는다.
      invalidateCategories();
      await reload();
      if (origin.seq !== selectSeq.current) return;
      if (historyKeyRef.current === code) await loadHistory(origin.md, code);
      if (origin.seq !== selectSeq.current) return;
      if (tabRef.current === "tree") await loadTree(origin.md);
    },
    [invalidateCategories, loadHistory, loadTree, reload, showMessage],
  );

  /** CSV 저장 뒤(design.md §2) — 팝업이 부른다. 목록·(보이는 중이면) 트리를 다시 부른다. */
  const afterCsvSaved = useCallback(async () => {
    invalidateCategories();
    await reload();
    if (tabRef.current === "tree") await loadTree(applied.current.filters.maruDataId);
  }, [invalidateCategories, loadTree, reload]);

  /** 마루 데이터를 고르는 유일한 길(조회조건·handoff·snapshot·첫 항목). 탭은 그대로 두고 세 탭을 모두 그 데이터로 다시 읽는다. */
  const selectMaruData = useCallback(
    async (maruDataId: string) => {
      const seq = ++selectSeq.current;
      const next = { ...emptyFilters(), maruDataId };
      setFilters(next);
      applied.current = { filters: next, page: 0 };
      setForm(null);
      historySeq.current++;
      setHistory(null);
      setRows([]);
      setTotal(0);
      setTree([]);
      setTreeTruncated(false);
      searchSeq.current++;
      treeSeq.current++;
      const base = { ...((snapshotRef.current as Record<string, unknown> | null) ?? {}) };
      if (maruDataId) base.maruDataId = maruDataId;
      else delete base.maruDataId;
      onSnapshotChange?.(base);
      if (!maruDataId) {
        setHeader(null);
        return;
      }
      try {
        const view = await viewDataItems(maruDataId);
        if (seq !== selectSeq.current) return;
        // view 는 마루 데이터를 줘도 선택 목록을 늘 함께 준다 — 이미 열린 탭이 handoff 로 방금 등록된 데이터를 받거나
        // 이름이 바뀐 뒤에도 조회조건의 고르기(`IdPicker`)가 그 데이터를 제 이름으로 찾게 목록을 새로 채운다.
        optionsFromSelect.current = true;
        setOptions(view.maruDataOptions ?? []);
        setHeader(view.header ?? null);
      } catch (e) {
        if (seq === selectSeq.current) setError(errorMessage(e));
        return;
      }
      if (tabRef.current === "tree") void loadTree(maruDataId);
      await runSearch(next, 0);
    },
    [loadTree, onSnapshotChange, runSearch],
  );

  // 진입 값: handoff(마운트 때·자기 탭 재활성화 때마다) > snapshot > 첫 항목. 이 훅은 아래 첫 조회 effect 보다 먼저
  // 불러야 같은 커밋에서 handoff 가 먼저 표시된다. 마루 데이터 화면의 [항목 편집]이 넘기므로 [항목] 탭으로 연다.
  useMdmPageParams(COMPONENT_PATH, tabId, (params) => {
    if (!params.maruDataId) return;
    handedOff.current = true;
    setTab("grid");
    void selectMaruData(params.maruDataId);
  });

  useEffect(() => {
    void (async () => {
      try {
        const view = await viewDataItems();
        const list = view.maruDataOptions ?? [];
        // handoff 선택이 먼저 끝나 더 새 목록을 채웠으면 덮지 않는다.
        if (!optionsFromSelect.current) setOptions(list);
        if (handedOff.current) return;
        const fromSnapshot = snapshotMaruDataId(snapshotRef.current);
        const first = fromSnapshot && list.some((o) => o.maruDataId === fromSnapshot) ? fromSnapshot : list[0]?.maruDataId;
        if (first) await selectMaruData(first);
      } catch (e) {
        setError(errorMessage(e));
      }
    })();
    // 마운트 때 한 번 — selectMaruData 는 onSnapshotChange 가 바뀌면 새로 만들어지지만 첫 선택을 다시 하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 행 동작 ─────────────────────────────────────────────────────────────

  const rowAction = useCallback(
    async (row: Record<string, unknown>, action: "save" | "close" | "reopen" | "history") => {
      const md = applied.current.filters.maruDataId;
      const origin: WriteOrigin = { md, seq: selectSeq.current };
      const code = String(row.code ?? "");
      const rowVersion = Number(row.rowVersion ?? 0);
      setBusy(true);
      try {
        if (action === "save") {
          await modifyDataItem(toSaveParams(md, row));
          await afterWrite(origin, code, "저장했습니다");
        } else if (action === "close") {
          await closeDataItem(md, code, rowVersion);
          await afterWrite(origin, code, "닫았습니다");
        } else if (action === "reopen") {
          await reopenDataItem(md, code, rowVersion);
          await afterWrite(origin, code, "다시 열었습니다");
        } else {
          await loadHistory(md, code);
        }
      } catch (e) {
        await handleWriteError(e);
      } finally {
        setBusy(false);
      }
    },
    [afterWrite, handleWriteError, loadHistory],
  );

  const cancelDraft = useCallback((code: string) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[code];
      return next;
    });
  }, []);

  const canSave = canDoButton(rbac, SCREEN_ID, "save");
  const canClose = canDoButton(rbac, SCREEN_ID, "delete");
  const canReopen = canDoButton(rbac, SCREEN_ID, "restore");
  const canReg = canDoButton(rbac, SCREEN_ID, "reg");
  // 팝업을 여는 버튼 — 팝업 자신의 OBJECT_ID 로 판정한다(design.md §2). 상단 바에 있을 때 PageButton.objId 가 하던 판정이다.
  const canCsv = canDoButton(rbac, CSV_UPLOAD_OBJ_ID, "save");
  const canCateSave = canDoButton(rbac, CATE_OBJ_ID, "save");
  const editable = !!header?.editable;

  const renderActions = useCallback(
    (row: Record<string, unknown>) => {
      const code = String(row.code ?? "");
      const hasDraft = !!drafts[code];
      const historyButton = (
        <Button size="mini" data-testid={`item-history-${code}`} onClick={() => void rowAction(row, "history")}>
          이력
        </Button>
      );
      if (editable && row.open === true && hasDraft) {
        return (
          <span style={{ display: "inline-flex", gap: "var(--spacing-xs)" }}>
            <Button
              size="mini"
              variant="primary"
              data-testid={`item-save-${code}`}
              disabled={busy || !canSave}
              onClick={() => void rowAction(row, "save")}
            >
              저장
            </Button>
            <Button size="mini" data-testid={`item-cancel-${code}`} onClick={() => cancelDraft(code)}>
              취소
            </Button>
          </span>
        );
      }
      if (editable && row.open === true) {
        return (
          <span style={{ display: "inline-flex", gap: "var(--spacing-xs)" }}>
            <Button
              size="mini"
              data-testid={`item-close-${code}`}
              disabled={busy || !canClose}
              onClick={() => void rowAction(row, "close")}
            >
              닫기
            </Button>
            {historyButton}
          </span>
        );
      }
      if (editable) {
        return (
          <span style={{ display: "inline-flex", gap: "var(--spacing-xs)" }}>
            <Button
              size="mini"
              data-testid={`item-reopen-${code}`}
              disabled={busy || !canReopen}
              onClick={() => void rowAction(row, "reopen")}
            >
              다시 열기
            </Button>
            {historyButton}
          </span>
        );
      }
      return historyButton;
    },
    [busy, canClose, canReopen, canSave, cancelDraft, drafts, editable, rowAction],
  );

  const columns = useMemo(() => buildItemColumns(header, { renderActions }), [header, renderActions]);

  const gridRows = useMemo(
    () => rows.map((r) => ({ ...r, ...(drafts[r.code] ?? {}) }) as Record<string, unknown>),
    [rows, drafts],
  );

  const handleCellChange = useCallback(
    (p: { rowKey: string | number; field: string; newValue: unknown; row: Record<string, unknown> }) => {
      if (!isRowEditable(header, p.row)) return;
      const code = String(p.rowKey);
      setDrafts((prev) => ({ ...prev, [code]: { ...(prev[code] ?? {}), [p.field]: p.newValue ?? "" } }));
    },
    [header],
  );

  // ── 등록 패널 ───────────────────────────────────────────────────────────

  const handleRegister = useCallback(async () => {
    if (!form) return;
    const md = applied.current.filters.maruDataId;
    const origin: WriteOrigin = { md, seq: selectSeq.current };
    setBusy(true);
    try {
      const params = toSaveParams(md, form);
      await registerDataItem(params);
      if (origin.seq === selectSeq.current) setForm(null);
      await afterWrite(origin, String(params.code ?? ""), "등록했습니다");
    } catch (e) {
      await handleWriteError(e);
    } finally {
      setBusy(false);
    }
  }, [afterWrite, form, handleWriteError]);

  const formFields = useMemo(() => {
    const fields: { key: keyof DataItemForm; label: string }[] = [
      { key: "code", label: "키 *" },
      { key: "name", label: "이름 *" },
      { key: "alterName", label: "약칭" },
      { key: "seq", label: "순서" },
      { key: "description", label: "설명" },
    ];
    LVL_FIELDS.slice(0, Math.max(0, Math.min(5, header?.lvlCnt ?? 0))).forEach((f, i) =>
      fields.push({ key: f, label: `${i + 1}차` }),
    );
    for (const label of header?.attrLabels ?? []) {
      fields.push({ key: label.field as AttrField, label: label.label });
    }
    return fields;
  }, [header]);

  const maruPicks = useMemo(() => toMaruPicks(options), [options]);
  // 서버에 마루 데이터 검색이 없어 view 가 준 선택 목록을 화면에서 거른다(ID·이름 부분 일치, 코드 고르기와 같은 규칙).
  const searchMaruPicks = useCallback(
    async (keyword: string) => filterIdPicks(maruPicks, keyword, MARU_PICK_LIMIT),
    [maruPicks],
  );
  const cateOptions = useMemo(
    () => [
      { value: "", label: "전체" },
      ...(header?.categories ?? [])
        .filter((c) => c.cateId !== "BASE")
        .map((c) => ({ value: c.cateId, label: `${c.cateName ?? c.cateId} (${c.cateId})` })),
    ],
    [header],
  );

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const working = busy || listLoading;

  const handleSearch = () => {
    void runSearch(filters, 0);
    if (tab === "tree") void loadTree(filters.maruDataId);
    if (tab === "cate") void reloadCategories();
  };

  return (
    <MdmPageLayout
      group="dmd"
      screenId={SCREEN_ID}
      title="항목 편집"
      buttons={[
        {
          id: "btn_search",
          label: "조회",
          onClick: handleSearch,
          type: "primary" as const,
          disabled: working || !filters.maruDataId,
          action: "search",
        },
      ]}
    >
      <SearchArea onSearch={handleSearch}>
        <SearchField label="마루 데이터" className="span-2">
          <IdPicker
            placeholder="데이터 ID·데이터명"
            noun="마루 데이터"
            testId="item-pick"
            search={searchMaruPicks}
            limit={MARU_PICK_LIMIT}
            onPick={(id) => void selectMaruData(id)}
            onError={setError}
            inputWidth={150}
          />
          {header && (
            <span data-testid="item-current" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
              {`${header.maruDataId} ${header.maruDataName}`}
            </span>
          )}
        </SearchField>
        <SearchField label="키">
          <Input
            data-testid="item-search-code"
            aria-label="키"
            value={filters.code}
            onChange={(v) => setFilters((prev) => ({ ...prev, code: v }))}
          />
        </SearchField>
        <SearchField label="이름">
          <Input
            data-testid="item-search-name"
            aria-label="이름"
            value={filters.name}
            onChange={(v) => setFilters((prev) => ({ ...prev, name: v }))}
          />
        </SearchField>
        <SearchField label="카테고리">
          <Select
            data-testid="item-search-cate"
            aria-label="카테고리"
            value={filters.cateId}
            options={cateOptions}
            onChange={(v) => setFilters((prev) => ({ ...prev, cateId: v }))}
          />
        </SearchField>
        {/* 05 「화면」 "닫힌 항목 보기". 조회영역 안 Checkbox 는 shared page-layout.css 가 네모를 지워 Select 로 둔다. */}
        <SearchField label="닫힌 항목">
          <Select
            data-testid="item-search-closed"
            aria-label="닫힌 항목 보기"
            value={filters.showClosed ? "Y" : "N"}
            options={[
              { value: "N", label: "숨김" },
              { value: "Y", label: "보기" },
            ]}
            onChange={(v) => setFilters((prev) => ({ ...prev, showClosed: v === "Y" }))}
          />
        </SearchField>
      </SearchArea>

      {/* 저장 키를 새로 둔다 — 옛 "mdm.dmd.dataItemMng" 는 위아래(column) 분할의 저장값이라 좌우 폭으로 읽으면 어긋난다. */}
      <ContentBody root resizable storageKey="mdm.dmd.dataItemMng.split">
        <ContentPanel>
          <div data-testid="item-list" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <Tabs
              activeKey={tab}
              onChange={(k) => changeTab(k as ItemTab)}
              items={[
                { key: "grid", label: <span data-testid="item-tab-grid">항목</span> },
                { key: "tree", label: <span data-testid="item-tab-tree">트리</span> },
                { key: "cate", label: <span data-testid="item-tab-cate">카테고리</span> },
              ]}
            />
            {tab === "grid" && (
              <>
                <GridPanel
                  title={header ? `항목 — ${header.maruDataName}` : "항목"}
                  count={total}
                  titleExtra={
                    filters.nodeFilter ? (
                      <span data-testid="item-node-filter-chip" style={{ display: "inline-flex", gap: "var(--spacing-xs)" }}>
                        <GridBadge label={`${filters.nodeFilter} 아래`} strong />
                        <Button data-testid="item-node-filter-clear" size="mini" onClick={clearNodeFilter}>
                          ✕ 거르기 풀기
                        </Button>
                      </span>
                    ) : undefined
                  }
                  headerExtra={
                    <span style={{ display: "inline-flex", gap: "var(--spacing-xs)" }}>
                      <Button
                        size="sm"
                        data-testid="item-add"
                        disabled={working || !editable || !canReg}
                        onClick={() => setForm(emptyItemForm())}
                      >
                        항목 추가
                      </Button>
                      <Button
                        size="sm"
                        data-testid="item-csv-upload"
                        disabled={working || !editable || !filters.maruDataId || !canCsv}
                        onClick={() => setCsvOpen(true)}
                      >
                        CSV 업로드
                      </Button>
                    </span>
                  }
                >
                  {/* 안내 문구와 그리드를 한 세로 흐름에 두어 그리드가 남은 높이만 쓰게 한다. */}
                  <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                    {header && !header.editable && (
                      <p data-testid="item-readonly" style={{ color: "var(--color-text-muted)", margin: 0 }}>
                        조회 전용입니다(원천 {header.sourceSystem ?? header.sourceKind}, 상태 {header.status}).
                      </p>
                    )}
                    <div style={{ flex: 1, minHeight: 0 }}>
                      <AgDataGrid
                        columns={columns}
                        data={gridRows}
                        rowKey="code"
                        sortable={false}
                        columnSizing="fit"
                        singleClickEdit
                        onCellValueChanged={handleCellChange}
                        loading={listLoading}
                        loadingMessage="조회 중..."
                        emptyMessage="조회된 항목이 없습니다."
                      />
                    </div>
                  </div>
                </GridPanel>
                {/* 쪽 이동은 그리드 패널 밖에 둔다. 안에 두면 높이 100% 그리드가 이전/다음 버튼을 덮는다. */}
                <div style={{ flexShrink: 0 }}>
                  <Pagination
                    page={page}
                    totalPages={totalPages}
                    totalElements={total}
                    onPageChange={(p) => void runSearch(applied.current.filters, p)}
                    disabled={working}
                  />
                </div>
              </>
            )}
            {tab === "tree" && (
              <div style={{ flex: 1, minHeight: 0 }}>
                <ItemTreePanel rows={tree} truncated={treeTruncated} loading={treeLoading} onViewNode={viewNode} />
              </div>
            )}
            {tab === "cate" && (
              // 카테고리 쓰기는 합치기 전 카테고리 편집 화면 OBJECT(dataCateEdit)의 save 권한으로 판정한다(D-104).
              <CategoryTab cate={cate} loaded={!!header} editable={editable} canSave={canCateSave} />
            )}
          </div>
        </ContentPanel>

        {/* 오른쪽 열 — 탭마다 내용이 바뀐다. 조건부 패널에는 key 를 주어 분할 저장값이 다른 패널로 옮겨 가지 않게 한다. */}
        <ContentBody direction="column" width="34%" resizable storageKey="mdm.dmd.dataItemMng.right">
          {tab !== "cate" && form && (
            <ContentPanel key="form">
              <div data-testid="item-form" style={{ height: "100%", overflowY: "auto" }}>
                <p style={{ ...panelTitle, padding: "0 var(--spacing-md)" }}>항목 추가</p>
                <table style={DETAIL_TABLE_STYLE}>
                  <tbody>
                    {formFields.map((f) => (
                      <tr key={f.key}>
                        <th style={DETAIL_LABEL_CELL}>{f.label}</th>
                        <td style={DETAIL_VALUE_CELL}>
                          <Input
                            data-testid={`item-form-${f.key}`}
                            value={form[f.key]}
                            disabled={busy}
                            onChange={(v) => setForm((prev) => (prev ? { ...prev, [f.key]: v } : prev))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: "flex", gap: "var(--spacing-sm)", padding: "var(--spacing-sm) var(--spacing-md)" }}>
                  <Button
                    variant="primary"
                    data-testid="item-form-submit"
                    disabled={busy || !canReg}
                    onClick={() => void handleRegister()}
                  >
                    등록
                  </Button>
                  <Button data-testid="item-form-cancel" onClick={() => setForm(null)}>
                    취소
                  </Button>
                </div>
              </div>
            </ContentPanel>
          )}
          {tab !== "cate" && (
            <ContentPanel key="itemHistory">
              <div data-testid="item-history" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={panelTitle}>{history ? `이력 — ${history.key}` : "이력"}</span>
                  {history && (
                    <Button size="mini" data-testid="item-history-close" onClick={() => setHistory(null)}>
                      이력 닫기
                    </Button>
                  )}
                </div>
                {history ? (
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <DataHistoryTimeline result={history} />
                  </div>
                ) : (
                  <p data-testid="item-history-empty" style={hint}>행의 [이력] 을 누르면 여기에 보입니다</p>
                )}
              </div>
            </ContentPanel>
          )}
          {tab === "cate" && (
            <ContentPanel key="catePreview">
              <CatePreviewPanel defKind={cate.selectedRow?.defKind ?? null} preview={cate.preview} />
            </ContentPanel>
          )}
          {tab === "cate" && (
            <ContentPanel key="cateHistory">
              <CategoryHistoryPanel
                maruDataId={filters.maruDataId}
                cateId={cate.selectedCateId}
                refreshToken={cate.writeCount}
                onError={setError}
              />
            </ContentPanel>
          )}
        </ContentBody>
      </ContentBody>

      {error && <ErrorModal message={error} onClose={() => setError(null)} />}

      {header && (
        <DataCsvUploadPopModal
          open={csvOpen}
          maruDataId={filters.maruDataId}
          maruDataName={header.maruDataName}
          lvlCnt={header.lvlCnt}
          attrLabels={header.attrLabels}
          onClose={() => setCsvOpen(false)}
          onSaved={() => void afterCsvSaved()}
        />
      )}
    </MdmPageLayout>
  );
}
