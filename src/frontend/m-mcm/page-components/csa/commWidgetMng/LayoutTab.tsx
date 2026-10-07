"use client";

/**
 * 위젯관리 「기본 배치」 탭 — 전사(*)·부서별 「홈」 기본 배치와 기본 탭 편집(스펙 2026-10-02-widget-admin-generic §10.2, widget-tabs 설계 §4).
 * - 왼쪽: 배치 목록(searchLayouts). 전사는 행이 없어도 첫 줄, [부서 추가]로 고른 부서는 저장 전 줄로 끼운다. 기본 탭 수(tabCount)도 보인다.
 * - 오른쪽: 고른 키의 보드 = 다중 탭 WidgetWorkspace mode="admin" + 관리자 어댑터 store(layout-store). 「홈」 [완료] 는 saveLayout,
 *   그 밖의 탭(기본 탭, 키당 5개)은 saveDefaultTab·deleteDefaultTab·reorderDefaultTabs. [기본 배치 지우기] 는 deleteLayout(홈과 기본 탭 모두).
 * - 등록부는 코드 등록부 + 유형 등록부 + widgetDef/list 를 mergeWidgetRegistry 로 합친다. 정의 조회 전에는 보드를 마운트하지 않고(정의 위젯이 「없는 위젯」으로
 *   보이는 상태의 저장은 배치에서 지운다 — W-D19), 실패하면 코드 등록부로 마운트하되 registryStatus="error" 로 편집을 막는다.
 * - 전사 배치(홈·탭)는 모든 사용자에게, 부서 배치는 그 부서와 하위 부서 사용자에게 고정 탭으로 보인다(위젯 고정 탭 2026-10-07).
 *   부서 키는 위 부서·전사를 물려받지 않고 빈 배치에서 시작하며(loadLayout effective=N), 「홈」 탭 이름은 부서명(대표 탭)으로 보인다.
 * - 보드는 WidgetBoardModeContext("preview")로 감싼다 — 실제 칸을 그리므로 개인 메모 위젯이 관리자 본인 메모를 불러오거나 저장하지 않게 미리보기처럼
 *   다루게 한다(스펙 §17.5). 위젯 본체는 shared WidgetFrame 이 같은 React 트리에서 그리므로 맥락이 닿는다.
 * - 배치를 바꾸면 보드를 key 로 다시 마운트한다(편집 중이던 변경은 사라진다 — WidgetWorkspace 가 편집 상태를 밖으로 알리지 않는다).
 * 순수 로직은 layout-model.ts, 서버 호출은 layout-api.ts, 저장소 어댑터는 layout-store.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button, Spinner } from "@dk-oasis/shared/form";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";
import { useMessage } from "@dk-oasis/shared/message-provider";
import {
  WidgetWorkspace,
  mergeWidgetRegistry,
  toWidgetDefRow,
  type WidgetDefRow,
  type WidgetItem,
  type WidgetRegistry,
} from "@dk-oasis/shared/widget";

import { WIDGET_REGISTRY } from "@/lib/generated/widget-registry";
import { WIDGET_TYPE_REGISTRY } from "@/lib/generated/widget-type-registry";
import { notifyWidgetDefsChanged } from "@/lib/widget-defs-events";
import { WidgetBoardModeContext } from "@/lib/widget-board-mode";
import { HOME_DEFAULT_LAYOUT } from "@/page-components/home/home-layout";

import { DeptPicker } from "./DeptPicker";
import { deleteLayout, fetchWidgetDefRows, loadLayout, searchLayouts } from "./layout-api";
import {
  COMPANY_LAYOUT_KEY,
  addPendingDept,
  boardTitle,
  buildLayoutList,
  buildTypeTitles,
  deleteConfirmMessage,
  homeTabNameOf,
  layoutHelpText,
  prunePending,
  type LayoutListRow,
  type LayoutSummary,
  type LoadedLayout,
  type PendingDept,
} from "./layout-model";
import { createLayoutStore } from "./layout-store";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const BOARD_TEST_ID = "widget-layout-board";

/** 보드 위 도움말 — 홈과 기본 탭의 차이(색은 의미 토큰만). */
/** GridPanel 본문(`.grid-panel-content`)과 같은 상자 — 클래스를 쓰면 안쪽 그리드가 절대 배치로 바뀌므로 인라인으로 둔다. */
const BOARD_BODY_STYLE = { flex: 1, overflow: "hidden", minHeight: 0, position: "relative" } as const;

