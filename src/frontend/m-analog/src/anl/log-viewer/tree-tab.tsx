"use client";

/**
 * 로그 분석 (anl/logViewer) — Tree 탭.
 * JSON 탭과 같은 GET log/range/time/tree 응답을 서비스 실행 트리로 보여 준다.
 * 위쪽 요약 줄 / 왼쪽 실행 트리(도구 막대·가상 스크롤) / 오른쪽 속성 패널 / 쿼리 뷰어(떠 있는 창).
 * 탭이 숨겨져도 마운트를 유지하므로(doc-tabs.tsx) 쿼리 뷰어 창은 active 일 때만 연다.
 */

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, copyText } from "@dk-oasis/shared/form";
import { FloatingPanel } from "@dk-oasis/shared/floating-panel";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { SqlCodeEditor } from "@dk-oasis/shared/code-editor";
import {
  allExpandable,
  bindParams,
  clampPropsWidth,
  clampTreeCol,
  defaultExpanded,
  findNode,
  firstSelection,
  flattenRows,
  formatRunTime,
  formatTimestamp,
  heatLevel,
  MSG_GROUP,
  parseTreeCols,
  PROPS_WIDTH_DEFAULT,
  propRowsOf,
  propsGridHeight,
  toTreeRequests,
  TREE_COL_DEFAULT,
  TREE_COL_KEYS,
  type PropGridRow,
  type TreeColKey,
  type TreeCols,
  type TreeRow,
} from "./tree-model";

const ROW_HEIGHT = 26;
const OVERSCAN = 8;
const VIEWER_STORAGE_KEY = "analog-log-viewer:tree-query-viewer";
const PROPS_WIDTH_KEY = "analog-log-viewer:tree-props-width";
const TREE_COLS_KEY = "analog-log-viewer:tree-cols";
const SPLIT_KEY_STEP = 16;
const COL_KEY_STEP = 16;
const COL_HEADERS: Record<TreeColKey, string> = { svc: "서비스", start: "시작일시", time: "실행시간" };
const VIEWER_DEFAULT_RECT = { x: 160, y: 200, width: 480, height: 380 };

interface TreeTabProps {
  data: unknown;
  /** 이 탭이 보이는 중인지 — 떠 있는 쿼리 뷰어 창을 이때만 연다. */
  active: boolean;
  /** 쿼리 뷰어 「Binder 탭으로 보내기」 — SQL 을 Binder 에 채우고 탭을 전환하는 것은 상위가 한다. */
  onSendToBinder: (sql: string) => void;
}

/** 배지 클래스 — 모르는 종류(원문 objectType)는 기본 모양. */
function badgeClass(kind: string): string {
  return `anl-tree-badge anl-tree-badge-${/^[A-Z]{3}$/.test(kind) ? kind : "other"}`;
}

function RunTimeCell({ runTime, className }: { runTime: number | undefined; className?: string }) {
  if (runTime === undefined) return <span className={className} />;
  return <span className={`${className ?? ""} anl-tree-heat-${heatLevel(runTime)}`.trim()}>{formatRunTime(runTime)}</span>;
}

interface TreeRowViewProps {
  row: TreeRow;
  selected: boolean;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}

const TreeRowView = memo(function TreeRowView({ row, selected, onToggle, onSelect }: TreeRowViewProps) {
  const { node, depth, open, hasKids, forced } = row;
  const isGroup = node.kind === MSG_GROUP;
  const dim = isGroup || node.kind === "MSG" || node.kind === "BND";
  const cls = ["anl-tree-label", node.hasError && node.kind !== "REQ" ? "anl-tree-label-error" : "", dim ? "anl-tree-label-dim" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={`anl-tree-row ${selected ? "anl-tree-row-selected" : ""}`.trim()}
      role="treeitem"
      aria-selected={selected}
      aria-expanded={hasKids ? open : undefined}
    >
      <div className="anl-tree-cell" style={{ paddingLeft: depth * 20 + 4 }}>
        {hasKids ? (
          <button
            type="button"
            className="anl-tree-toggle"
            aria-label={`${open ? "접기" : "펼치기"}: ${node.label}`}
            disabled={forced}
            onClick={() => onToggle(node.id)}
          >
            {open ? "−" : "+"}
          </button>
        ) : (
          <span className="anl-tree-toggle-gap" aria-hidden="true" />
        )}
        {/* 표식 칸은 표식이 없어도 같은 폭으로 둔다 — 같은 단계의 배지가 표식 유무로 밀리지 않게. */}
        <span className="anl-tree-marks">
          {node.subMark ? (
            <span className="anl-tree-mark anl-tree-mark-sub" title="서브서비스 호출" aria-label="서브서비스 호출">
              S
            </span>
          ) : null}
          {node.errorMark ? (
            <span className="anl-tree-mark anl-tree-mark-err" title="오류(Exception) 있음" aria-label="오류(Exception) 있음">
              !
            </span>
          ) : null}
          {node.queryMark ? (
            <span className="anl-tree-mark anl-tree-mark-query" title="쿼리 있음" aria-label="쿼리 있음">
              ?
            </span>
          ) : null}
        </span>
        <span className={badgeClass(isGroup ? "MSG" : node.kind)}>{isGroup ? "MSG" : node.kind}</span>
        {isGroup ? <span className="anl-tree-group-count">×{node.children.length}</span> : null}
        <button type="button" className={cls} title={node.label} onClick={() => onSelect(node.id)}>
          {node.label}
        </button>
      </div>
      <span className="anl-tree-start">{node.startMs !== undefined ? formatTimestamp(node.startMs) : ""}</span>
      <RunTimeCell runTime={node.runTime} className="anl-tree-time" />
    </div>
  );
});

/** 속성 표 열 — 가로 비율 1 : 2.4, 사용자가 머리 경계를 끌어 바꾸면 gridId 로 저장된다(컬럼 개인화). */
const PROP_COLUMNS: GridColumn[] = [
  { key: "key", header: "속성", width: 110, meta: false, sortable: false },
  {
    key: "value",
    header: "값",
    width: 260,
    meta: false,
    sortable: false,
    render: (_v, row) => {
      const r = row as unknown as PropGridRow;
      if (r.runTime !== undefined) return <RunTimeCell runTime={r.runTime} className="anl-tree-mono anl-tree-time-chip" />;
      return r.mono ? <span className="anl-tree-mono">{r.value}</span> : <span>{r.value}</span>;
    },
  },
];
const PROP_PERSONALIZE = { sort: false } as const;

/** 속성 패널 폭을 localStorage 에서 읽는다(막히거나 값이 이상하면 기본값). */
function readPropsWidth(): number {
  try {
    const n = Number(window.localStorage.getItem(PROPS_WIDTH_KEY));
    return Number.isFinite(n) && n > 0 ? n : PROPS_WIDTH_DEFAULT;
  } catch {
    return PROPS_WIDTH_DEFAULT;
  }
}

function writePropsWidth(width: number) {
  try {
    window.localStorage.setItem(PROPS_WIDTH_KEY, String(width));
  } catch {
    /* 저장소를 못 쓰면 이번 세션 폭만 유지한다. */
  }
}

/** 트리 칸 폭을 localStorage 에서 읽는다(막히거나 값이 이상하면 기본 폭). */
function readTreeCols(): TreeCols {
  try {
    return parseTreeCols(window.localStorage.getItem(TREE_COLS_KEY));
  } catch {
    return { ...TREE_COL_DEFAULT };
  }
}

function writeTreeCols(cols: TreeCols) {
  try {
    window.localStorage.setItem(TREE_COLS_KEY, JSON.stringify(cols));
  } catch {
    /* 저장소를 못 쓰면 이번 세션 폭만 유지한다. */
  }
}