const HELP_STYLE = {
  margin: 0,
  color: "var(--color-text-secondary)",
  fontSize: "var(--font-size-sm)",
  lineHeight: 1.4,
} as const;

/** 부서 키의 「홈」 시작 배치 — 위 부서·전사를 복사하지 않고 빈 배치로 시작한다(복사하면 전사 탭과 위젯이 겹쳐 보인다). 안정 참조. */
const EMPTY_HOME_DEFAULT: readonly WidgetItem[] = [];

/**
 * 보드가 편집 모드인가 — WidgetWorkspace 는 편집 상태를 밖으로 알리지 않으므로 편집 모드에만 있는 [취소] 버튼(data-action="cancel-edit")으로 본다.
 * 다른 배치로 옮기면 보드가 다시 마운트되어 편집 중이던 변경이 사라지므로, 옮기기 전에 확인한다.
 */
const isBoardEditing = () =>
  typeof document !== "undefined" && document.querySelector(`[data-testid="${BOARD_TEST_ID}"] [data-action="cancel-edit"]`) != null;

const LIST_COLUMNS: GridColumn[] = [{ key: "label", header: "배치", meta: false, width: 100, minWidth: 160, align: "left" }];

/** 서랍이 정의 위젯 옆에 보이는 유형 이름 — 유형 등록부는 생성물이라 한 번만 만든다. */
const TYPE_TITLES = buildTypeTitles(WIDGET_TYPE_REGISTRY);

type DefsState = { status: "loading" | "ready" | "error"; rows: WidgetDefRow[] };

type BoardState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; layout: LoadedLayout };

interface LayoutBoardProps {
  layoutKey: string;
  rows: readonly LayoutListRow[];
  registry: WidgetRegistry;
  registryStatus: "ready" | "error";
  onRetryRegistry: () => void;
  /** 저장이 끝났을 때 — 목록을 새로 받는다. 참조가 바뀌면 store 가 새로 만들어져 작업 공간이 다시 불러오므로 안정된 함수를 넘긴다. */
  onSaved: (layoutKey: string) => void;
}

/**
 * 한 키의 보드. 「홈」 배치(그 키의 행만, effective=N)를 먼저 받아 store 의 첫 load 에 넘기고, 기본 탭은 store 의 load 가 받는다. 키·재시도가 바뀌면 부모가 key 로 다시 마운트한다.
 */
function LayoutBoard({ layoutKey, rows, registry, registryStatus, onRetryRegistry, onSaved }: LayoutBoardProps) {
  const [state, setState] = useState<BoardState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loadLayout(layoutKey, "N").then(
      (layout) => {
        if (!cancelled) setState({ status: "ready", layout });
      },
      (e: unknown) => {
        if (!cancelled) setState({ status: "error", message: errorText(e) });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [layoutKey, attempt]);

  // store 참조는 배치를 받은 뒤 고정한다 — 바뀌면 WidgetWorkspace 가 다시 불러오며 편집 중인 변경이 사라진다.
  const store = useMemo(
    () =>
      state.status === "ready"
        ? createLayoutStore(layoutKey, state.layout, { onSaved })
        : null,
    [layoutKey, state, onSaved]
  );

  const retry = () => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  };

  if (state.status === "loading") return <Spinner label="배치를 불러오는 중..." />;
  if (state.status === "error" || !store) {
    return (
      <>
        {/* 서버 문구는 길 수 있어 한 줄 알약(Badge) 대신 줄바꿈되는 글로 보인다. */}
        <div className="form-error-message" role="alert" data-testid="widget-layout-error">
          {state.status === "error" ? state.message : "배치를 불러오지 못했습니다."}
        </div>
        <Button onClick={retry}>다시 시도</Button>
      </>
    );
  }

  const isCompany = layoutKey === COMPANY_LAYOUT_KEY;
  return (
    <>
      <p style={HELP_STYLE} data-testid="widget-layout-help">
        {layoutHelpText()}
      </p>
      <WidgetBoardModeContext.Provider value="preview">
        <WidgetWorkspace
          mode="admin"
          registry={registry}
          homeDefault={isCompany ? HOME_DEFAULT_LAYOUT : EMPTY_HOME_DEFAULT}
          homeTabName={homeTabNameOf(layoutKey, rows)}
          store={store}
          typeTitles={TYPE_TITLES}
          registryStatus={registryStatus}
          onRetryRegistry={onRetryRegistry}
          testId={BOARD_TEST_ID}
        />
      </WidgetBoardModeContext.Provider>
    </>
  );
}

export function LayoutTab() {
  const { showMessage } = useMessage();
  const [summaries, setSummaries] = useState<LayoutSummary[]>([]);
  const [pending, setPending] = useState<readonly PendingDept[]>([]);
  const [listBusy, setListBusy] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [selectedKey, setSelectedKey] = useState(COMPANY_LAYOUT_KEY);
  /** 올리면 보드를 다시 마운트한다(지운 뒤 새로 고침). */
  const [boardNonce, setBoardNonce] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [defs, setDefs] = useState<DefsState>({ status: "loading", rows: [] });
  const listSeq = useRef(0);
  const defsSeq = useRef(0);

  /** 목록을 받는다. 처음 조회는 listBusy 초기값(true)이 이미 로딩을 보이므로 상태를 동기적으로 건드리지 않는다. */
  const loadList = useCallback(() => {
    const seq = ++listSeq.current;
    return searchLayouts().then(
      (next) => {
        if (seq !== listSeq.current) return;
        setSummaries(next);
        setPending((prev) => prunePending(prev, next));
        setListBusy(false);
      },
      (e: unknown) => {
        if (seq !== listSeq.current) return;
        showMessage({ title: "오류", message: errorText(e), alertType: "error" });
        setListBusy(false);
      }
    );
  }, [showMessage]);

  /** 저장·삭제 뒤 목록 새로 고침. */
  const refreshList = useCallback(() => {
    setListBusy(true);
    return loadList();
  }, [loadList]);

  const handleBoardSaved = useCallback(() => {
    notifyWidgetDefsChanged();
    void refreshList();
  }, [refreshList]);

  const fetchDefs = useCallback(() => {
    const seq = ++defsSeq.current;
    return fetchWidgetDefRows()
      .then((raw) => raw.map(toWidgetDefRow).filter((r): r is WidgetDefRow => r != null))
      .then(
        (rows) => {
          if (seq === defsSeq.current) setDefs({ status: "ready", rows });
        },
        () => {
          // 코드 등록부만으로 보드를 마운트하고 registryStatus="error" 로 편집을 막는다(띠의 [다시 시도] → retryDefs).
          if (seq === defsSeq.current) setDefs({ status: "error", rows: [] });
        }
      );
  }, []);

  const retryDefs = useCallback(() => {
    setDefs({ status: "loading", rows: [] });
    void fetchDefs();
  }, [fetchDefs]);

  useEffect(() => {
    void loadList();
    void fetchDefs();
    return () => {
      // 늦게 온 응답이 언마운트된 화면에 상태를 쓰지 않게 한다.
      listSeq.current += 1;
      defsSeq.current += 1;
    };
  }, [loadList, fetchDefs]);

  const registry = useMemo(() => mergeWidgetRegistry(WIDGET_REGISTRY, WIDGET_TYPE_REGISTRY, defs.rows), [defs.rows]);
  const rows = useMemo(() => buildLayoutList(summaries, pending), [summaries, pending]);
  // 선택한 키가 목록에서 사라지면(저장 전 부서 정리 등) 늘 있는 전사로 돌아간다.
  const selected = rows.find((r) => r.layoutKey === selectedKey) ?? rows[0];

  /** 다른 배치로 옮긴다 — 보드를 편집 중이면 변경이 사라진다고 먼저 묻는다. */
  const moveTo = useCallback(
    (key: string) => {
      if (key === selected.layoutKey) return;
      if (!isBoardEditing()) {
        setSelectedKey(key);
        return;
      }
      showMessage({
        title: "확인",
        message: "배치 편집 중입니다. 저장하지 않은 변경은 사라집니다. 다른 배치로 이동하시겠습니까?",
        alertType: "confirm",
        onConfirm: () => setSelectedKey(key),
      });
    },
    [selected.layoutKey, showMessage]
  );

  const handleRowClick = useCallback(
    (row: Record<string, unknown>) => {
      moveTo(String(row.layoutKey));
    },
    [moveTo]
  );

  const handlePickDept = useCallback(
    (dept: { deptCd: string; deptNm: string }) => {
      setPending((prev) => addPendingDept(prev, summaries, dept));
      moveTo(dept.deptCd);
    },
    [summaries, moveTo]
  );

  const handleDelete = useCallback(() => {
    if (!selected.saved) return;
    const key = selected.layoutKey;
    // 편집 중인 보드는 지운 뒤 다시 마운트되어 편집 내용도 사라진다.
    const editingNote = isBoardEditing() ? " 편집 중인 변경도 사라집니다." : "";
    showMessage({
      title: "확인",
      message: `${deleteConfirmMessage(key, rows)}${editingNote}`,
      alertType: "confirm",
      onConfirm: async () => {
        setDeleting(true);
        try {
          await deleteLayout(key);
          notifyWidgetDefsChanged();
          showMessage({ message: "삭제되었습니다.", alertType: "success", toast: true });
          setPending((prev) => prev.filter((p) => p.layoutKey !== key));
          // 부서 배치를 지우면 그 줄이 목록에서 사라지므로 전사로 옮기고, 보드는 새로 마운트해 지운 뒤의 배치를 다시 받는다.
          setSelectedKey(COMPANY_LAYOUT_KEY);
          setBoardNonce((n) => n + 1);
          await refreshList();
        } catch (e) {
          showMessage({ title: "오류", message: errorText(e), alertType: "error" });
        } finally {
          setDeleting(false);
        }
      },
    });
  }, [selected, rows, showMessage, refreshList]);

  return (
    <>
      <ContentBody root resizable storageKey="mcm.csa.commWidgetMng.layout">
        <ContentPanel width={200} minSize={160}>
          <GridPanel
            title="배치 목록"
            count={rows.length}
            loading={listBusy || deleting}
            buttons={[{ id: "btn_dept_add", label: "부서 추가", onClick: () => setPickerOpen(true) }]}
          >
            <AgDataGrid
              gridId="layoutList"
              rowKey="layoutKey"
              columns={LIST_COLUMNS}
              data={rows}
              columnSizing="fit"
              highlightedRowKey={selected.layoutKey}
              onRowClick={handleRowClick}
              loading={listBusy}
            />
          </GridPanel>
        </ContentPanel>

        <ContentPanel minSize={320}>
          {/*
            보드는 GridPanel 안에 넣지 않는다 — GridPanel 안의 AgDataGrid 는 `.grid-panel-content .cm-data-grid` 규칙으로 패널 영역을 절대 배치로 덮고
            설정 메뉴·엑셀 단추를 패널 머리줄로 올려, 보드의 그리드 위젯(쿼리 표 등)이 제목 줄·조건줄·N행·그리드 설정 아이콘을 잃는다.
            머리줄 모양만 GridPanel 과 같은 클래스를 쓰고 본문은 `grid-panel-content` 없이 같은 상자로 둔다.
          */}
          <div className="grid-panel" data-testid="widget-layout-board-panel">
            <div className="grid-panel-header">
              <div className="grid-panel-title">
                <span>{boardTitle(selected.layoutKey, rows)}</span>
              </div>
              <div className="grid-panel-header-actions">
                <div className="grid-panel-buttons">
                  <button
                    id="btn_layout_delete"
                    type="button"
                    className="grid-btn"
                    onClick={handleDelete}
                    disabled={!selected.saved || deleting}
                  >
                    기본 배치 지우기
                  </button>
                </div>
              </div>
            </div>
            <div style={BOARD_BODY_STYLE}>
              {defs.status === "loading" ? (
                <Spinner label="위젯 정의를 불러오는 중..." />
              ) : (
                <LayoutBoard
                  key={`${selected.layoutKey}:${boardNonce}`}
                  layoutKey={selected.layoutKey}
                  rows={rows}
                  registry={registry}
                  registryStatus={defs.status}
                  onRetryRegistry={retryDefs}
                  onSaved={handleBoardSaved}
                />
              )}
            </div>
          </div>
        </ContentPanel>
      </ContentBody>

      <DeptPicker open={pickerOpen} onPick={handlePickDept} onClose={() => setPickerOpen(false)} />
    </>
  );
}