function TreeTabComponent({ data, active, onSendToBinder }: TreeTabProps) {
  const requests = useMemo(() => toTreeRequests(data), [data]);
  const [requestIdx, setRequestIdx] = useState(0);
  const request = requests[Math.min(requestIdx, requests.length - 1)];
  const root = request?.root;

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [errOnly, setErrOnly] = useState(false);
  const [bizOnly, setBizOnly] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerBound, setViewerBound] = useState(false);
  const deferredQuery = useDeferredValue(query);

  // 속성 패널 폭 — 트리와 속성 사이 막대를 끌어 바꾼다. 마지막 값은 브라우저에 저장한다.
  const splitRef = useRef<HTMLDivElement>(null);
  const [propsWidth, setPropsWidth] = useState(PROPS_WIDTH_DEFAULT);
  const propsWidthRef = useRef(propsWidth);
  propsWidthRef.current = propsWidth;
  useEffect(() => setPropsWidth(readPropsWidth()), []);
  const splitTotal = () => splitRef.current?.clientWidth ?? 0;
  const onSplitPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = propsWidthRef.current;
    let latest = startW;
    const onMove = (ev: PointerEvent) => {
      // 막대를 왼쪽으로 끌수록 속성 패널이 넓어진다.
      latest = clampPropsWidth(startW + (startX - ev.clientX), splitTotal());
      setPropsWidth(latest);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      writePropsWidth(latest);
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  const onSplitKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = clampPropsWidth(propsWidthRef.current + (e.key === "ArrowLeft" ? SPLIT_KEY_STEP : -SPLIT_KEY_STEP), splitTotal());
    setPropsWidth(next);
    writePropsWidth(next);
  };
  const onSplitReset = () => {
    setPropsWidth(PROPS_WIDTH_DEFAULT);
    writePropsWidth(PROPS_WIDTH_DEFAULT);
  };

  // 트리 칸 폭(서비스·시작일시·실행시간) — 머리 칸 오른쪽 손잡이를 끌어 바꾼다.
  // 끄는 동안에는 컨테이너의 CSS 변수만 바꾸고(행은 다시 그리지 않는다), 놓을 때 state·저장소에 반영한다.
  const gridRef = useRef<HTMLDivElement>(null);
  const headWrapRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState<TreeCols>(() => ({ ...TREE_COL_DEFAULT }));
  const colsRef = useRef(cols);
  colsRef.current = cols;
  const [resizingCol, setResizingCol] = useState<TreeColKey | null>(null);
  useEffect(() => setCols(readTreeCols()), []);
  const applyColVar = (key: TreeColKey, width: number) => gridRef.current?.style.setProperty(`--anl-col-${key}`, `${width}px`);
  const commitCols = (next: TreeCols) => {
    setCols(next);
    writeTreeCols(next);
  };
  const onColPointerDown = (key: TreeColKey) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = colsRef.current[key];
    let latest = startW;
    setResizingCol(key);
    const onMove = (ev: PointerEvent) => {
      latest = clampTreeCol(key, startW + (ev.clientX - startX));
      applyColVar(key, latest);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setResizingCol(null);
      commitCols({ ...colsRef.current, [key]: latest });
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  const onColKeyDown = (key: TreeColKey) => (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = clampTreeCol(key, colsRef.current[key] + (e.key === "ArrowRight" ? COL_KEY_STEP : -COL_KEY_STEP));
    commitCols({ ...colsRef.current, [key]: next });
  };
  const onColReset = (key: TreeColKey) => () => commitCols({ ...colsRef.current, [key]: TREE_COL_DEFAULT[key] });
  const colVars = {
    "--anl-col-svc": `${cols.svc}px`,
    "--anl-col-start": `${cols.start}px`,
    "--anl-col-time": `${cols.time}px`,
  } as React.CSSProperties;

  useEffect(() => setRequestIdx(0), [data]);
  // 새 조회 결과(또는 다른 Request)로 바뀌면 펼침·선택을 처음 상태로 되돌린다.
  useEffect(() => {
    setExpanded(defaultExpanded(root));
    setSelectedId(firstSelection(root)?.id ?? null);
    setViewerOpen(false);
    setErrOnly(false);
    setQuery("");
  }, [root]);

  const rows = useMemo(
    () => flattenRows(root, expanded, { query: deferredQuery, errOnly, bizOnly }),
    [root, expanded, deferredQuery, errOnly, bizOnly],
  );

  // 가상 스크롤 — 보이는 구간 행만 그린다.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(520);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight || 520));
    ro.observe(el);
    return () => ro.disconnect();
  }, [root]);
  // 행 구성이 바뀌거나(검색·필터·새 조회) 탭이 다시 보이면 스크롤 위치를 실제 값에 맞춘다.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
    setScrollTop(0);
  }, [root, deferredQuery, errOnly, bizOnly]);
  useEffect(() => {
    if (active) setScrollTop(scrollRef.current?.scrollTop ?? 0);
  }, [active]);
  // 머리줄은 본문과 가로 스크롤을 맞추고, 본문 세로 스크롤바 폭만큼 오른쪽을 비워 끝이 어긋나지 않게 한다.
  const syncHead = useCallback((el: HTMLDivElement) => {
    const head = headWrapRef.current;
    if (!head) return;
    head.scrollLeft = el.scrollLeft;
    head.style.paddingRight = `${el.offsetWidth - el.clientWidth}px`;
  }, []);
  const onScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      setScrollTop(e.currentTarget.scrollTop);
      syncHead(e.currentTarget);
    },
    [syncHead],
  );
  useEffect(() => {
    if (scrollRef.current) syncHead(scrollRef.current);
  }, [rows, cols, viewportH, syncHead]);

  const start = Math.min(Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN), Math.max(0, rows.length - 1));
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + OVERSCAN);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  const select = useCallback((id: string) => setSelectedId(id), []);

  const selected = selectedId ? findNode(root, selectedId) : undefined;
  const isQuery = selected?.kind === "SQL";
  const params = selected?.params ?? [];
  const viewerText = isQuery
    ? viewerBound
      ? bindParams(selected.sql ?? "", params)
      : (selected.sql ?? "")
    : "";
  const propRows = useMemo(() => (selected ? propRowsOf(selected) : []), [selected]);
  const selectedText = selected?.text;
  const isGroupSel = selected?.kind === MSG_GROUP;
  const groupMsgs = isGroupSel ? (selected?.children ?? []) : [];

  if (!request || !root) {
    return <div className="anl-tree-empty">Tree 로 볼 데이터가 없습니다. 「JSON」 조회나 서비스 목록의 「트리」를 눌러 주세요.</div>;
  }

  return (
    <div className="anl-tree-pane">
      <div className="anl-tree-summary">
        <span className="anl-tree-summary-name">{request.name}</span>
        {request.serviceTag ? (
          <span className="anl-tree-muted">
            태그 {request.serviceTag}
            {request.thread ? ` · ${request.thread}` : ""}
          </span>
        ) : null}
        <span className="anl-tree-muted anl-tree-mono">
          {request.start}
          {request.end ? ` ~ ${request.end}` : ""}
        </span>
        {request.runTime !== undefined ? (
          <span className={`anl-tree-chip anl-tree-heat-${heatLevel(request.runTime)}`}>{formatRunTime(request.runTime)}</span>
        ) : null}
        <span className="anl-tree-muted">
          SQL {request.sqlCount} · MSG {request.msgCount}
        </span>
        {request.errorCount > 0 ? <span className="anl-tree-chip anl-tree-chip-error">오류 {request.errorCount}</span> : null}
        {requests.length > 1 ? (
          <select
            className="anl-tree-request-select"
            aria-label="Request 선택"
            value={requestIdx}
            onChange={(e) => setRequestIdx(Number(e.target.value))}
          >
            {requests.map((r, i) => (
              <option key={r.root.id} value={i}>
                {`${i + 1}/${requests.length} ${r.name} ${r.serviceTag}`.trim()}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <div ref={splitRef} className="anl-tree-split">
        <section className="anl-tree-left" aria-label="실행 트리">
          <div className="anl-tree-toolbar">
            <Input
              type="search"
              className="anl-tree-search"
              value={query}
              onChange={setQuery}
              placeholder="트리 검색 (이름 · SQL · 메시지)"
              aria-label="트리 검색"
            />
            <Button size="sm" onClick={() => setExpanded(allExpandable(root))}>
              모두 펼치기
            </Button>
            <Button size="sm" onClick={() => setExpanded(new Set([root.id]))}>
              모두 접기
            </Button>
            <Button size="sm" variant={bizOnly ? "primary" : "default"} aria-pressed={bizOnly} onClick={() => setBizOnly((v) => !v)}>
              SQL·업무 노드만
            </Button>
            {request.errorCount > 0 ? (
              <Button size="sm" variant={errOnly ? "danger" : "default"} aria-pressed={errOnly} onClick={() => setErrOnly((v) => !v)}>
                오류 경로만
              </Button>
            ) : null}
          </div>
          <div ref={gridRef} className="anl-tree-grid" style={colVars}>
          <div ref={headWrapRef} className="anl-tree-head-wrap">
            <div className="anl-tree-head">
              {TREE_COL_KEYS.map((key) => (
                <div key={key} className={`anl-tree-head-cell ${key === "time" ? "anl-tree-head-right" : ""}`.trim()}>
                  {COL_HEADERS[key]}
                  <div
                    className={`anl-tree-colresize ${resizingCol === key ? "anl-tree-colresize-active" : ""}`.trim()}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`${COL_HEADERS[key]} 칸 폭 조절`}
                    tabIndex={0}
                    title="드래그하여 폭 조절 · 더블클릭하면 기본 폭"
                    onPointerDown={onColPointerDown(key)}
                    onKeyDown={onColKeyDown(key)}
                    onDoubleClick={onColReset(key)}
                  />
                </div>
              ))}
            </div>
          </div>
          <div ref={scrollRef} className="anl-tree-scroll" role="tree" aria-label="서비스 실행 트리" onScroll={onScroll}>
            <div style={{ height: rows.length * ROW_HEIGHT, position: "relative", minWidth: "var(--anl-col-total)" }}>
              <div style={{ position: "absolute", top: start * ROW_HEIGHT, left: 0, right: 0 }}>
                {rows.slice(start, end).map((row) => (
                  <TreeRowView
                    key={row.node.id}
                    row={row}
                    selected={row.node.id === selectedId}
                    onToggle={toggle}
                    onSelect={select}
                  />
                ))}
              </div>
              {rows.length === 0 ? <div className="anl-tree-empty-inline">일치하는 노드가 없습니다.</div> : null}
            </div>
          </div>
          </div>
        </section>
        <div
          className="content-split-bar content-split-bar--row anl-tree-splitbar"
          role="separator"
          aria-orientation="vertical"
          aria-label="속성 패널 폭 조절"
          tabIndex={0}
          title="드래그하여 속성 패널 폭 조절 · 더블클릭하면 기본 폭"
          onPointerDown={onSplitPointerDown}
          onKeyDown={onSplitKeyDown}
          onDoubleClick={onSplitReset}
        >
          <div className="content-split-bar__grip" />
        </div>
        <section className="anl-tree-right" aria-label="속성" style={{ width: propsWidth }}>
          <div className="anl-tree-right-head">
            <span className="anl-tree-right-title">속성</span>
            {selected ? (
              <span className={badgeClass(isGroupSel ? "MSG" : selected.kind)}>{isGroupSel ? "MSG" : selected.kind}</span>
            ) : null}
          </div>
          {/* 속성·Time·Param 은 짧은 이름-값 짝이라 표(AgDataGrid) 한 장으로, 줄바꿈이 필요한 긴 글은 아래 상세 영역이 맡는다. */}
          <div className="anl-tree-props-grid" style={{ height: propsGridHeight(propRows.length) }}>
            <AgDataGrid
              columns={PROP_COLUMNS}
              data={propRows as unknown as Record<string, unknown>[]}
              rowKey="id"
              columnSizing="fit"
              header={false}
              settingsMenu={false}
              excelExport={false}
              sortable={false}
              gridId="anl-tree-props"
              personalize={PROP_PERSONALIZE}
              emptyMessage="선택한 노드가 없습니다."
              ariaLabel="속성"
            />
          </div>
          {selected && (selectedText !== undefined || isGroupSel || isQuery) ? (
            <div className="anl-tree-detail">
              {selectedText !== undefined ? (
                <>
                  <div className="anl-tree-section">Message</div>
                  <pre className={`anl-tree-message ${selected.kind === "ERR" ? "anl-tree-error-text" : ""}`.trim()}>{selectedText}</pre>
                </>
              ) : null}
              {isGroupSel ? (
                <>
                  <div className="anl-tree-section">첫 메시지</div>
                  <pre className="anl-tree-message">{groupMsgs[0]?.text}</pre>
                  <div className="anl-tree-section">마지막 메시지</div>
                  <pre className="anl-tree-message">{groupMsgs[groupMsgs.length - 1]?.text}</pre>
                  <div className="anl-tree-section">전체 메시지</div>
                  <ol className="anl-tree-msg-list">
                    {groupMsgs.map((m) => (
                      <li key={m.id}>{m.text}</li>
                    ))}
                  </ol>
                </>
              ) : null}
              {isQuery ? (
                <>
                  <div className="anl-tree-section">SQL</div>
                  <div className="anl-tree-sql-box">
                    <SqlCodeEditor
                      value={selected.sql ?? ""}
                      readOnly
                      expandable={false}
                      height={140}
                      ariaLabel="SQL"
                      testId="anl-tree-sql"
                    />
                    <div className="anl-tree-actions">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          setViewerBound(false);
                          setViewerOpen(true);
                        }}
                      >
                        쿼리 보기
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setViewerBound(true);
                          setViewerOpen(true);
                        }}
                      >
                        값 바인딩 보기
                      </Button>
                    </div>
                    {params.length === 0 ? <div className="anl-tree-muted anl-tree-no-params">바인딩 값 없음</div> : null}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
      <FloatingPanel
        title="쿼리 뷰어"
        open={active && viewerOpen && isQuery}
        onClose={() => setViewerOpen(false)}
        storageKey={VIEWER_STORAGE_KEY}
        defaultRect={VIEWER_DEFAULT_RECT}
        minWidth={320}
        minHeight={220}
        testId="anl-tree-query-viewer"
      >
        <div className="anl-tree-viewer">
          <div className="anl-tree-viewer-bar" role="group" aria-label="보기 방식">
            <Button size="sm" variant={viewerBound ? "default" : "primary"} aria-pressed={!viewerBound} onClick={() => setViewerBound(false)}>
              원문
            </Button>
            <Button size="sm" variant={viewerBound ? "primary" : "default"} aria-pressed={viewerBound} onClick={() => setViewerBound(true)}>
              값 바인딩
            </Button>
          </div>
          <div className="anl-tree-viewer-editor">
            <SqlCodeEditor
              value={viewerText}
              readOnly
              expandable={false}
              bordered={false}
              height="100%"
              ariaLabel="쿼리 뷰어"
              testId="anl-tree-viewer-editor"
            />
          </div>
          <div className="anl-tree-viewer-foot">
            <Button size="sm" onClick={() => void copyText(viewerText)}>
              복사
            </Button>
            <Button size="sm" variant="primary" onClick={() => onSendToBinder(viewerText)}>
              Binder 탭으로 보내기
            </Button>
          </div>
        </div>
      </FloatingPanel>
    </div>
  );
}

export const TreeTab = memo(TreeTabComponent);
